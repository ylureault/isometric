// Room Manager: complete server-side room state management

const CONSTANTS = require('../shared/constants');
const Environments = require('../client/js/environments');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(roomId, config) {
    if (this.rooms.has(roomId)) return null;

    const room = {
      id: roomId,
      name: config.name || 'Room',
      environment: config.environment || 'open-space',
      gridSize: Math.min(CONSTANTS.GRID_MAX, Math.max(CONSTANTS.GRID_MIN, config.gridSize || CONSTANTS.GRID_DEFAULT)),
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
      activeScreenShare: null,
      whiteboards: new Map(),
      votes: new Map(),
      timers: new Map(),
      tableNotes: new Map(),
      raisedHands: new Map(),
      closed: false,
      createdAt: Date.now(),
      nextTableId: 1,
      nextWhiteboardId: 1,
      nextVoteId: 1,
      nextTimerId: 1,
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

    const isCreator = data.isCreator && !room.creatorSocketId;

    const participant = {
      socketId,
      pseudo: data.pseudo,
      colors: data.colors,
      accessory: data.accessory || 'none',
      x: data.x || Math.floor(room.gridSize / 2),
      y: data.y || Math.floor(room.gridSize / 2),
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

    // Clean up table association
    if (participant.tableId) {
      const table = room.tables.get(participant.tableId);
      if (table) table.participants.delete(socketId);
    }

    // Clean up raised hand
    room.raisedHands.delete(socketId);

    // Clean up screen share
    if (room.activeScreenShare && room.activeScreenShare.socketId === socketId) {
      room.activeScreenShare = null;
    }

    room.participants.delete(socketId);

    if (room.participants.size === 0) {
      setTimeout(() => {
        const r = this.rooms.get(roomId);
        if (r && r.participants.size === 0) this.rooms.delete(roomId);
      }, 60000);
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

    p.x = data.x;
    p.y = data.y;
    p.direction = data.direction;
    p.isWalking = data.isWalking;
    p.walkPhase = data.walkPhase;
    p.lastSeen = Date.now();

    // Check table proximity
    this.updateTableAssociation(roomId, socketId);

    return p;
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
    for (let radius = 0; radius < room.gridSize; radius++) {
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

    const tableId = `table_${room.nextTableId++}`;
    const table = {
      id: tableId,
      name: tableData.name || `Table ${room.nextTableId - 1}`,
      x: tableData.x,
      y: tableData.y,
      width: tableData.width || 3,
      height: tableData.height || 3,
      radius: tableData.radius || 3,
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
    table.name = newName;
    return { success: true };
  }

  deleteTable(roomId, requesterId, tableId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    const table = room.tables.get(tableId);
    if (!table) return { error: 'table_not_found' };

    // Remove participants from table
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
    table.x = newX;
    table.y = newY;
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
      // Leave old table
      if (p.tableId) {
        const oldTable = room.tables.get(p.tableId);
        if (oldTable) oldTable.participants.delete(socketId);
      }
      // Join new table
      if (closestTable) {
        closestTable.participants.add(socketId);
      }
      p.tableId = newTableId;
      return { changed: true, oldTableId: p.tableId, newTableId, socketId };
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
    Object.assign(room.theme, themeData);
    return { success: true, theme: room.theme };
  }

  // ===== ENVIRONMENT =====

  changeEnvironment(roomId, requesterId, newEnv) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    room.environment = newEnv;
    return { success: true };
  }

  resizeGrid(roomId, requesterId, newSize) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };

    const size = Math.min(CONSTANTS.GRID_MAX, Math.max(CONSTANTS.GRID_MIN, newSize));
    const oldSize = room.gridSize;
    room.gridSize = size;

    // Reposition out-of-bounds participants
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
    const id = `furn_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const item = { id, ...furnitureData };
    room.furniture.push(item);
    return { success: true, item };
  }

  removeFurniture(roomId, requesterId, furnitureId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };
    room.furniture = room.furniture.filter(f => f.id !== furnitureId);
    return { success: true };
  }

  // ===== WHITEBOARD =====

  createWhiteboard(roomId, requesterId, data) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const requester = room.participants.get(requesterId);
    if (!requester || !requester.isAdmin) return { error: 'not_admin' };

    const id = `wb_${room.nextWhiteboardId++}`;
    const wb = {
      id,
      x: data.x,
      y: data.y,
      radius: data.radius || 3,
      tableId: data.tableId || null,
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
    let wb = room.whiteboards.get(wbId);
    if (!wb) {
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
    wb.strokes.push(strokeData);
    return strokeData;
  }

  addWhiteboardText(roomId, wbId, textData) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const wb = this.getOrCreateWhiteboard(room, wbId);
    wb.texts.push(textData);
    return textData;
  }

  addWhiteboardPostit(roomId, wbId, postitData) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const wb = this.getOrCreateWhiteboard(room, wbId);
    // Update existing postit or add new
    const existing = wb.postits.findIndex(p => p.id === postitData.id);
    if (existing >= 0) {
      wb.postits[existing] = postitData;
    } else {
      wb.postits.push(postitData);
    }
    return postitData;
  }

  undoWhiteboardStroke(roomId, wbId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const wb = this.getOrCreateWhiteboard(room, wbId);
    // Find last stroke by this user
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

    const id = `vote_${room.nextVoteId++}`;
    const vote = {
      id,
      question: voteData.question,
      options: voteData.options.map(o => ({ text: o, votes: 0 })),
      anonymous: voteData.anonymous || false,
      scope: voteData.scope || 'global',
      tableId: voteData.tableId || null,
      voters: new Map(),
      active: true,
      duration: voteData.duration || 60,
      createdAt: Date.now(),
    };
    room.votes.set(id, vote);
    return { success: true, vote: this.serializeVote(vote) };
  }

  castVote(roomId, socketId, voteId, optionIndex) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    const vote = room.votes.get(voteId);
    if (!vote || !vote.active) return { error: 'vote_not_found' };
    if (vote.voters.has(socketId)) return { error: 'already_voted' };
    if (optionIndex < 0 || optionIndex >= vote.options.length) return { error: 'invalid_option' };

    vote.options[optionIndex].votes++;
    vote.voters.set(socketId, optionIndex);
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

    const id = `timer_${room.nextTimerId++}`;
    const timer = {
      id,
      duration: timerData.duration, // seconds
      remaining: timerData.duration,
      scope: timerData.scope || 'global',
      tableId: timerData.tableId || null,
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
    const timer = room.timers.get(timerId);
    if (!timer) return { error: 'not_found' };
    timer.paused = !timer.paused;
    if (timer.paused) {
      timer.remaining -= (Date.now() - timer.startedAt) / 1000;
    } else {
      timer.startedAt = Date.now();
    }
    return { success: true, timer };
  }

  // ===== TABLE NOTES =====

  updateTableNotes(roomId, tableId, content) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const notes = room.tableNotes.get(tableId);
    if (!notes) return null;
    notes.content = content;
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
    p.isMuted = muted;
    return { isMuted: p.isMuted };
  }
}

module.exports = new RoomManager();
