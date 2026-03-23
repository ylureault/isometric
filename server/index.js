// Server: Node.js + Express + Socket.io for real-time collaboration

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const roomManager = require('./room-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000,
});

const PORT = process.env.PORT || 3000;

// JSON body parsing
app.use(express.json());

// Serve static files
app.use('/client', express.static(path.join(__dirname, '..', 'client')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

// Root redirects to landing page
app.get('/', (req, res) => {
  res.redirect('/client/index.html');
});

// REST API: create a room
app.post('/api/rooms', (req, res) => {
  const { name, environment, gridSize } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Le nom de la room est obligatoire' });
  }

  // Generate unique room ID
  const roomId = generateRoomId();
  const room = roomManager.createRoom(roomId, {
    name: name.trim(),
    environment: environment || 'bureau',
    gridSize: parseInt(gridSize) || 20,
  });

  if (!room) {
    return res.status(500).json({ error: 'Erreur lors de la création de la room' });
  }

  res.json({
    roomId: room.id,
    url: `/client/room.html?room=${room.id}`,
  });
});

// REST API: get room info
app.get('/api/rooms/:roomId', (req, res) => {
  const info = roomManager.getRoomInfo(req.params.roomId);
  if (!info) {
    return res.status(404).json({ error: 'Room introuvable' });
  }
  res.json(info);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  let currentRoomId = null;

  // Join room
  socket.on('join-room', (data, callback) => {
    const { roomId, pseudo, colors, isCreator } = data;

    // If room doesn't exist and this is the creator, create it
    let room = roomManager.getRoom(roomId);
    if (!room && isCreator) {
      room = roomManager.createRoom(roomId, {
        name: data.roomName || 'Room',
        environment: data.environment || 'bureau',
        gridSize: data.gridSize || 20,
      });
    }

    if (!room) {
      return callback({ error: 'room_not_found' });
    }

    // Find spawn position
    const spawn = roomManager.findSpawnPosition(roomId);

    const result = roomManager.joinRoom(roomId, socket.id, {
      pseudo,
      colors,
      isCreator,
      x: spawn.x,
      y: spawn.y,
    });

    if (result.error) {
      return callback({ error: result.error });
    }

    currentRoomId = roomId;
    socket.join(roomId);

    // Notify others
    socket.to(roomId).emit('participant-joined', {
      socketId: socket.id,
      pseudo: result.participant.pseudo,
      colors: result.participant.colors,
      x: result.participant.x,
      y: result.participant.y,
      direction: result.participant.direction,
      isWalking: false,
      walkPhase: 0,
      role: result.participant.role,
      isAdmin: result.participant.isAdmin,
    });

    callback({
      success: true,
      room: result.room,
      participants: result.participants,
      you: {
        socketId: socket.id,
        x: result.participant.x,
        y: result.participant.y,
        role: result.participant.role,
        isAdmin: result.participant.isAdmin,
      },
    });
  });

  // Position update
  socket.on('position-update', (data) => {
    if (!currentRoomId) return;

    roomManager.updatePosition(currentRoomId, socket.id, data);

    // Broadcast to others in the room
    socket.to(currentRoomId).emit('participant-moved', {
      socketId: socket.id,
      x: data.x,
      y: data.y,
      direction: data.direction,
      isWalking: data.isWalking,
      walkPhase: data.walkPhase,
    });
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    if (!currentRoomId) return;

    const participant = roomManager.markDisconnected(currentRoomId, socket.id);
    if (!participant) return;

    // Notify others about disconnection
    socket.to(currentRoomId).emit('participant-disconnected', {
      socketId: socket.id,
      pseudo: participant.pseudo,
    });

    // After timeout, fully remove
    const roomId = currentRoomId;
    const sid = socket.id;
    setTimeout(() => {
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const p = room.participants.get(sid);
      if (p && p.disconnected) {
        roomManager.leaveRoom(roomId, sid);
        io.to(roomId).emit('participant-left', {
          socketId: sid,
          pseudo: p.pseudo,
        });
      }
    }, 30000); // 30 second timeout
  });

  // Explicit leave
  socket.on('leave-room', () => {
    if (!currentRoomId) return;

    const participant = roomManager.leaveRoom(currentRoomId, socket.id);
    if (participant) {
      socket.to(currentRoomId).emit('participant-left', {
        socketId: socket.id,
        pseudo: participant.pseudo,
      });
    }

    socket.leave(currentRoomId);
    currentRoomId = null;
  });
});

function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

server.listen(PORT, () => {
  console.log(`Espace Collaboratif running at http://localhost:${PORT}`);
});
