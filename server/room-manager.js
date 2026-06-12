// Room Manager: complete server-side room state management (hardened)

const crypto = require('crypto');
const CONSTANTS = require('../shared/constants');
const Environments = require('../client/js/environments');
const Persistence = require('./persistence');

// Constant-time string comparison to avoid timing side-channels on the creator token.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

class RoomManager {
  constructor(opts) {
    opts = opts || {};
    this.rooms = new Map();
    this._cleanupTimers = new Map(); // roomId -> timeoutId for empty room cleanup

    // Durable storage. Disabled under test (NODE_ENV=test) so the suite stays
    // hermetic; enabled in normal runs so rooms survive restarts and long gaps.
    const persistEnabled = opts.persist != null
      ? opts.persist
      : process.env.NODE_ENV !== 'test' && process.env.PERSIST !== 'off';
    this.persistence = new Persistence({ enabled: persistEnabled, dir: opts.persistDir });

    // Rehydrate previously saved rooms (so a URL still works weeks later).
    if (this.persistence.enabled) {
      for (const snap of this.persistence.loadAll()) {
        try {
          const room = this._hydrate(snap);
          if (room) this.rooms.set(room.id, room);
        } catch (e) {
          console.error('[room-manager] failed to hydrate room', snap && snap.id, e.message);
        }
      }
      // Autosave active rooms so a crash loses at most a few seconds of work.
      this._autosaveInterval = setInterval(() => this._autosave(), 15000);
      if (this._autosaveInterval.unref) this._autosaveInterval.unref();
    }

    // Periodic sweep: clean up stale rooms, disconnected zombies, orphaned timers
    this._sweepInterval = setInterval(() => this._periodicSweep(), CONSTANTS.ROOM_CLEANUP_INTERVAL);
  }

  // --- Persistence: snapshot / hydrate ---

  // Build a plain, durable snapshot of a room (drops live/socket-bound state).
  _snapshot(room) {
    const tables = [];
    for (const [, t] of room.tables) {
      tables.push({ id: t.id, name: t.name, x: t.x, y: t.y, width: t.width, height: t.height, shape: t.shape });
    }
    const whiteboards = [];
    for (const [, wb] of room.whiteboards) {
      whiteboards.push({
        id: wb.id, x: wb.x, y: wb.y, radius: wb.radius, tableId: wb.tableId,
        strokes: wb.strokes || [], texts: wb.texts || [], postits: wb.postits || [],
      });
    }
    const tableNotes = [];
    for (const [tid, n] of room.tableNotes) tableNotes.push([tid, n]);
    const themePresets = [];
    for (const [name, t] of room.themePresets) themePresets.push([name, t]);
    const subRooms = [];
    if (room.subRooms) {
      for (const [, sr] of room.subRooms) {
        subRooms.push({ id: sr.id, name: sr.name, x: sr.x, y: sr.y, width: sr.width, height: sr.height });
      }
    }
    return {
      id: room.id, name: room.name, environment: room.environment, gridSize: room.gridSize,
      format: room.format || null,
      creatorToken: room.creatorToken, inviteCode: room.inviteCode, password: room.password,
      theme: room.theme, themePresets, furniture: room.furniture || [],
      tables, tableNotes, whiteboards, subRooms,
      audioRadius: room.audioRadius, stats: room.stats, closed: room.closed, locked: room.locked,
      createdAt: room.createdAt,
      nextTableId: room.nextTableId, nextWhiteboardId: room.nextWhiteboardId,
      nextVoteId: room.nextVoteId, nextTimerId: room.nextTimerId, nextJoinOrder: room.nextJoinOrder,
      savedAt: Date.now(),
    };
  }

  // Rebuild a full in-memory room from a snapshot (empty live state).
  _hydrate(snap) {
    if (!snap || !snap.id) return null;
    const room = {
      id: snap.id,
      name: snap.name || 'Room',
      environment: snap.environment || 'open-space',
      gridSize: snap.gridSize || CONSTANTS.GRID_DEFAULT,
      format: snap.format || null,
      creatorSocketId: null,
      creatorToken: snap.creatorToken || crypto.randomBytes(16).toString('hex'),
      participants: new Map(),
      tables: new Map(),
      furniture: Array.isArray(snap.furniture) ? snap.furniture : [],
      theme: snap.theme || { floorColor1: null, floorColor2: null, bgColor: '#0a0a1a', glowColor: '#7eb8da', mode: 'dark', preset: null },
      themePresets: new Map(snap.themePresets || []),
      activeScreenShare: null,
      whiteboards: new Map(),
      votes: new Map(),
      timers: new Map(),
      tableNotes: new Map(snap.tableNotes || []),
      raisedHands: new Map(),
      collabSpaces: new Map(),
      subRooms: new Map(),
      chatHistory: [],
      closed: !!snap.closed,
      locked: !!snap.locked,
      createdAt: snap.createdAt || Date.now(),
      nextTableId: snap.nextTableId || 1,
      nextWhiteboardId: snap.nextWhiteboardId || 1,
      nextVoteId: snap.nextVoteId || 1,
      nextTimerId: snap.nextTimerId || 1,
      nextJoinOrder: snap.nextJoinOrder || 1,
      password: snap.password || null,
      inviteCode: snap.inviteCode || this._generateInviteCode(),
      audioRadius: snap.audioRadius || CONSTANTS.AUDIO_RADIUS,
      stats: snap.stats || { messagesSent: 0, reactionsCount: 0, timeActive: Date.now() },
    };
    for (const t of (snap.tables || [])) {
      room.tables.set(t.id, { id: t.id, name: t.name, x: t.x, y: t.y, width: t.width, height: t.height, shape: t.shape, participants: new Set() });
    }
    for (const wb of (snap.whiteboards || [])) {
      room.whiteboards.set(wb.id, {
        id: wb.id, x: wb.x, y: wb.y, radius: wb.radius, tableId: wb.tableId,
        strokes: wb.strokes || [], texts: wb.texts || [], postits: wb.postits || [],
        activeUsers: new Set(),
      });
    }
    for (const sr of (snap.subRooms || [])) {
      room.subRooms.set(sr.id, { id: sr.id, name: sr.name, x: sr.x, y: sr.y, width: sr.width, height: sr.height, participants: new Set() });
    }
    return room;
  }

