// Integration tests: Socket.io server communication

const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const express = require('express');

let io, httpServer, port;
let roomManager;

beforeAll((done) => {
  roomManager = require('../server/room-manager');
  roomManager.rooms = new Map();

  const app = express();
  app.use(express.json());
  httpServer = http.createServer(app);
  io = new Server(httpServer);

  io.on('connection', (socket) => {
    let currentRoomId = null;

    socket.on('join-room', (data, cb) => {
      let room = roomManager.getRoom(data.roomId);
      if (!room && data.isCreator) {
        room = roomManager.createRoom(data.roomId, {
          name: data.roomName || 'Test',
          environment: data.environment || 'open-space',
          gridSize: data.gridSize || 20,
        });
      }
      if (!room) return cb({ error: 'room_not_found' });

      const spawn = roomManager.findSpawnPosition(data.roomId);
      const result = roomManager.joinRoom(data.roomId, socket.id, {
        pseudo: data.pseudo, colors: data.colors || {},
        isCreator: data.isCreator, x: spawn.x, y: spawn.y,
      });
      if (result.error) return cb({ error: result.error });

      currentRoomId = data.roomId;
      socket.join(data.roomId);
      socket.to(data.roomId).emit('participant-joined', { socketId: socket.id, pseudo: result.participant.pseudo });
      cb({
        success: true, room: result.room, participants: result.participants,
        you: { socketId: socket.id, x: result.participant.x, y: result.participant.y, role: result.participant.role, isAdmin: result.participant.isAdmin },
      });
    });

    socket.on('position-update', (data) => {
      if (!currentRoomId) return;
      roomManager.updatePosition(currentRoomId, socket.id, data);
      socket.to(currentRoomId).emit('participant-moved', { socketId: socket.id, ...data });
    });

    socket.on('leave-room', () => {
      if (!currentRoomId) return;
      const p = roomManager.leaveRoom(currentRoomId, socket.id);
      if (p) socket.to(currentRoomId).emit('participant-left', { socketId: socket.id, pseudo: p.pseudo });
      socket.leave(currentRoomId);
      currentRoomId = null;
    });

    socket.on('reaction', (data) => {
      if (!currentRoomId) return;
      io.to(currentRoomId).emit('reaction', { socketId: socket.id, emoji: data.emoji });
    });

    socket.on('toggle-hand', (data, cb) => {
      if (!currentRoomId) return;
      const result = roomManager.toggleRaisedHand(currentRoomId, socket.id);
      io.to(currentRoomId).emit('hand-toggled', { socketId: socket.id, handRaised: result.handRaised });
      if (cb) cb(result);
    });

    socket.on('promote-admin', (data, cb) => {
      if (!currentRoomId) return cb({ error: 'not_in_room' });
      const result = roomManager.promoteAdmin(currentRoomId, socket.id, data.targetSocketId);
      if (result.error) return cb(result);
      io.to(currentRoomId).emit('role-changed', { socketId: data.targetSocketId, isAdmin: true });
      cb(result);
    });

    socket.on('disconnect', () => {
      if (!currentRoomId) return;
      roomManager.markDisconnected(currentRoomId, socket.id);
      socket.to(currentRoomId).emit('participant-disconnected', { socketId: socket.id });
    });
  });

  httpServer.listen(0, () => {
    port = httpServer.address().port;
    done();
  });
});

afterAll((done) => {
  io.close();
  httpServer.close(done);
});

