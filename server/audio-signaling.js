// Audio Signaling: WebRTC signaling for peer-to-peer audio connections

class AudioSignaling {
  constructor(io, roomManager) {
    this.io = io;
    this.roomManager = roomManager;
  }

  setup(socket, getCurrentRoomId) {
    // WebRTC signaling: offer
    socket.on('rtc-offer', (data) => {
      const roomId = getCurrentRoomId();
      if (!roomId) return;
      const { targetSocketId, offer } = data;
      this.io.to(targetSocketId).emit('rtc-offer', {
        fromSocketId: socket.id,
        offer,
      });
    });

    // WebRTC signaling: answer
    socket.on('rtc-answer', (data) => {
      const roomId = getCurrentRoomId();
      if (!roomId) return;
      const { targetSocketId, answer } = data;
      this.io.to(targetSocketId).emit('rtc-answer', {
        fromSocketId: socket.id,
        answer,
      });
    });

    // WebRTC signaling: ICE candidate
    socket.on('rtc-ice-candidate', (data) => {
      const roomId = getCurrentRoomId();
      if (!roomId) return;
      const { targetSocketId, candidate } = data;
      this.io.to(targetSocketId).emit('rtc-ice-candidate', {
        fromSocketId: socket.id,
        candidate,
      });
    });

    // Screen share signaling
    socket.on('screen-share-start', (data) => {
      const roomId = getCurrentRoomId();
      if (!roomId) return;
      const room = this.roomManager.getRoom(roomId);
      if (!room) return;
      const participant = room.participants.get(socket.id);
      if (!participant || !participant.isAdmin) return;

      const { scope, tableId } = data; // scope: 'global' or 'table'
      room.activeScreenShare = {
        socketId: socket.id,
        pseudo: participant.pseudo,
        scope,
        tableId: tableId || null,
      };

      socket.to(roomId).emit('screen-share-started', {
        socketId: socket.id,
        pseudo: participant.pseudo,
        scope,
        tableId,
      });
    });

    socket.on('screen-share-stop', () => {
      const roomId = getCurrentRoomId();
      if (!roomId) return;
      const room = this.roomManager.getRoom(roomId);
      if (!room) return;

      if (room.activeScreenShare && room.activeScreenShare.socketId === socket.id) {
        room.activeScreenShare = null;
        socket.to(roomId).emit('screen-share-stopped', {
          socketId: socket.id,
        });
      }
    });

    // Screen share RTC signaling (separate from audio)
    socket.on('screen-rtc-offer', (data) => {
      const { targetSocketId, offer } = data;
      this.io.to(targetSocketId).emit('screen-rtc-offer', {
        fromSocketId: socket.id,
        offer,
      });
    });

    socket.on('screen-rtc-answer', (data) => {
      const { targetSocketId, answer } = data;
      this.io.to(targetSocketId).emit('screen-rtc-answer', {
        fromSocketId: socket.id,
        answer,
      });
    });

    socket.on('screen-rtc-ice-candidate', (data) => {
      const { targetSocketId, candidate } = data;
      this.io.to(targetSocketId).emit('screen-rtc-ice-candidate', {
        fromSocketId: socket.id,
        candidate,
      });
    });
  }
}

module.exports = AudioSignaling;