  _persist(roomId) {
    if (!this.persistence.enabled) return;
    this.persistence.save(roomId, () => {
      const r = this.rooms.get(roomId);
      return r ? this._snapshot(r) : null;
    });
  }

  // Save every room that currently has people in it (called on an interval).
  _autosave() {
    for (const [roomId, room] of this.rooms) {
      if (room.participants.size > 0) this._persist(roomId);
    }
  }

  flush() {
    if (!this.persistence.enabled) return;
    for (const [roomId, room] of this.rooms) {
      if (room.participants.size > 0) {
        this.persistence._writeNow(roomId, () => this._snapshot(room));
      }
    }
    this.persistence.flushAll();
  }

  // --- Periodic maintenance ---
  _periodicSweep() {
    const now = Date.now();
    for (const [roomId, room] of this.rooms) {
      // Clean up zombie disconnected participants (older than 2x the reconnect timeout)
      for (const [sid, p] of room.participants) {
        if (p.disconnected && p.disconnectedAt && (now - p.disconnectedAt > CONSTANTS.DISCONNECTED_CLEANUP_TIMEOUT * 2)) {
          this.leaveRoom(roomId, sid);
        }
      }

      // Clean up orphaned timers (running but room is empty or very old)
      for (const [timerId, timer] of room.timers) {
        if (timer.running && !timer.paused) {
          const elapsed = (now - timer.startedAt) / 1000;
          if (elapsed > timer.duration + 60) {
            timer.running = false;
          }
        }
      }

      // Clean up stale votes
      for (const [voteId, vote] of room.votes) {
        if (vote.active && (now - vote.createdAt > (vote.duration + 300) * 1000)) {
          vote.active = false;
        }
      }

      // Reclaim empty collab spaces and sub-rooms (otherwise they leak forever)
      if (room.collabSpaces) {
        for (const [spaceId, space] of room.collabSpaces) {
          if (space.users.size === 0 && space.screens.size === 0) {
            room.collabSpaces.delete(spaceId);
          }
        }
      }
      if (room.subRooms) {
        for (const [subRoomId, sr] of room.subRooms) {
          if (sr.participants.size === 0) {
            room.subRooms.delete(subRoomId);
          }
        }
      }

      // Evict truly empty rooms from memory (snapshot kept on disk)
      if (room.participants.size === 0 && (now - room.createdAt > CONSTANTS.EMPTY_ROOM_CLEANUP_TIMEOUT)) {
        this._evictRoom(roomId);
      }
    }
  }

  // Optional hook fired right before a room is removed, so the transport layer
  // (index.js) can clear any setInterval/setTimeout it owns for that room.
  setDestroyHook(fn) {
    this._onDestroy = typeof fn === 'function' ? fn : null;
  }

  // Evict an empty room from memory but KEEP its durable snapshot on disk, so a
  // returning participant (even weeks later) gets the room back via lazy-load.
  _evictRoom(roomId) {
    const room = this.rooms.get(roomId);
    const timerId = this._cleanupTimers.get(roomId);
    if (timerId) {
      clearTimeout(timerId);
      this._cleanupTimers.delete(roomId);
    }
    if (room && this._onDestroy) {
      try { this._onDestroy(room); } catch (e) { /* never let a hook break cleanup */ }
    }
    // Persist a final snapshot before dropping it from memory.
    if (room && this.persistence.enabled) {
      this.persistence._writeNow(roomId, () => this._snapshot(room));
    }
    this.rooms.delete(roomId);
  }

  // Permanently delete a room: from memory AND from disk (used by closeRoom).
  _destroyRoom(roomId) {
    const room = this.rooms.get(roomId);
    const timerId = this._cleanupTimers.get(roomId);
    if (timerId) {
      clearTimeout(timerId);
      this._cleanupTimers.delete(roomId);
    }
    if (room && this._onDestroy) {
      try { this._onDestroy(room); } catch (e) { /* never let a hook break cleanup */ }
    }
    this.rooms.delete(roomId);
    this.persistence.remove(roomId);
  }

  _scheduleRoomCleanup(roomId) {
    const existing = this._cleanupTimers.get(roomId);
    if (existing) clearTimeout(existing);

    const tid = setTimeout(() => {
      this._cleanupTimers.delete(roomId);
      const r = this.rooms.get(roomId);
      if (r && r.participants.size === 0) {
        this._evictRoom(roomId);
      }
    }, CONSTANTS.EMPTY_ROOM_CLEANUP_TIMEOUT);
    if (tid.unref) tid.unref();

    this._cleanupTimers.set(roomId, tid);
  }

