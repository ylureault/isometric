// Room Manager: server-side room state management

const CONSTANTS = require('../shared/constants');

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> Room
  }

  createRoom(roomId, config) {
    if (this.rooms.has(roomId)) {
      return null;
    }

    const room = {
      id: roomId,
      name: config.name || 'Room',
      environment: config.environment || 'bureau',
      gridSize: Math.min(CONSTANTS.GRID_MAX, Math.max(CONSTANTS.GRID_MIN, config.gridSize || CONSTANTS.GRID_DEFAULT)),
      creatorSocketId: null,
      participants: new Map(), // socketId -> participant data
      createdAt: Date.now(),
      closed: false,
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  joinRoom(roomId, socketId, participantData) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    if (room.closed) return { error: 'room_closed' };
    if (room.participants.size >= CONSTANTS.MAX_PARTICIPANTS) return { error: 'room_full' };

    const isCreator = participantData.isCreator && room.participants.size === 0 && !room.creatorSocketId;

    const participant = {
      socketId,
      pseudo: participantData.pseudo,
      colors: participantData.colors,
      x: participantData.x || Math.floor(room.gridSize / 2),
      y: participantData.y || Math.floor(room.gridSize / 2),
      direction: { dx: 0, dy: 1 },
      isWalking: false,
      walkPhase: 0,
      role: isCreator ? 'creator' : 'participant',
      isAdmin: isCreator,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      disconnected: false,
    };

    if (isCreator) {
      room.creatorSocketId = socketId;
    }

    room.participants.set(socketId, participant);

    return {
      participant,
      room: this.getRoomInfo(roomId),
      participants: this.getParticipantsList(roomId),
    };
  }

  leaveRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const participant = room.participants.get(socketId);
    if (!participant) return null;

    room.participants.delete(socketId);

    // Clean up empty rooms after a delay
    if (room.participants.size === 0) {
      setTimeout(() => {
        const r = this.rooms.get(roomId);
        if (r && r.participants.size === 0) {
          this.rooms.delete(roomId);
        }
      }, 60000); // 1 minute grace period
    }

    return participant;
  }

  markDisconnected(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const participant = room.participants.get(socketId);
    if (!participant) return null;
    participant.disconnected = true;
    participant.disconnectedAt = Date.now();
    return participant;
  }

  markReconnected(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const participant = room.participants.get(socketId);
    if (!participant) return null;
    participant.disconnected = false;
    participant.disconnectedAt = null;
    participant.lastSeen = Date.now();
    return participant;
  }

  updatePosition(roomId, socketId, posData) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const participant = room.participants.get(socketId);
    if (!participant) return null;

    participant.x = posData.x;
    participant.y = posData.y;
    participant.direction = posData.direction;
    participant.isWalking = posData.isWalking;
    participant.walkPhase = posData.walkPhase;
    participant.lastSeen = Date.now();

    return participant;
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
        x: p.x,
        y: p.y,
        direction: p.direction,
        isWalking: p.isWalking,
        walkPhase: p.walkPhase,
        role: p.role,
        isAdmin: p.isAdmin,
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

    // Spiral outward from center to find free spot
    for (let radius = 0; radius < room.gridSize; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const x = center + dx;
          const y = center + dy;
          if (x >= 1 && x < room.gridSize - 1 && y >= 1 && y < room.gridSize - 1) {
            if (!occupied.has(`${x},${y}`)) {
              return { x: x + 0.5, y: y + 0.5 };
            }
          }
        }
      }
    }
    return { x: center + 0.5, y: center + 0.5 };
  }

  closeRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    if (room.creatorSocketId !== socketId) return { error: 'not_creator' };
    room.closed = true;
    return { success: true };
  }
}

module.exports = new RoomManager();
