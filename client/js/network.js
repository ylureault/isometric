// Network: WebSocket communication via Socket.io

const Network = {
  socket: null,
  roomId: null,
  mySocketId: null,
  connected: false,
  reconnecting: false,

  // Remote participants: socketId -> participant state
  remotePlayers: new Map(),

  // Position send throttle
  lastPositionSend: 0,
  positionSendInterval: 1000 / CONSTANTS.POSITION_SEND_RATE,

  // Callbacks
  onJoined: null,
  onError: null,
  onParticipantJoined: null,
  onParticipantLeft: null,
  onParticipantDisconnected: null,
  onReconnecting: null,
  onReconnected: null,
  onReconnectFailed: null,

  init() {
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: CONSTANTS.MAX_RECONNECT_ATTEMPTS,
    });

    this.setupSocketEvents();
  },

  setupSocketEvents() {
    this.socket.on('connect', () => {
      this.connected = true;
      this.mySocketId = this.socket.id;

      if (this.reconnecting) {
        this.reconnecting = false;
        if (this.onReconnected) this.onReconnected();
      }
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this.reconnecting = true;
      if (this.onReconnecting) this.onReconnecting();
    });

    // All reconnection attempts exhausted — surface a clear dead-end to the user.
    this.socket.io.on('reconnect_failed', () => {
      this.reconnecting = false;
      if (this.onReconnectFailed) this.onReconnectFailed();
    });

    // Remote player joined
    this.socket.on('participant-joined', (data) => {
      this.remotePlayers.set(data.socketId, {
        ...data,
        targetX: data.x,
        targetY: data.y,
        renderX: data.x,
        renderY: data.y,
        opacity: 0, // fade in
        lastUpdate: Date.now(),
      });

      if (this.onParticipantJoined) {
        this.onParticipantJoined(data);
      }
    });

    // Remote player moved
    this.socket.on('participant-moved', (data) => {
      const player = this.remotePlayers.get(data.socketId);
      if (!player) return;

      player.targetX = data.x;
      player.targetY = data.y;
      player.direction = data.direction;
      player.isWalking = data.isWalking;
      player.walkPhase = data.walkPhase;
      player.lastUpdate = Date.now();
    });

    // Remote player disconnected (temporary)
    this.socket.on('participant-disconnected', (data) => {
      const player = this.remotePlayers.get(data.socketId);
      if (player) {
        player.disconnected = true;
      }
      if (this.onParticipantDisconnected) {
        this.onParticipantDisconnected(data);
      }
    });

    // Remote player left (permanent)
    this.socket.on('participant-left', (data) => {
      const player = this.remotePlayers.get(data.socketId);
      if (player) {
        player.leaving = true;
        // Fade out then remove
        setTimeout(() => {
          this.remotePlayers.delete(data.socketId);
        }, 500);
      }
      if (this.onParticipantLeft) {
        this.onParticipantLeft(data);
      }
    });
  },

  joinRoom(roomId, config, callback) {
    this.roomId = roomId;

    // Reclaim a previously-created room on reconnect using the stored secret token.
    let storedToken;
    try {
      // localStorage : être admin survit à la fermeture de l'onglet et aux
      // retours des semaines plus tard (migration douce depuis sessionStorage)
      storedToken = localStorage.getItem('creatorToken:' + roomId) ||
        sessionStorage.getItem('creatorToken:' + roomId) || undefined;
    } catch (e) { /* private mode */ }

    this.socket.emit('join-room', {
      roomId,
      pseudo: config.pseudo,
      colors: config.colors,
      accessory: config.accessory || 'none',
      isCreator: config.isCreator,
      roomName: config.roomName,
      environment: config.environment,
      gridSize: config.gridSize,
      password: config.password || undefined, // improvement #2
      creatorToken: config.creatorToken || storedToken,
    }, (response) => {
      if (response.error) {
        if (this.onError) this.onError(response.error);
        if (callback) callback(response);
        return;
      }

      this.mySocketId = this.socket.id;

      // Persist the creator token so a refresh / reconnect keeps creator rights.
      if (response.creatorToken) {
        try { localStorage.setItem('creatorToken:' + roomId, response.creatorToken); } catch (e) { /* ignore */ }
      }

      // Populate remote players from existing participants
      for (const p of response.participants) {
        if (p.socketId === this.socket.id) continue;
        this.remotePlayers.set(p.socketId, {
          ...p,
          targetX: p.x,
          targetY: p.y,
          renderX: p.x,
          renderY: p.y,
          opacity: 1,
          lastUpdate: Date.now(),
        });
      }

      if (callback) callback(response);
    });
  },

  sendPosition(x, y, direction, isWalking, walkPhase) {
    if (!this.connected || !this.roomId) return;

    const now = Date.now();
    if (now - this.lastPositionSend < this.positionSendInterval) return;
    this.lastPositionSend = now;

    this.socket.emit('position-update', {
      x, y, direction, isWalking, walkPhase,
    });
  },

  leaveRoom() {
    if (this.socket && this.roomId) {
      this.socket.emit('leave-room');
      this.roomId = null;
      this.remotePlayers.clear();
    }
  },

  // Update interpolation for all remote players
  updateRemotePlayers(dt) {
    const lerpSpeed = 0.15;

    for (const [, player] of this.remotePlayers) {
      // Interpolate position
      player.renderX += (player.targetX - player.renderX) * lerpSpeed;
      player.renderY += (player.targetY - player.renderY) * lerpSpeed;

      // Fade in
      if (player.opacity < 1 && !player.leaving) {
        player.opacity = Math.min(1, player.opacity + dt * 3);
      }

      // Fade out if leaving
      if (player.leaving) {
        player.opacity = Math.max(0, player.opacity - dt * 3);
      }

      // Semi-transparent if disconnected
      if (player.disconnected && !player.leaving) {
        player.opacity = Math.max(0.3, player.opacity - dt * 2);
      }
    }
  },

  getParticipantCount() {
    return this.remotePlayers.size + 1; // +1 for local player
  },

  destroy() {
    if (this.socket) {
      this.leaveRoom();
      this.socket.disconnect();
      this.socket = null;
    }
  },
};
