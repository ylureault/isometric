// Room Manager: complete server-side room state management (hardened)

const CONSTANTS = require('../shared/constants');
const Environments = require('../client/js/environments');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this._cleanupTimers = new Map(); // roomId -> timeoutId for empty room cleanup

    // Periodic sweep: clean up stale rooms, disconnected zombies, orphaned timers
    this._sweepInterval = setInterval(() => this._periodicSweep(), CONSTANTS.ROOM_CLEANUP_INTERVAL);
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

      // Remove truly empty rooms older than cleanup timeout
      if (room.participants.size === 0 && (now - room.createdAt > CONSTANTS.EMPTY_ROOM_CLEANUP_TIMEOUT)) {
        this._destroyRoom(roomId);
      }
    }
  }

  _destroyRoom(roomId) {
    const timerId = this._cleanupTimers.get(roomId);
    if (timerId) {
      clearTimeout(timerId);
      this._cleanupTimers.delete(roomId);
    }
    this.rooms.delete(roomId);
  }

  _scheduleRoomCleanup(roomId) {
    const existing = this._cleanupTimers.get(roomId);
    if (existing) clearTimeout(existing);

    const tid = setTimeout(() => {
      this._cleanupTimers.delete(roomId);
      const r = this.rooms.get(roomId);
      if (r && r.participants.size === 0) {
        this._destroyRoom(roomId);
      }
    }, CONSTANTS.EMPTY_ROOM_CLEANUP_TIMEOUT);

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
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  joinRoom(roomId, socketId, data) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    if (room.closed) return { error: 'room_closed' };
    if (room.participants.size >= CONSTANTS.MAX_PARTICIPANTS) return { error: 'room_full' };

    this._cancelRoomCleanup(roomId);

    const pseudo = (data.pseudo || '').toString().trim().slice(0, 30) || 'Anonyme';
    let isCreator = !!(data.isCreator && !room.creatorSocketId);

    if (!isCreator && room.creatorSocketId) {
      const oldCreator = room.participants.get(room.creatorSocketId);
      if (oldCreator && oldCreator.disconnected && oldCreator.pseudo === pseudo) {
        room.participants.delete(room.creatorSocketId);
        room.creatorSocketId = socketId;
        isCreator = true;
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

  kickParticipant(roomId, requesterId, targetId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    const target = room.participants.get(targetId);
    if (!requester || !target) return { error: 'participant_not_found' };
    if (!requester.isAdmin) return { error: 'not_admin' };
    if (target.role === 'creator') return { error: 'cannot_kick_creator' };
    if (requesterId === targetId) return { error: 'cannot_kick_self' };
    return { success: true, participant: target };
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
    if (typeof furnitureData.rotation === 'number') item.rotation = furnitureData.rotation;
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

  // Cleanup on shutdown
  destroy() {
    if (this._sweepInterval) {
      clearInterval(this._sweepInterval);
      this._sweepInterval = null;
    }
    for (const [, tid] of this._cleanupTimers) {
      clearTimeout(tid);
    }
    this._cleanupTimers.clear();
  }
}

module.exports = new RoomManager();
