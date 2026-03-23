// Server: Node.js + Express + Socket.io — complete real-time collaboration

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const roomManager = require('./room-manager');
const AudioSignaling = require('./audio-signaling');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000,
});

const PORT = process.env.PORT || 3000;
const audioSignaling = new AudioSignaling(io, roomManager);

app.use(express.json());
app.use('/client', express.static(path.join(__dirname, '..', 'client')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

app.get('/', (req, res) => res.redirect('/client/index.html'));

// REST API
app.post('/api/rooms', (req, res) => {
  const { name, environment, gridSize } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Le nom de la room est obligatoire' });

  const roomId = generateRoomId();
  const room = roomManager.createRoom(roomId, {
    name: name.trim(),
    environment: environment || 'open-space',
    gridSize: parseInt(gridSize) || 20,
  });
  if (!room) return res.status(500).json({ error: 'Erreur lors de la création' });
  res.json({ roomId: room.id, url: `/client/room.html?room=${room.id}` });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const info = roomManager.getRoomInfo(req.params.roomId);
  if (!info) return res.status(404).json({ error: 'Room introuvable' });
  res.json(info);
});

// Socket.io
io.on('connection', (socket) => {
  let currentRoomId = null;
  const getCurrentRoomId = () => currentRoomId;

  // Setup WebRTC signaling
  audioSignaling.setup(socket, getCurrentRoomId);

  // ===== JOIN / LEAVE =====

  socket.on('join-room', (data, callback) => {
    const { roomId, pseudo, colors, isCreator } = data;

    let room = roomManager.getRoom(roomId);
    if (!room && isCreator) {
      room = roomManager.createRoom(roomId, {
        name: data.roomName || 'Room',
        environment: data.environment || 'open-space',
        gridSize: data.gridSize || 20,
      });
    }
    if (!room) return callback({ error: 'room_not_found' });

    const spawn = roomManager.findSpawnPosition(roomId);
    const result = roomManager.joinRoom(roomId, socket.id, {
      pseudo, colors, isCreator,
      x: spawn.x, y: spawn.y,
    });

    if (result.error) return callback({ error: result.error });

    currentRoomId = roomId;
    socket.join(roomId);

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
      isMuted: result.participant.isMuted,
      tableId: null,
      handRaised: false,
    });

    callback({
      success: true,
      room: result.room,
      participants: result.participants,
      tables: result.tables,
      theme: result.theme,
      you: {
        socketId: socket.id,
        x: result.participant.x,
        y: result.participant.y,
        role: result.participant.role,
        isAdmin: result.participant.isAdmin,
      },
    });
  });

  socket.on('leave-room', () => {
    if (!currentRoomId) return;
    const p = roomManager.leaveRoom(currentRoomId, socket.id);
    if (p) {
      socket.to(currentRoomId).emit('participant-left', {
        socketId: socket.id,
        pseudo: p.pseudo,
      });
    }
    socket.leave(currentRoomId);
    currentRoomId = null;
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const p = roomManager.markDisconnected(currentRoomId, socket.id);
    if (!p) return;

    socket.to(currentRoomId).emit('participant-disconnected', {
      socketId: socket.id,
      pseudo: p.pseudo,
    });

    const roomId = currentRoomId;
    const sid = socket.id;
    setTimeout(() => {
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const pp = room.participants.get(sid);
      if (pp && pp.disconnected) {
        roomManager.leaveRoom(roomId, sid);
        io.to(roomId).emit('participant-left', { socketId: sid, pseudo: pp.pseudo });
      }
    }, 30000);
  });

  // ===== POSITION =====

  socket.on('position-update', (data) => {
    if (!currentRoomId) return;
    const result = roomManager.updatePosition(currentRoomId, socket.id, data);

    socket.to(currentRoomId).emit('participant-moved', {
      socketId: socket.id,
      x: data.x, y: data.y,
      direction: data.direction,
      isWalking: data.isWalking,
      walkPhase: data.walkPhase,
    });

    // Table association change
    if (result) {
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        const p = room.participants.get(socket.id);
        if (p) {
          // Notify about table change
          io.to(currentRoomId).emit('participant-table-changed', {
            socketId: socket.id,
            tableId: p.tableId,
          });
        }
      }
    }
  });

  // ===== ADMIN ACTIONS =====

  socket.on('promote-admin', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.promoteAdmin(currentRoomId, socket.id, data.targetSocketId);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('role-changed', {
      socketId: data.targetSocketId,
      isAdmin: true,
      pseudo: result.pseudo,
    });
    callback(result);
  });

  socket.on('demote-admin', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.demoteAdmin(currentRoomId, socket.id, data.targetSocketId);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('role-changed', {
      socketId: data.targetSocketId,
      isAdmin: false,
      pseudo: result.pseudo,
    });
    callback(result);
  });

  socket.on('kick-participant', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.kickParticipant(currentRoomId, socket.id, data.targetSocketId);
    if (result.error) return callback(result);

    // Notify the kicked participant
    io.to(data.targetSocketId).emit('kicked', { reason: 'Exclu par un administrateur' });
    // Remove from room
    roomManager.leaveRoom(currentRoomId, data.targetSocketId);
    // Notify others
    socket.to(currentRoomId).emit('participant-kicked', {
      socketId: data.targetSocketId,
      pseudo: result.participant.pseudo,
    });
    callback({ success: true });
  });

  socket.on('close-room', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.closeRoom(currentRoomId, socket.id);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('room-closed', { reason: 'La room a été fermée par l\'organisateur' });
    callback({ success: true });
  });

  // ===== MUTE =====

  socket.on('mute-changed', (data) => {
    if (!currentRoomId) return;
    roomManager.setMuted(currentRoomId, socket.id, data.muted);
    socket.to(currentRoomId).emit('participant-mute-changed', {
      socketId: socket.id,
      muted: data.muted,
    });
  });

  // ===== TABLES =====

  socket.on('create-table', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.createTable(currentRoomId, socket.id, data);
    if (result.error) return callback(result);
    socket.to(currentRoomId).emit('table-created', result.table);
    callback(result);
  });

  socket.on('rename-table', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.renameTable(currentRoomId, socket.id, data.tableId, data.name);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('table-renamed', { tableId: data.tableId, name: data.name });
    callback(result);
  });

  socket.on('delete-table', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.deleteTable(currentRoomId, socket.id, data.tableId);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('table-deleted', { tableId: data.tableId });
    callback(result);
  });

  socket.on('move-table', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.moveTable(currentRoomId, socket.id, data.tableId, data.x, data.y);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('table-moved', { tableId: data.tableId, x: data.x, y: data.y });
    callback(result);
  });

  // ===== TABLE NOTES =====

  socket.on('get-table-notes', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const notes = roomManager.getTableNotes(currentRoomId, data.tableId);
    callback({ success: true, notes });
  });

  socket.on('update-table-notes', (data) => {
    if (!currentRoomId) return;
    roomManager.updateTableNotes(currentRoomId, data.tableId, data.content);
    socket.to(currentRoomId).emit('table-notes-updated', {
      tableId: data.tableId,
      content: data.content,
      socketId: socket.id,
    });
  });

  // ===== THEME =====

  socket.on('update-theme', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.updateTheme(currentRoomId, socket.id, data);
    if (result.error) return callback(result);
    socket.to(currentRoomId).emit('theme-changed', result.theme);
    callback(result);
  });

  // ===== ENVIRONMENT =====

  socket.on('change-environment', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.changeEnvironment(currentRoomId, socket.id, data.environment);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('environment-changed', { environment: data.environment });
    callback(result);
  });

  socket.on('resize-grid', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.resizeGrid(currentRoomId, socket.id, data.size);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('grid-resized', { size: result.newSize });
    callback(result);
  });

  // ===== FURNITURE =====

  socket.on('add-furniture', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.addFurniture(currentRoomId, socket.id, data);
    if (result.error) return callback(result);
    socket.to(currentRoomId).emit('furniture-added', result.item);
    callback(result);
  });

  socket.on('remove-furniture', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.removeFurniture(currentRoomId, socket.id, data.furnitureId);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('furniture-removed', { furnitureId: data.furnitureId });
    callback(result);
  });

  // ===== WHITEBOARD =====

  socket.on('create-whiteboard', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.createWhiteboard(currentRoomId, socket.id, data);
    if (result.error) return callback(result);
    socket.to(currentRoomId).emit('whiteboard-created', result.whiteboard);
    callback(result);
  });

  socket.on('delete-whiteboard', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.deleteWhiteboard(currentRoomId, socket.id, data.whiteboardId);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('whiteboard-deleted', { whiteboardId: data.whiteboardId });
    callback(result);
  });

  socket.on('wb-stroke', (data) => {
    if (!currentRoomId) return;
    data.strokeData.socketId = socket.id;
    roomManager.addWhiteboardStroke(currentRoomId, data.whiteboardId, data.strokeData);
    socket.to(currentRoomId).emit('wb-stroke', {
      whiteboardId: data.whiteboardId,
      strokeData: data.strokeData,
    });
  });

  socket.on('wb-text', (data) => {
    if (!currentRoomId) return;
    roomManager.addWhiteboardText(currentRoomId, data.whiteboardId, data.textData);
    socket.to(currentRoomId).emit('wb-text', {
      whiteboardId: data.whiteboardId,
      textData: data.textData,
    });
  });

  socket.on('wb-postit', (data) => {
    if (!currentRoomId) return;
    roomManager.addWhiteboardPostit(currentRoomId, data.whiteboardId, data.postitData);
    socket.to(currentRoomId).emit('wb-postit', {
      whiteboardId: data.whiteboardId,
      postitData: data.postitData,
    });
  });

  socket.on('wb-undo', (data) => {
    if (!currentRoomId) return;
    const result = roomManager.undoWhiteboardStroke(currentRoomId, data.whiteboardId, socket.id);
    if (result) {
      io.to(currentRoomId).emit('wb-undo', {
        whiteboardId: data.whiteboardId,
        index: result.index,
      });
    }
  });

  socket.on('wb-clear', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.clearWhiteboard(currentRoomId, socket.id, data.whiteboardId);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('wb-cleared', { whiteboardId: data.whiteboardId });
    callback(result);
  });

  socket.on('wb-cursor', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('wb-cursor', {
      whiteboardId: data.whiteboardId,
      socketId: socket.id,
      x: data.x, y: data.y,
    });
  });

  socket.on('wb-open', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ error: 'room_not_found' });
    const wb = room.whiteboards.get(data.whiteboardId);
    if (!wb) return callback({ error: 'not_found' });
    wb.activeUsers.add(socket.id);
    callback({
      success: true,
      strokes: wb.strokes,
      texts: wb.texts,
      postits: wb.postits,
    });
    socket.to(currentRoomId).emit('wb-user-joined', {
      whiteboardId: data.whiteboardId,
      socketId: socket.id,
      activeCount: wb.activeUsers.size,
    });
  });

  socket.on('wb-close', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const wb = room.whiteboards.get(data.whiteboardId);
    if (!wb) return;
    wb.activeUsers.delete(socket.id);
    socket.to(currentRoomId).emit('wb-user-left', {
      whiteboardId: data.whiteboardId,
      socketId: socket.id,
      activeCount: wb.activeUsers.size,
    });
  });

  // ===== VOTES =====

  socket.on('create-vote', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.createVote(currentRoomId, socket.id, data);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('vote-created', result.vote);
    // Auto-end after duration
    const voteId = result.vote.id;
    const rid = currentRoomId;
    setTimeout(() => {
      const finalResults = roomManager.endVote(rid, voteId);
      if (finalResults) io.to(rid).emit('vote-ended', finalResults);
    }, (data.duration || 60) * 1000);
    callback(result);
  });

  socket.on('cast-vote', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.castVote(currentRoomId, socket.id, data.voteId, data.optionIndex);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('vote-updated', result.results);
    callback(result);
  });

  // ===== TIMERS =====

  socket.on('create-timer', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.createTimer(currentRoomId, socket.id, data);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('timer-created', result.timer);

    // Auto-tick
    const timerId = result.timer.id;
    const rid = currentRoomId;
    const tickInterval = setInterval(() => {
      const room = roomManager.getRoom(rid);
      if (!room) { clearInterval(tickInterval); return; }
      const timer = room.timers.get(timerId);
      if (!timer || !timer.running) { clearInterval(tickInterval); return; }
      if (!timer.paused) {
        timer.remaining = Math.max(0, timer.duration - (Date.now() - timer.startedAt) / 1000);
        if (timer.remaining <= 0) {
          timer.running = false;
          io.to(rid).emit('timer-ended', { timerId });
          clearInterval(tickInterval);
        }
      }
    }, 1000);
    callback(result);
  });

  socket.on('pause-timer', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.pauseTimer(currentRoomId, socket.id, data.timerId);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('timer-paused', { timerId: data.timerId, paused: result.timer.paused });
    callback(result);
  });

  // ===== CHAT =====

  socket.on('chat-message', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const p = room.participants.get(socket.id);
    if (!p) return;
    const msg = {
      socketId: socket.id,
      pseudo: p.pseudo,
      text: (data.text || '').slice(0, 200),
      timestamp: Date.now(),
    };
    io.to(currentRoomId).emit('chat-message', msg);
  });

  // ===== REACTIONS =====

  socket.on('reaction', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('reaction', {
      socketId: socket.id,
      emoji: data.emoji,
    });
  });

  // ===== RAISED HAND =====

  socket.on('toggle-hand', (data, callback) => {
    if (!currentRoomId) return;
    const result = roomManager.toggleRaisedHand(currentRoomId, socket.id);
    if (!result) return;
    io.to(currentRoomId).emit('hand-toggled', {
      socketId: socket.id,
      handRaised: result.handRaised,
      pseudo: result.pseudo,
    });
    if (callback) callback(result);
  });

  socket.on('lower-all-hands', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.lowerAllHands(currentRoomId, socket.id);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('all-hands-lowered');
    callback(result);
  });

  // ===== EFFECTS =====

  socket.on('trigger-effect', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const p = room.participants.get(socket.id);
    if (!p || !p.isAdmin) return;
    io.to(currentRoomId).emit('effect-triggered', {
      type: data.type, // confetti, applause, spotlight
      targetSocketId: data.targetSocketId || null,
    });
  });

  // ===== SPOTLIGHT =====

  // Admin broadcast: hold Space to talk to everyone
  socket.on('admin-broadcast-start', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const p = room.participants.get(socket.id);
    if (!p || !p.isAdmin) return;
    socket.to(currentRoomId).emit('admin-broadcast-start', {
      socketId: socket.id,
      pseudo: p.pseudo,
    });
  });

  socket.on('admin-broadcast-stop', () => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('admin-broadcast-stop', {
      socketId: socket.id,
    });
  });

  socket.on('spotlight', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const p = room.participants.get(socket.id);
    if (!p || !p.isAdmin) return;
    io.to(currentRoomId).emit('spotlight-changed', {
      targetSocketId: data.targetSocketId || null,
      active: data.active,
    });
  });
});

function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

server.listen(PORT, () => {
  console.log(`Espace Collaboratif running at http://localhost:${PORT}`);
});

module.exports = { app, server, io };