function createClient() {
  return Client(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
}

function waitForConnect(client) {
  return new Promise((resolve) => {
    if (client.connected) return resolve();
    client.on('connect', resolve);
  });
}

function joinRoom(client, data) {
  return new Promise((resolve) => {
    client.emit('join-room', data, resolve);
  });
}

describe('Socket.io Integration Tests', () => {
  test('Create room and join as creator', async () => {
    const client = createClient();
    await waitForConnect(client);
    const resp = await joinRoom(client, {
      roomId: 'it1', pseudo: 'Alice', colors: {}, isCreator: true, roomName: 'Test', gridSize: 25,
    });
    expect(resp.success).toBe(true);
    expect(resp.you.isAdmin).toBe(true);
    expect(resp.you.role).toBe('creator');
    expect(resp.room.gridSize).toBe(25);
    client.disconnect();
  });

  test('Second player joins and first sees notification', async () => {
    const c1 = createClient();
    const c2 = createClient();
    await waitForConnect(c1);
    await joinRoom(c1, { roomId: 'it2', pseudo: 'Alice', colors: {}, isCreator: true, roomName: 'T', gridSize: 20 });

    const joinedPromise = new Promise((resolve) => {
      c1.on('participant-joined', resolve);
    });

    await waitForConnect(c2);
    const resp = await joinRoom(c2, { roomId: 'it2', pseudo: 'Bob', colors: {} });
    expect(resp.success).toBe(true);

    const data = await joinedPromise;
    expect(data.pseudo).toBe('Bob');

    c1.disconnect();
    c2.disconnect();
  });

  test('Position updates are broadcasted', async () => {
    const c1 = createClient();
    const c2 = createClient();
    await waitForConnect(c1);
    await joinRoom(c1, { roomId: 'it3', pseudo: 'Alice', colors: {}, isCreator: true, roomName: 'T', gridSize: 20 });

    const movedPromise = new Promise((resolve) => {
      c1.on('participant-moved', resolve);
    });

    await waitForConnect(c2);
    await joinRoom(c2, { roomId: 'it3', pseudo: 'Bob', colors: {} });
    c2.emit('position-update', { x: 5, y: 7, direction: { dx: 1, dy: 0 }, isWalking: true, walkPhase: 0.5 });

    const data = await movedPromise;
    expect(data.x).toBe(5);
    expect(data.y).toBe(7);

    c1.disconnect();
    c2.disconnect();
  });

  test('Player leave triggers notification', async () => {
    const c1 = createClient();
    const c2 = createClient();
    await waitForConnect(c1);
    await joinRoom(c1, { roomId: 'it4', pseudo: 'Alice', colors: {}, isCreator: true, roomName: 'T', gridSize: 20 });

    const leftPromise = new Promise((resolve) => {
      c1.on('participant-left', resolve);
    });

    await waitForConnect(c2);
    await joinRoom(c2, { roomId: 'it4', pseudo: 'Bob', colors: {} });
    c2.emit('leave-room');

    const data = await leftPromise;
    expect(data.pseudo).toBe('Bob');

    c1.disconnect();
    c2.disconnect();
  });

  test('Room full returns error', async () => {
    const roomId = 'it-full';
    const clients = [];

    for (let i = 0; i < 20; i++) {
      const c = createClient();
      clients.push(c);
      await waitForConnect(c);
      await joinRoom(c, {
        roomId, pseudo: `P${i}`, colors: {},
        isCreator: i === 0, roomName: 'Full', gridSize: 20,
      });
    }

    const extra = createClient();
    await waitForConnect(extra);
    const resp = await joinRoom(extra, { roomId, pseudo: 'P20', colors: {} });
    expect(resp.error).toBe('room_full');

    extra.disconnect();
    clients.forEach(c => c.disconnect());
  }, 15000);

  test('Reactions are broadcasted', async () => {
    const c1 = createClient();
    const c2 = createClient();
    await waitForConnect(c1);
    await joinRoom(c1, { roomId: 'it-react', pseudo: 'Alice', colors: {}, isCreator: true, roomName: 'T', gridSize: 20 });

    const reactionPromise = new Promise((resolve) => {
      c1.on('reaction', resolve);
    });

    await waitForConnect(c2);
    await joinRoom(c2, { roomId: 'it-react', pseudo: 'Bob', colors: {} });
    c2.emit('reaction', { emoji: '👍' });

    const data = await reactionPromise;
    expect(data.emoji).toBe('👍');

    c1.disconnect();
    c2.disconnect();
  });

  test('Hand raise is broadcast', async () => {
    const c1 = createClient();
    await waitForConnect(c1);
    await joinRoom(c1, { roomId: 'it-hand', pseudo: 'Alice', colors: {}, isCreator: true, roomName: 'T', gridSize: 20 });

    const handPromise = new Promise((resolve) => {
      c1.on('hand-toggled', resolve);
    });
    c1.emit('toggle-hand', {}, () => {});

    const data = await handPromise;
    expect(data.handRaised).toBe(true);
    c1.disconnect();
  });

  test('Invalid room returns error', async () => {
    const c = createClient();
    await waitForConnect(c);
    const resp = await joinRoom(c, { roomId: 'nonexistent', pseudo: 'A', colors: {} });
    expect(resp.error).toBe('room_not_found');
    c.disconnect();
  });

  test('Admin promotion works via socket', async () => {
    const c1 = createClient();
    const c2 = createClient();
    await waitForConnect(c1);
    await joinRoom(c1, { roomId: 'it-promo', pseudo: 'Alice', colors: {}, isCreator: true, roomName: 'T', gridSize: 20 });

    await waitForConnect(c2);
    await joinRoom(c2, { roomId: 'it-promo', pseudo: 'Bob', colors: {} });

    const resp = await new Promise((resolve) => {
      c1.emit('promote-admin', { targetSocketId: c2.id }, resolve);
    });
    expect(resp.success).toBe(true);

    c1.disconnect();
    c2.disconnect();
  });
});
