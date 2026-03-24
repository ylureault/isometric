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
const timerIntervals = new Map(); // timerId -> intervalId, for cleanup on cancel

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
    // If already in a room, leave it first (prevent duplicate entries)
    if (currentRoomId) {
      const oldP = roomManager.leaveRoom(currentRoomId, socket.id);
      if (oldP) {
        socket.to(currentRoomId).emit('participant-left', { socketId: socket.id, pseudo: oldP.pseudo });
      }
      socket.leave(currentRoomId);
      currentRoomId = null;
    }
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
      accessory: result.participant.accessory || 'none',
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

    // Include furniture state (with door links) so clients get server state
    const furnitureState = room.furniture || [];

    callback({
      success: true,
      room: result.room,
      participants: result.participants,
      tables: result.tables,
      theme: result.theme,
      furniture: furnitureState,
      activeScreenShare: room.activeScreenShare || null,
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
    const room = roomManager.getRoom(currentRoomId);
    const p = roomManager.markDisconnected(currentRoomId, socket.id);
    if (!p) return;

    // Clean up collab spaces
    if (room && room.collabSpaces) {
      for (const [spaceId, space] of room.collabSpaces) {
        if (space.users.has(socket.id) || space.screens.has(socket.id)) {
          space.users.delete(socket.id);
          space.screens.delete(socket.id);
          io.to(currentRoomId).emit('collab-screen-stopped', { spaceId, socketId: socket.id });
          io.to(currentRoomId).emit('collab-space-updated', {
            spaceId,
            users: Array.from(space.users),
            screens: Array.from(space.screens.keys()),
          });
        }
      }
    }

    // Clean up sub-rooms
    if (room && room.subRooms) {
      for (const [subRoomId, sr] of room.subRooms) {
        if (sr.participants.has(socket.id)) {
          sr.participants.delete(socket.id);
          io.to(currentRoomId).emit('sub-room-updated', {
            subRoomId,
            participants: Array.from(sr.participants),
          });
        }
      }
    }

    // Clean up screen share if this user was sharing
    if (room && room.activeScreenShare && room.activeScreenShare.socketId === socket.id) {
      room.activeScreenShare = null;
      socket.to(currentRoomId).emit('screen-share-stopped', { socketId: socket.id });
    }

    socket.to(currentRoomId).emit('participant-disconnected', {
      socketId: socket.id,
      pseudo: p.pseudo,
    });

    const roomId = currentRoomId;
    const sid = socket.id;
    setTimeout(() => {
      const rm = roomManager.getRoom(roomId);
      if (!rm) return;
      const pp = rm.participants.get(sid);
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

    // Broadcast validated position (not raw client data)
    const room = roomManager.getRoom(currentRoomId);
    const pp = room ? room.participants.get(socket.id) : null;
    if (pp) {
      socket.to(currentRoomId).emit('participant-moved', {
        socketId: socket.id,
        x: pp.x, y: pp.y,
        direction: pp.direction,
        isWalking: pp.isWalking,
        walkPhase: pp.walkPhase,
      });
    }

    // Table association change — only broadcast when actually changed
    if (result && result.changed) {
      io.to(currentRoomId).emit('participant-table-changed', {
        socketId: socket.id,
        tableId: result.newTableId,
        oldTableId: result.oldTableId,
      });
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

  // Speaking indicator
  socket.on('speaking-changed', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('participant-speaking-changed', {
      socketId: socket.id,
      speaking: !!data.speaking,
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

  // Move furniture to new position
  socket.on('move-furniture', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const p = room.participants.get(socket.id);
    if (!p || !p.isAdmin) return;
    const item = room.furniture.find(f => f.id === data.furnitureId);
    if (item) {
      item.x = Math.max(0, Math.min(room.gridSize - 1, data.x));
      item.y = Math.max(0, Math.min(room.gridSize - 1, data.y));
      socket.to(currentRoomId).emit('furniture-moved', { furnitureId: item.id, x: item.x, y: item.y });
    }
  });

  // Link two doors together (paired teleportation)
  socket.on('link-doors', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const p = room.participants.get(socket.id);
    if (!p || !p.isAdmin) return;
    // Find or create furniture entries for linked doors
    let door1 = room.furniture.find(f => f.id === data.door1Id);
    let door2 = room.furniture.find(f => f.id === data.door2Id);
    // If doors are from presets (not in server furniture), create entries
    if (!door1 && data.door1Id) { door1 = { id: data.door1Id, type: 'door' }; room.furniture.push(door1); }
    if (!door2 && data.door2Id) { door2 = { id: data.door2Id, type: 'door' }; room.furniture.push(door2); }
    if (door1 && door2) {
      door1.linkedDoorId = door2.id;
      door2.linkedDoorId = door1.id;
      door1.doorLabel = data.label || 'Passage';
      door2.doorLabel = data.label || 'Passage';
      // Broadcast to ALL (including sender) for consistency
      io.to(currentRoomId).emit('doors-linked', {
        door1Id: door1.id, door2Id: door2.id, label: data.label || 'Passage'
      });
    }
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

  socket.on('wb-postit-delete', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (room) {
      const wb = room.whiteboards.get(data.whiteboardId);
      if (wb && wb.postits) {
        wb.postits = wb.postits.filter(p => p.id !== data.postitId);
      }
    }
    socket.to(currentRoomId).emit('wb-postit-delete', {
      whiteboardId: data.whiteboardId,
      postitId: data.postitId,
    });
  });

  socket.on('wb-erase', (data) => {
    if (!currentRoomId) return;
    // Eraser clears strokes on server — simplified approach
    const room = roomManager.getRoom(currentRoomId);
    if (room) {
      const wb = room.whiteboards.get(data.whiteboardId);
      if (wb) { wb.strokes = []; }
    }
    socket.to(currentRoomId).emit('wb-erase', { whiteboardId: data.whiteboardId });
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
    // Auto-create whiteboard if it doesn't exist (for furniture-attached boards)
    let wb = room.whiteboards.get(data.whiteboardId);
    if (!wb) {
      wb = {
        id: data.whiteboardId,
        x: 0, y: 0, radius: 5, tableId: null,
        strokes: [], texts: [], postits: [],
        activeUsers: new Set(),
      };
      room.whiteboards.set(data.whiteboardId, wb);
    }
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
      if (!room) { clearInterval(tickInterval); timerIntervals.delete(timerId); return; }
      const timer = room.timers.get(timerId);
      if (!timer || !timer.running) { clearInterval(tickInterval); timerIntervals.delete(timerId); return; }
      if (!timer.paused) {
        timer.remaining = Math.max(0, timer.duration - (Date.now() - timer.startedAt) / 1000);
        if (timer.remaining <= 0) {
          timer.running = false;
          io.to(rid).emit('timer-ended', { timerId });
          clearInterval(tickInterval);
          timerIntervals.delete(timerId);
        }
      }
    }, 1000);
    timerIntervals.set(timerId, tickInterval);
    callback(result);
  });

  socket.on('pause-timer', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.pauseTimer(currentRoomId, socket.id, data.timerId);
    if (result.error) return callback(result);
    io.to(currentRoomId).emit('timer-paused', { timerId: data.timerId, paused: result.timer.paused });
    callback(result);
  });

  socket.on('cancel-timer', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const result = roomManager.cancelTimer(currentRoomId, socket.id, data.timerId);
    if (result.error) return callback(result);
    // Clear the server-side interval to prevent memory leaks
    const interval = timerIntervals.get(data.timerId);
    if (interval) { clearInterval(interval); timerIntervals.delete(data.timerId); }
    io.to(currentRoomId).emit('timer-cancelled', { timerId: data.timerId });
    callback(result);
  });

  // ===== COLLABORATION SPACES =====

  socket.on('join-collab-space', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const p = room.participants.get(socket.id);
    if (!p) return;

    if (!room.collabSpaces) room.collabSpaces = new Map();
    var spaceId = data.spaceId;
    if (!room.collabSpaces.has(spaceId)) {
      room.collabSpaces.set(spaceId, { users: new Set(), screens: new Map() });
    }
    var space = room.collabSpaces.get(spaceId);
    space.users.add(socket.id);

    io.to(currentRoomId).emit('collab-space-updated', {
      spaceId: spaceId,
      users: Array.from(space.users),
      screens: Array.from(space.screens.keys()),
    });
  });

  socket.on('leave-collab-space', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room || !room.collabSpaces) return;
    var space = room.collabSpaces.get(data.spaceId);
    if (!space) return;
    space.users.delete(socket.id);
    space.screens.delete(socket.id);

    io.to(currentRoomId).emit('collab-space-updated', {
      spaceId: data.spaceId,
      users: Array.from(space.users),
      screens: Array.from(space.screens.keys()),
    });
  });

  socket.on('collab-screen-share-start', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room || !room.collabSpaces) return;
    var space = room.collabSpaces.get(data.spaceId);
    if (!space) return;
    const p = room.participants.get(socket.id);
    space.screens.set(socket.id, { pseudo: p ? p.pseudo : 'Anonyme' });
    socket.to(currentRoomId).emit('collab-screen-started', {
      spaceId: data.spaceId,
      socketId: socket.id,
      pseudo: p ? p.pseudo : 'Anonyme',
    });
  });

  socket.on('collab-screen-share-stop', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room || !room.collabSpaces) return;
    var space = room.collabSpaces.get(data.spaceId);
    if (space) space.screens.delete(socket.id);
    socket.to(currentRoomId).emit('collab-screen-stopped', {
      spaceId: data.spaceId,
      socketId: socket.id,
    });
  });

  // WebRTC signaling for collab space screens
  socket.on('collab-rtc-offer', (data) => {
    if (!currentRoomId) return;
    io.to(data.targetSocketId).emit('collab-rtc-offer', {
      fromSocketId: socket.id,
      spaceId: data.spaceId,
      offer: data.offer,
    });
  });

  socket.on('collab-rtc-answer', (data) => {
    if (!currentRoomId) return;
    io.to(data.targetSocketId).emit('collab-rtc-answer', {
      fromSocketId: socket.id,
      spaceId: data.spaceId,
      answer: data.answer,
    });
  });

  socket.on('collab-rtc-ice', (data) => {
    if (!currentRoomId) return;
    io.to(data.targetSocketId).emit('collab-rtc-ice', {
      fromSocketId: socket.id,
      spaceId: data.spaceId,
      candidate: data.candidate,
    });
  });

  // ===== SUB-ROOMS =====

  socket.on('create-sub-room', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ error: 'room_not_found' });
    const p = room.participants.get(socket.id);
    if (!p || !p.isAdmin) return callback({ error: 'not_admin' });

    if (!room.subRooms) room.subRooms = new Map();
    const subRoomId = 'sub_' + Date.now().toString(36);
    const gs = room.gridSize;
    const subRoom = {
      id: subRoomId,
      name: (data.name || 'Sous-salle').slice(0, 30),
      x: Math.max(0, Math.min(gs - 3, parseInt(data.x) || 0)),
      y: Math.max(0, Math.min(gs - 3, parseInt(data.y) || 0)),
      width: Math.max(2, Math.min(6, parseInt(data.width) || 3)),
      height: Math.max(2, Math.min(6, parseInt(data.height) || 3)),
      participants: new Set(),
    };
    room.subRooms.set(subRoomId, subRoom);

    io.to(currentRoomId).emit('sub-room-created', {
      id: subRoomId,
      name: subRoom.name,
      x: subRoom.x,
      y: subRoom.y,
      width: subRoom.width,
      height: subRoom.height,
    });
    callback({ success: true, subRoom: { id: subRoomId, name: subRoom.name, x: subRoom.x, y: subRoom.y, width: subRoom.width, height: subRoom.height } });
  });

  socket.on('delete-sub-room', (data, callback) => {
    if (!currentRoomId) return callback({ error: 'not_in_room' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room || !room.subRooms) return callback({ error: 'not_found' });
    const p = room.participants.get(socket.id);
    if (!p || !p.isAdmin) return callback({ error: 'not_admin' });
    room.subRooms.delete(data.subRoomId);
    io.to(currentRoomId).emit('sub-room-deleted', { subRoomId: data.subRoomId });
    callback({ success: true });
  });

  socket.on('join-sub-room', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room || !room.subRooms) return;
    var sr = room.subRooms.get(data.subRoomId);
    if (sr) {
      sr.participants.add(socket.id);
      io.to(currentRoomId).emit('sub-room-updated', {
        subRoomId: data.subRoomId,
        participants: Array.from(sr.participants),
      });
    }
  });

  socket.on('leave-sub-room', (data) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room || !room.subRooms) return;
    var sr = room.subRooms.get(data.subRoomId);
    if (sr) {
      sr.participants.delete(socket.id);
      io.to(currentRoomId).emit('sub-room-updated', {
        subRoomId: data.subRoomId,
        participants: Array.from(sr.participants),
      });
    }
  });

  // ===== CHAT =====

  let lastChatTime = 0;
  socket.on('chat-message', (data) => {
    if (!currentRoomId) return;
    // Rate limit: 1 message per 500ms
    const now = Date.now();
    if (now - lastChatTime < 500) return;
    lastChatTime = now;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const p = room.participants.get(socket.id);
    if (!p) return;
    const text = (data.text || '').toString().trim().slice(0, 200);
    if (!text) return; // ignore empty messages
    const msg = {
      socketId: socket.id,
      pseudo: p.pseudo,
      text,
      timestamp: now,
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