  _cancelRoomCleanup(roomId) {
    const existing = this._cleanupTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this._cleanupTimers.delete(roomId);
    }
  }

  createRoom(roomId, config) {
    if (this.rooms.has(roomId)) return null;
    if (this.rooms.size >= CONSTANTS.MAX_ROOMS) return null;

    const name = (config.name || 'Room').toString().trim().slice(0, 60) || 'Room';
    const environment = CONSTANTS.ENVIRONMENTS.includes(config.environment) ? config.environment : 'open-space';
    const gridSize = Math.min(CONSTANTS.GRID_MAX, Math.max(CONSTANTS.GRID_MIN, parseInt(config.gridSize) || CONSTANTS.GRID_DEFAULT));

    // Generate invite code (improvement #20)
    const inviteCode = this._generateInviteCode();

    const room = {
      id: roomId,
      name,
      environment,
      gridSize,
      creatorSocketId: null,
      creatorToken: crypto.randomBytes(16).toString('hex'), // secret proof of creator identity
      participants: new Map(),
      tables: new Map(),
      furniture: [],
      theme: {
        floorColor1: null,
        floorColor2: null,
        bgColor: '#0a0a1a',
        glowColor: '#7eb8da',
        mode: 'dark',
        preset: null,
      },
      themePresets: new Map(), // improvement #11: named theme presets
      activeScreenShare: null,
      whiteboards: new Map(),
      votes: new Map(),
      timers: new Map(),
      tableNotes: new Map(),
      raisedHands: new Map(),
      chatHistory: [], // improvement #18: limited chat history
      locked: false, // salle verrouillée : on n'entre plus (le créateur passe)
      closed: false,
      createdAt: Date.now(),
      nextTableId: 1,
      nextWhiteboardId: 1,
      nextVoteId: 1,
      nextTimerId: 1,
      nextJoinOrder: 1, // improvement #23: participant join order
      password: (typeof config.password === 'string' && config.password.length > 0) ? config.password : null, // improvement #2
      inviteCode, // improvement #20
      audioRadius: CONSTANTS.AUDIO_RADIUS, // improvement #24: configurable audio radius
      stats: { messagesSent: 0, reactionsCount: 0, timeActive: Date.now() }, // improvement #10
      format: (typeof config.format === 'string') ? config.format : (config.environment || null),
    };

    this.rooms.set(roomId, room);
    this._persist(roomId);
    return room;
  }

  getRoom(roomId) {
    let room = this.rooms.get(roomId);
    if (room) return room;
    // Lazy-load an evicted room from its durable snapshot (e.g. a returning user).
    if (this.persistence.enabled && typeof roomId === 'string') {
      const snap = this._readSnapshot(roomId);
      if (snap) {
        room = this._hydrate(snap);
        if (room) { this.rooms.set(roomId, room); return room; }
      }
    }
    return null;
  }

  _readSnapshot(roomId) {
    try {
      const fs = require('fs');
      const file = this.persistence._file(roomId);
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  joinRoom(roomId, socketId, data) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    if (room.closed) return { error: 'room_closed' };
    if (room.locked && !(data.creatorToken && data.creatorToken === room.creatorToken)) {
      return { error: 'room_locked' };
    }
    // Improvement #2: password protection
    if (room.password && !data.isCreator) {
      if (!data.password || data.password !== room.password) {
        return { error: 'invalid_password' };
      }
    }
    if (room.participants.size >= CONSTANTS.MAX_PARTICIPANTS) return { error: 'room_full' };

    this._cancelRoomCleanup(roomId);

    const pseudo = (data.pseudo || '').toString().trim().slice(0, 30) || 'Anonyme';
    let isCreator = !!(data.isCreator && !room.creatorSocketId);

    // Creator reconnection: only the holder of the secret creatorToken can reclaim
    // the creator slot. Pseudo matching alone is NOT trusted (anyone can copy a pseudo).
    if (!isCreator && data.creatorToken && safeEqual(data.creatorToken, room.creatorToken)) {
      if (!room.creatorSocketId) {
        // Slot is free (server restart or room rehydrated from disk) — token wins.
        isCreator = true;
      } else {
        const oldCreator = room.participants.get(room.creatorSocketId);
        if (oldCreator && oldCreator.disconnected) {
          room.participants.delete(room.creatorSocketId);
          room.creatorSocketId = socketId;
          isCreator = true;
        }
      }
    }

    const defaultColors = CONSTANTS.DEFAULT_COLORS;
    let colors = defaultColors;
    if (data.colors && typeof data.colors === 'object') {
      colors = {};
      for (const key of ['skin', 'hair', 'shirt', 'pants', 'shoes']) {
        const val = data.colors[key];
        colors[key] = (typeof val === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(val)) ? val : defaultColors[key];
      }
    }

    const accessory = (typeof data.accessory === 'string' && data.accessory.length <= 30) ? data.accessory : 'none';

    const gs = room.gridSize;
    const x = (typeof data.x === 'number' && isFinite(data.x)) ? Math.max(0, Math.min(gs - 0.5, data.x)) : Math.floor(gs / 2);
    const y = (typeof data.y === 'number' && isFinite(data.y)) ? Math.max(0, Math.min(gs - 0.5, data.y)) : Math.floor(gs / 2);

    const participant = {
      socketId,
      pseudo,
      colors,
      accessory,
      x,
      y,
      direction: { dx: 0, dy: 1 },
      isWalking: false,
      walkPhase: 0,
      role: isCreator ? 'creator' : 'participant',
      isAdmin: isCreator,
      isMuted: false,
      isSpeaking: false,
      tableId: null,
      handRaised: false,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      lastAction: Date.now(), // improvement #9: activity tracking
      joinOrder: room.nextJoinOrder++, // improvement #23: join order
      disconnected: false,
    };

    if (isCreator) room.creatorSocketId = socketId;
    room.participants.set(socketId, participant);

    return {
      participant,
      room: this.getRoomInfo(roomId),
      participants: this.getParticipantsList(roomId),
      tables: this.getTablesList(roomId),
      theme: room.theme,
      chat: room.chatHistory.slice(-50),
      // Only the creator receives the token; it proves identity on reconnection.
      creatorToken: isCreator ? room.creatorToken : undefined,
    };
  }

  leaveRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const participant = room.participants.get(socketId);
    if (!participant) return null;

    if (participant.tableId) {
      const table = room.tables.get(participant.tableId);
      if (table) table.participants.delete(socketId);
    }

    room.raisedHands.delete(socketId);

    if (room.activeScreenShare && room.activeScreenShare.socketId === socketId) {
      room.activeScreenShare = null;
    }

    // Clean up whiteboard active users
    for (const [, wb] of room.whiteboards) {
      wb.activeUsers.delete(socketId);
    }

    // Clean up collab spaces
    if (room.collabSpaces) {
      for (const [, space] of room.collabSpaces) {
        space.users.delete(socketId);
        space.screens.delete(socketId);
      }
    }

    // Clean up sub-rooms
    if (room.subRooms) {
      for (const [, sr] of room.subRooms) {
        sr.participants.delete(socketId);
      }
    }

    room.participants.delete(socketId);

    if (room.participants.size === 0) {
      this._scheduleRoomCleanup(roomId);
    }

    return participant;
  }

  markDisconnected(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const p = room.participants.get(socketId);
    if (!p) return null;
    p.disconnected = true;
    p.disconnectedAt = Date.now();
    return p;
  }

  markReconnected(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const p = room.participants.get(socketId);
    if (!p) return null;
    p.disconnected = false;
    p.disconnectedAt = null;
    p.lastSeen = Date.now();
    return p;
  }

  updatePosition(roomId, socketId, data) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const p = room.participants.get(socketId);
    if (!p) return null;

    const gs = room.gridSize || 100;
    if (typeof data.x === 'number' && isFinite(data.x)) {
      p.x = Math.max(0, Math.min(gs - 0.5, data.x));
    }
    if (typeof data.y === 'number' && isFinite(data.y)) {
      p.y = Math.max(0, Math.min(gs - 0.5, data.y));
    }

    if (data.direction && typeof data.direction === 'object') {
      const dx = Number(data.direction.dx);
      const dy = Number(data.direction.dy);
      if (isFinite(dx) && isFinite(dy)) {
        p.direction = { dx: Math.max(-1, Math.min(1, dx)), dy: Math.max(-1, Math.min(1, dy)) };
      }
    }

    p.isWalking = !!data.isWalking;
    p.walkPhase = (typeof data.walkPhase === 'number' && isFinite(data.walkPhase)) ? data.walkPhase : 0;
    p.lastSeen = Date.now();
    p.lastAction = Date.now(); // improvement #9

    const tableResult = this.updateTableAssociation(roomId, socketId);
    return tableResult;
  }

  getRoomInfo(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return {
      id: room.id,
      name: room.name,
      environment: room.environment,
      gridSize: room.gridSize,
      participantCount: room.participants.size,
      maxParticipants: CONSTANTS.MAX_PARTICIPANTS,
      createdAt: room.createdAt, // improvement #25
      hasPassword: !!room.password, // improvement #2
      inviteCode: room.inviteCode, // improvement #20
      audioRadius: room.audioRadius, // improvement #24
    };
  }

  getParticipantsList(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    const list = [];
    for (const [sid, p] of room.participants) {
      list.push({
        socketId: sid,
        pseudo: p.pseudo,
        colors: p.colors,
        accessory: p.accessory || 'none',
        x: p.x,
        y: p.y,
        direction: p.direction,
        isWalking: p.isWalking,
        walkPhase: p.walkPhase,
        role: p.role,
        isAdmin: p.isAdmin,
        isMuted: p.isMuted,
        tableId: p.tableId,
        handRaised: p.handRaised,
        disconnected: p.disconnected,
        joinOrder: p.joinOrder, // improvement #23
        lastAction: p.lastAction, // improvement #9
      });
    }
    return list;
  }

  findSpawnPosition(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return { x: 10, y: 10 };
    const center = Math.floor(room.gridSize / 2);
    const occupied = new Set();
    for (const [, p] of room.participants) {
      occupied.add(`${Math.floor(p.x)},${Math.floor(p.y)}`);
    }
    const maxRadius = Math.min(room.gridSize, 20);
    for (let radius = 0; radius < maxRadius; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const x = center + dx;
          const y = center + dy;
          if (x >= 1 && x < room.gridSize - 1 && y >= 1 && y < room.gridSize - 1) {
            if (!occupied.has(`${x},${y}`) && !Environments.isSolidAt(room.environment, room.gridSize, x, y)) {
              return { x: x + 0.5, y: y + 0.5 };
            }
          }
        }
      }
    }
    return { x: center + 0.5, y: center + 0.5 };
  }

  // ===== ADMIN =====

  promoteAdmin(roomId, requesterId, targetId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    const target = room.participants.get(targetId);
    if (!requester || !target) return { error: 'participant_not_found' };
    if (!requester.isAdmin) return { error: 'not_admin' };
    if (target.isAdmin) return { error: 'already_admin' };
    target.isAdmin = true;
    return { success: true, pseudo: target.pseudo };
  }

  demoteAdmin(roomId, requesterId, targetId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    const target = room.participants.get(targetId);
    if (!requester || !target) return { error: 'participant_not_found' };
    if (requester.role !== 'creator') return { error: 'not_creator' };
    if (target.role === 'creator') return { error: 'cannot_demote_creator' };
    target.isAdmin = false;
    return { success: true, pseudo: target.pseudo };
  }

  kickParticipant(roomId, requesterId, targetId, reason) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    const target = room.participants.get(targetId);
    if (!requester || !target) return { error: 'participant_not_found' };
    if (!requester.isAdmin) return { error: 'not_admin' };
    if (target.role === 'creator') return { error: 'cannot_kick_creator' };
    if (requesterId === targetId) return { error: 'cannot_kick_self' };
    // Improvement #3: custom kick reason
    const kickReason = (typeof reason === 'string' && reason.length > 0) ? reason.slice(0, 200) : 'Exclu par un administrateur';
    return { success: true, participant: target, reason: kickReason };
  }

  closeRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    if (room.creatorSocketId !== socketId) return { error: 'not_creator' };
    room.closed = true;
    return { success: true };
  }

  // ===== TABLES =====

  createTable(roomId, requesterId, tableData) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (room.tables.size >= CONSTANTS.MAX_TABLES_PER_ROOM) return { error: 'too_many_tables' };

    const gs = room.gridSize;
    const tableId = `table_${room.nextTableId++}`;
    const table = {
      id: tableId,
      name: (tableData.name || `Table ${room.nextTableId - 1}`).toString().slice(0, 50),
      x: Math.max(0, Math.min(gs - 1, Number(tableData.x) || 0)),
      y: Math.max(0, Math.min(gs - 1, Number(tableData.y) || 0)),
      width: Math.max(1, Math.min(10, parseInt(tableData.width) || 3)),
      height: Math.max(1, Math.min(10, parseInt(tableData.height) || 3)),
      radius: Math.max(1, Math.min(15, Number(tableData.radius) || 3)),
      participants: new Set(),
      screenShare: null,
    };
    room.tables.set(tableId, table);
    room.tableNotes.set(tableId, { content: '', lastUpdated: Date.now() });
    return { success: true, table: this.serializeTable(table) };
  }

  renameTable(roomId, requesterId, tableId, newName) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    const table = room.tables.get(tableId);
    if (!table) return { error: 'table_not_found' };
    if (typeof newName !== 'string') return { error: 'invalid_name' };
    table.name = newName.toString().trim().slice(0, 50);
    return { success: true };
  }

  deleteTable(roomId, requesterId, tableId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    const table = room.tables.get(tableId);
    if (!table) return { error: 'table_not_found' };

    for (const sid of table.participants) {
      const p = room.participants.get(sid);
      if (p) p.tableId = null;
    }
    room.tables.delete(tableId);
    room.tableNotes.delete(tableId);
    return { success: true, affectedParticipants: [...table.participants] };
  }

  moveTable(roomId, requesterId, tableId, newX, newY) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    const table = room.tables.get(tableId);
    if (!table) return { error: 'table_not_found' };
    const gs = room.gridSize;
    table.x = Math.max(0, Math.min(gs - 1, Number(newX) || 0));
    table.y = Math.max(0, Math.min(gs - 1, Number(newY) || 0));
    return { success: true };
  }

  updateTableAssociation(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const p = room.participants.get(socketId);
    if (!p) return;

    let closestTable = null;
    let closestDist = Infinity;

    for (const [, table] of room.tables) {
      const cx = table.x + table.width / 2;
      const cy = table.y + table.height / 2;
      const dist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
      if (dist < table.radius && dist < closestDist) {
        closestDist = dist;
        closestTable = table;
      }
    }

    const newTableId = closestTable ? closestTable.id : null;

    if (newTableId !== p.tableId) {
      const oldTableId = p.tableId;
      if (p.tableId) {
        const oldTable = room.tables.get(p.tableId);
        if (oldTable) oldTable.participants.delete(socketId);
      }
      if (closestTable) {
        closestTable.participants.add(socketId);
      }
      p.tableId = newTableId;
      return { changed: true, oldTableId, newTableId, socketId };
    }
    return { changed: false };
  }

  getTablesList(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    const list = [];
    for (const [, table] of room.tables) {
      list.push(this.serializeTable(table));
    }
    return list;
  }

  serializeTable(table) {
    return {
      id: table.id,
      name: table.name,
      x: table.x,
      y: table.y,
      width: table.width,
      height: table.height,
      radius: table.radius,
      participantCount: table.participants.size,
      participants: [...table.participants],
    };
  }

  // ===== THEME =====

  updateTheme(roomId, requesterId, themeData) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };

    const allowedKeys = ['floorColor1', 'floorColor2', 'bgColor', 'glowColor', 'mode', 'preset'];
    for (const key of allowedKeys) {
      if (themeData[key] !== undefined) {
        const val = themeData[key];
        if (val === null || (typeof val === 'string' && val.length <= 60)) {
          room.theme[key] = val;
        }
      }
    }
    return { success: true, theme: room.theme };
  }

  // ===== ENVIRONMENT =====

  changeEnvironment(roomId, requesterId, newEnv) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (typeof newEnv !== 'string' || newEnv.length > 50) return { error: 'invalid_environment' };
    room.environment = newEnv;
    return { success: true };
  }

  resizeGrid(roomId, requesterId, newSize) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };

    const size = Math.min(CONSTANTS.GRID_MAX, Math.max(CONSTANTS.GRID_MIN, parseInt(newSize) || CONSTANTS.GRID_DEFAULT));
    const oldSize = room.gridSize;
    room.gridSize = size;

    const repositioned = [];
    for (const [sid, p] of room.participants) {
      if (p.x >= size || p.y >= size) {
        p.x = Math.min(p.x, size - 1);
        p.y = Math.min(p.y, size - 1);
        repositioned.push(sid);
      }
    }
    return { success: true, newSize: size, oldSize, repositioned };
  }

  // ===== FURNITURE =====

  addFurniture(roomId, requesterId, furnitureData) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (room.furniture.length >= CONSTANTS.MAX_FURNITURE_PER_ROOM) return { error: 'too_many_furniture' };

    const gs = room.gridSize;
    const id = `furn_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    const item = {
      id,
      type: (typeof furnitureData.type === 'string') ? furnitureData.type.slice(0, 50) : 'unknown',
      x: Math.max(0, Math.min(gs - 1, Number(furnitureData.x) || 0)),
      y: Math.max(0, Math.min(gs - 1, Number(furnitureData.y) || 0)),
    };
    // Zones dessinées par l'admin : dimensions personnalisées bornées
    if (furnitureData.width !== undefined) {
      item.width = Math.max(1, Math.min(14, parseInt(furnitureData.width) || 1));
    }
    if (furnitureData.height !== undefined) {
      item.height = Math.max(1, Math.min(14, parseInt(furnitureData.height) || 1));
    }
    // Improvement #6: validate rotation to 0/90/180/270
    if (furnitureData.rotation !== undefined) {
      const rot = parseInt(furnitureData.rotation) || 0;
      item.rotation = [0, 90, 180, 270].includes(rot) ? rot : 0;
    } else {
      item.rotation = 0;
    }
    if (typeof furnitureData.variant === 'string') item.variant = furnitureData.variant.slice(0, 50);
    if (typeof furnitureData.label === 'string') item.label = furnitureData.label.slice(0, 100);
    if (typeof furnitureData.linkedDoorId === 'string') item.linkedDoorId = furnitureData.linkedDoorId.slice(0, 100);
    if (typeof furnitureData.doorLabel === 'string') item.doorLabel = furnitureData.doorLabel.slice(0, 100);
    if (typeof furnitureData.whiteboardId === 'string') item.whiteboardId = furnitureData.whiteboardId.slice(0, 100);

    room.furniture.push(item);
    return { success: true, item };
  }

  removeFurniture(roomId, requesterId, furnitureId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (typeof furnitureId !== 'string') return { error: 'invalid_id' };
    room.furniture = room.furniture.filter(f => f.id !== furnitureId);
    return { success: true };
  }

  // ===== WHITEBOARD =====

  createWhiteboard(roomId, requesterId, data) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (room.whiteboards.size >= CONSTANTS.MAX_WHITEBOARDS_PER_ROOM) return { error: 'too_many_whiteboards' };

    const id = `wb_${room.nextWhiteboardId++}`;
    const wb = {
      id,
      x: Number(data.x) || 0,
      y: Number(data.y) || 0,
      radius: Math.max(1, Math.min(20, Number(data.radius) || 3)),
      tableId: (typeof data.tableId === 'string') ? data.tableId : null,
      strokes: [],
      texts: [],
      postits: [],
      activeUsers: new Set(),
    };
    room.whiteboards.set(id, wb);
    return { success: true, whiteboard: this.serializeWhiteboard(wb) };
  }

  deleteWhiteboard(roomId, requesterId, wbId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    room.whiteboards.delete(wbId);
    return { success: true };
  }

  getOrCreateWhiteboard(room, wbId) {
    if (typeof wbId !== 'string' || wbId.length > 100) return null;
    let wb = room.whiteboards.get(wbId);
    if (!wb) {
      if (room.whiteboards.size >= CONSTANTS.MAX_WHITEBOARDS_PER_ROOM) return null;
      wb = {
        id: wbId, x: 0, y: 0, radius: 5, tableId: null,
        strokes: [], texts: [], postits: [], activeUsers: new Set(),
      };
      room.whiteboards.set(wbId, wb);
    }
    return wb;
  }

  addWhiteboardStroke(roomId, wbId, strokeData) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const wb = this.getOrCreateWhiteboard(room, wbId);
    if (!wb) return null;
    if (wb.strokes.length >= CONSTANTS.MAX_WB_STROKES) {
      wb.strokes = wb.strokes.slice(Math.floor(CONSTANTS.MAX_WB_STROKES * 0.1));
    }
    wb.strokes.push(strokeData);
    return strokeData;
  }

  addWhiteboardText(roomId, wbId, textData) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const wb = this.getOrCreateWhiteboard(room, wbId);
    if (!wb) return null;
    if (wb.texts.length >= CONSTANTS.MAX_WB_TEXTS) return null;
    wb.texts.push(textData);
    return textData;
  }

  addWhiteboardPostit(roomId, wbId, postitData) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const wb = this.getOrCreateWhiteboard(room, wbId);
    if (!wb) return null;
    const existing = wb.postits.findIndex(p => p.id === postitData.id);
    if (existing >= 0) {
      wb.postits[existing] = postitData;
    } else {
      if (wb.postits.length >= CONSTANTS.MAX_WB_POSTITS) return null;
      wb.postits.push(postitData);
    }
    return postitData;
  }

  undoWhiteboardStroke(roomId, wbId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const wb = this.getOrCreateWhiteboard(room, wbId);
    if (!wb) return null;
    for (let i = wb.strokes.length - 1; i >= 0; i--) {
      if (wb.strokes[i].socketId === socketId) {
        wb.strokes.splice(i, 1);
        return { index: i };
      }
    }
    return null;
  }

  clearWhiteboard(roomId, requesterId, wbId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    const wb = this.getOrCreateWhiteboard(room, wbId);
    if (!wb) return { error: 'whiteboard_not_found' };
    wb.strokes = [];
    wb.texts = [];
    wb.postits = [];
        this._persist(roomId);
        this._persist(roomId);
        this._persist(roomId);
        this._persist(roomId);
    return { success: true };
  }

  serializeWhiteboard(wb) {
    return {
      id: wb.id,
      x: wb.x,
      y: wb.y,
      radius: wb.radius,
      tableId: wb.tableId,
      strokeCount: wb.strokes.length,
      activeUserCount: wb.activeUsers.size,
    };
  }

  // ===== VOTES =====

  createVote(roomId, requesterId, voteData) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (room.votes.size >= CONSTANTS.MAX_VOTES_PER_ROOM) return { error: 'too_many_votes' };

    if (!voteData.question || typeof voteData.question !== 'string') return { error: 'invalid_question' };
    if (!Array.isArray(voteData.options) || voteData.options.length < 2 || voteData.options.length > 20) return { error: 'invalid_options' };

    const id = `vote_${room.nextVoteId++}`;
    const vote = {
      id,
      question: voteData.question.toString().slice(0, 300),
      options: voteData.options.map(o => ({ text: (o || '').toString().slice(0, 100), votes: 0 })),
      anonymous: !!voteData.anonymous,
      scope: (voteData.scope === 'table') ? 'table' : 'global',
      tableId: (typeof voteData.tableId === 'string') ? voteData.tableId : null,
      voters: new Map(),
      active: true,
      duration: Math.max(5, Math.min(3600, parseInt(voteData.duration) || 60)),
      createdAt: Date.now(),
    };
    room.votes.set(id, vote);
    return { success: true, vote: this.serializeVote(vote) };
  }

  castVote(roomId, socketId, voteId, optionIndex) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    if (typeof voteId !== 'string') return { error: 'invalid_vote_id' };
    const vote = room.votes.get(voteId);
    if (!vote || !vote.active) return { error: 'vote_not_found' };
    if (vote.voters.has(socketId)) return { error: 'already_voted' };
    const idx = parseInt(optionIndex);
    if (!isFinite(idx) || idx < 0 || idx >= vote.options.length) return { error: 'invalid_option' };

    vote.options[idx].votes++;
    vote.voters.set(socketId, idx);
    return { success: true, results: this.serializeVote(vote) };
  }

  endVote(roomId, voteId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const vote = room.votes.get(voteId);
    if (!vote) return null;
    vote.active = false;
    return this.serializeVote(vote);
  }

  serializeVote(vote) {
    return {
      id: vote.id,
      question: vote.question,
      options: vote.options,
      anonymous: vote.anonymous,
      scope: vote.scope,
      tableId: vote.tableId,
      totalVoters: vote.voters.size,
      active: vote.active,
    };
  }

  // ===== TIMERS =====

  createTimer(roomId, requesterId, timerData) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (room.timers.size >= CONSTANTS.MAX_TIMERS_PER_ROOM) return { error: 'too_many_timers' };

    const duration = Math.max(5, Math.min(3600, Math.round(Number(timerData.duration) || 300)));
    const id = `timer_${room.nextTimerId++}`;
    const timer = {
      id,
      duration,
      remaining: duration,
      scope: (timerData.scope === 'table') ? 'table' : 'global',
      tableId: (typeof timerData.tableId === 'string') ? timerData.tableId : null,
      running: true,
      paused: false,
      startedAt: Date.now(),
    };
    room.timers.set(id, timer);
    return { success: true, timer };
  }

  pauseTimer(roomId, requesterId, timerId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (typeof timerId !== 'string') return { error: 'invalid_timer_id' };
    const timer = room.timers.get(timerId);
    if (!timer) return { error: 'not_found' };
    if (!timer.running) return { error: 'timer_not_running' };
    timer.paused = !timer.paused;
    if (timer.paused) {
      timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt) / 1000);
    } else {
      timer.startedAt = Date.now();
    }
    return { success: true, timer };
  }

  // ===== TABLE NOTES =====

  updateTableNotes(roomId, tableId, content) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (typeof tableId !== 'string') return null;
    const notes = room.tableNotes.get(tableId);
    if (!notes) return null;
    if (typeof content !== 'string') return null;
    notes.content = content.slice(0, CONSTANTS.MAX_TABLE_NOTES_LENGTH);
    notes.lastUpdated = Date.now();
    return notes;
  }

  getTableNotes(roomId, tableId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return room.tableNotes.get(tableId) || null;
  }

  // ===== RAISED HANDS =====

  toggleRaisedHand(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const p = room.participants.get(socketId);
    if (!p) return null;
    p.handRaised = !p.handRaised;
    if (p.handRaised) {
      room.raisedHands.set(socketId, { pseudo: p.pseudo, time: Date.now() });
    } else {
      room.raisedHands.delete(socketId);
    }
    return { handRaised: p.handRaised, pseudo: p.pseudo };
  }

  lowerAllHands(roomId, requesterId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    for (const [sid] of room.raisedHands) {
      const p = room.participants.get(sid);
      if (p) p.handRaised = false;
    }
    room.raisedHands.clear();
    return { success: true };
  }

  // ===== MUTE STATE =====

  setMuted(roomId, socketId, muted) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const p = room.participants.get(socketId);
    if (!p) return null;
    p.isMuted = !!muted;
    return { isMuted: p.isMuted };
  }

  // ===== CANCEL TIMER (improvement #1) =====

  cancelTimer(roomId, requesterId, timerId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (typeof timerId !== 'string') return { error: 'invalid_timer_id' };
    const timer = room.timers.get(timerId);
    if (!timer) return { error: 'not_found' };
    room.timers.delete(timerId);
    return { success: true };
  }

  // ===== ROOM NAME CHANGE (improvement #4) =====

  renameRoom(roomId, requesterId, newName) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (typeof newName !== 'string' || !newName.trim()) return { error: 'invalid_name' };
    room.name = newName.trim().slice(0, 60);
    return { success: true, name: room.name };
  }

  // ===== FURNITURE ROTATION (improvement #6) =====

  rotateFurniture(roomId, requesterId, furnitureId, rotation) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (typeof furnitureId !== 'string') return { error: 'invalid_id' };
    const item = room.furniture.find(f => f.id === furnitureId);
    if (!item) return { error: 'not_found' };
    // Only allow 0, 90, 180, 270
    const validRotations = [0, 90, 180, 270];
    const rot = parseInt(rotation) || 0;
    item.rotation = validRotations.includes(rot) ? rot : 0;
    return { success: true, item };
  }

  // ===== VOTE RESULTS EXPORT (improvement #8) =====

  exportVoteResults(roomId, voteId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const vote = room.votes.get(voteId);
    if (!vote) return null;
    return JSON.stringify({
      id: vote.id,
      question: vote.question,
      options: vote.options.map(o => ({ text: o.text, votes: o.votes })),
      totalVoters: vote.voters.size,
      active: vote.active,
      anonymous: vote.anonymous,
      createdAt: vote.createdAt,
    });
  }

  // ===== ROOM STATISTICS (improvement #10) =====

  getRoomStats(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return {
      messagesSent: room.stats.messagesSent,
      reactionsCount: room.stats.reactionsCount,
      timeActive: Date.now() - room.stats.timeActive,
      participantCount: room.participants.size,
      tableCount: room.tables.size,
      furnitureCount: room.furniture.length,
    };
  }

  incrementStat(roomId, statName) {
    const room = this.rooms.get(roomId);
    if (!room || !room.stats) return;
    if (typeof room.stats[statName] === 'number') {
      room.stats[statName]++;
    }
  }

  // ===== THEME PRESETS (improvement #11) =====

  saveThemePreset(roomId, requesterId, presetName, themeData) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (typeof presetName !== 'string' || !presetName.trim()) return { error: 'invalid_name' };
    const name = presetName.trim().slice(0, 30);
    if (room.themePresets.size >= 20) return { error: 'too_many_presets' };
    room.themePresets.set(name, { ...themeData });
    return { success: true, name };
  }

  loadThemePreset(roomId, requesterId, presetName) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    const preset = room.themePresets.get(presetName);
    if (!preset) return { error: 'preset_not_found' };
    // Apply preset to theme
    const allowedKeys = ['floorColor1', 'floorColor2', 'bgColor', 'glowColor', 'mode'];
    for (const key of allowedKeys) {
      if (preset[key] !== undefined) room.theme[key] = preset[key];
    }
    room.theme.preset = presetName;
    return { success: true, theme: room.theme };
  }

  // ===== GRID SNAP (improvement #12) — furniture coords snap to integer =====
  // Already handled by Math.max(0, Math.min(gs-1, Number(...) || 0)) in addFurniture
  // Adding explicit snap method for client use
  snapToGrid(x, y) {
    return { x: Math.round(x), y: Math.round(y) };
  }

  // ===== FURNITURE COLLISION (improvement #13) =====

  checkFurnitureCollision(room, x, y, type, excludeId) {
    const Envs = require('../client/js/environments');
    const def = Envs.furnitureTypes ? Envs.furnitureTypes[type] : null;
    const w = (def && def.width) || 1;
    const h = (def && def.height) || 1;
    for (const item of room.furniture) {
      if (excludeId && item.id === excludeId) continue;
      const idef = Envs.furnitureTypes ? Envs.furnitureTypes[item.type] : null;
      const iw = (idef && idef.width) || 1;
      const ih = (idef && idef.height) || 1;
      // AABB overlap check
      if (x < item.x + iw && x + w > item.x && y < item.y + ih && y + h > item.y) {
        return true; // collision
      }
    }
    return false;
  }

  // ===== UNDO FURNITURE PLACEMENT (improvement #14) =====
  // Server tracks last placed furniture per socket for undo

  undoLastFurniture(roomId, requesterId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    if (room.furniture.length === 0) return { error: 'nothing_to_undo' };
    const removed = room.furniture.pop();
    return { success: true, removedId: removed.id };
  }

  // ===== AUTO-PAUSE TIMER (improvement #16) =====

  checkTimerAutoPause(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const activeCount = [...room.participants.values()].filter(p => !p.disconnected).length;
    for (const [, timer] of room.timers) {
      if (timer.running && !timer.paused && activeCount === 0) {
        timer.paused = true;
        timer.autoPaused = true;
        timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt) / 1000);
      }
    }
  }

  checkTimerAutoResume(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const [, timer] of room.timers) {
      if (timer.running && timer.paused && timer.autoPaused) {
        timer.paused = false;
        timer.autoPaused = false;
        timer.startedAt = Date.now();
      }
    }
  }

  // ===== VOTE TIMER (improvement #17) =====
  // Votes already have a duration field; this adds explicit method
  isVoteExpired(roomId, voteId) {
    const room = this.rooms.get(roomId);
    if (!room) return true;
    const vote = room.votes.get(voteId);
    if (!vote || !vote.active) return true;
    const elapsed = (Date.now() - vote.createdAt) / 1000;
    return elapsed >= vote.duration;
  }

  // ===== CHAT HISTORY LIMIT (improvement #18) =====

  addChatMessage(roomId, socketId, text) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const p = room.participants.get(socketId);
    if (!p) return null;
    const msg = {
      socketId,
      pseudo: p.pseudo,
      text: (text || '').toString().trim().slice(0, 200),
      timestamp: Date.now(),
    };
    if (!msg.text) return null;
    room.chatHistory.push(msg);
    if (room.chatHistory.length > CONSTANTS.MAX_CHAT_MESSAGES_STORED) {
      room.chatHistory = room.chatHistory.slice(-CONSTANTS.MAX_CHAT_MESSAGES_STORED);
    }
    room.stats.messagesSent++;
    p.lastAction = Date.now();
    return msg;
  }

  // ===== ROOM INVITE CODE (improvement #20) =====

  _generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for clarity
    const bytes = crypto.randomBytes(CONSTANTS.INVITE_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CONSTANTS.INVITE_CODE_LENGTH; i++) {
      code += chars[bytes[i] % chars.length];
    }
    return code;
  }

  findRoomByInviteCode(code) {
    if (typeof code !== 'string') return null;
    const upper = code.toUpperCase().trim();
    for (const [roomId, room] of this.rooms) {
      if (room.inviteCode === upper && !room.closed) return roomId;
    }
    return null;
  }

  // ===== RAISED HANDS COUNT (improvement #21) =====

  getRaisedHandsCount(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    return room.raisedHands.size;
  }

  // ===== MUTE ALL (improvement #22) =====

  muteAll(roomId, requesterId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    const muted = [];
    for (const [sid, p] of room.participants) {
      if (sid !== requesterId) {
        p.isMuted = true;
        muted.push(sid);
      }
    }
    return { success: true, muted };
  }

  // ===== VERROUILLAGE DE SALLE =====

  setRoomLocked(roomId, requesterId, locked) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    room.locked = !!locked;
    this._persist(roomId);
    return { success: true, locked: room.locked };
  }

  // ===== STATUT / HUMEUR DU PARTICIPANT =====

  setParticipantStatus(roomId, socketId, status) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const p = room.participants.get(socketId);
    if (!p) return { error: 'not_in_room' };
    const clean = (typeof status === 'string') ? status.slice(0, 8) : '';
    p.status = clean || null;
    return { success: true, status: p.status };
  }

  // ===== CONFIGURABLE AUDIO RADIUS (improvement #24) =====

  setAudioRadius(roomId, requesterId, radius) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    const numRadius = typeof radius === 'number' && isFinite(radius) ? radius : CONSTANTS.AUDIO_RADIUS;
    const r = Math.max(CONSTANTS.AUDIO_RADIUS_MIN, Math.min(CONSTANTS.AUDIO_RADIUS_MAX, numRadius));
    room.audioRadius = r;
    return { success: true, audioRadius: r };
  }

  // ===== ROOM CREATION DATE (improvement #25) =====
  // Already stored as room.createdAt; this provides formatted access

  getRoomCreationDate(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return room.createdAt;
  }

  // Cleanup on shutdown
  destroy() {
    if (this._sweepInterval) {
      clearInterval(this._sweepInterval);
      this._sweepInterval = null;
    }
    if (this._autosaveInterval) {
      clearInterval(this._autosaveInterval);
      this._autosaveInterval = null;
    }
    for (const [, tid] of this._cleanupTimers) {
      clearTimeout(tid);
    }
    this._cleanupTimers.clear();
  }
}

const instance = new RoomManager();
instance.RoomManager = RoomManager; // expose class for isolated/persistence tests
module.exports = instance;
