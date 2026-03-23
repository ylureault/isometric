// Engine: main game loop, input, camera, rendering, reactions, effects — complete

const Engine = {
  canvas: null,
  ctx: null,
  minimapCanvas: null,
  minimapCtx: null,

  player: {
    x: 10, y: 10,
    direction: { dx: 0, dy: 1 },
    walkPhase: 0,
    isWalking: false,
    pseudo: '',
    colors: { ...CONSTANTS.DEFAULT_COLORS },
    role: 'participant',
    isAdmin: false,
    isMuted: true,
    tableId: null,
    handRaised: false,
  },

  camera: { x: 0, y: 0 },
  keys: {},

  roomConfig: {
    name: 'Room',
    environment: 'bureau',
    gridSize: 20,
    roomId: null,
    isCreator: false,
  },

  stars: [],
  lastTime: 0,
  started: false,

  // Reactions floating above avatars
  reactions: [], // { socketId, emoji, x, y, opacity, vy, createdAt }

  // Effects
  confetti: [],
  spotlight: null,

  // Tables from server
  tables: new Map(),

  init() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    this.parseRoomConfig();
    this.resize();
    this.generateStars();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('beforeunload', () => { Network.leaveRoom(); Audio.destroy(); });
    window.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onRightClick(e); });
    window.addEventListener('click', () => { UI.hideContextMenu(); });

    // Init subsystems
    Network.init();
    Audio.init();
    UI.initToolbar();

    // Network callbacks
    Network.onParticipantJoined = (data) => UI.showNotification(`${data.pseudo} a rejoint la room`);
    Network.onParticipantLeft = (data) => UI.showNotification(`${data.pseudo} a quitté la room`);
    Network.onParticipantDisconnected = (data) => UI.showNotification(`${data.pseudo} s'est déconnecté`);
    Network.onReconnecting = () => UI.showReconnecting(true);
    Network.onReconnected = () => { UI.showReconnecting(false); UI.showNotification('Reconnecté !'); };

    this.setupNetworkEvents();
    this.checkRoom();
  },

  setupNetworkEvents() {
    const s = Network.socket;

    // WebRTC audio signaling
    s.on('rtc-offer', (data) => Audio.handleOffer(data.fromSocketId, data.offer));
    s.on('rtc-answer', (data) => Audio.handleAnswer(data.fromSocketId, data.answer));
    s.on('rtc-ice-candidate', (data) => Audio.handleIceCandidate(data.fromSocketId, data.candidate));

    // Screen share signaling
    s.on('screen-rtc-offer', (data) => ScreenShare.handleScreenOffer(data.fromSocketId, data.offer));
    s.on('screen-rtc-answer', (data) => ScreenShare.handleScreenAnswer(data.fromSocketId, data.answer));
    s.on('screen-rtc-ice-candidate', (data) => ScreenShare.handleScreenIceCandidate(data.fromSocketId, data.candidate));
    s.on('screen-share-started', (data) => {
      ScreenShare.activeGlobalShare = { socketId: data.socketId, pseudo: data.pseudo };
      UI.showNotification(`${data.pseudo} partage son écran`);
    });
    s.on('screen-share-stopped', (data) => {
      ScreenShare.removeShare(data.socketId);
      UI.showNotification('Le partage d\'écran est terminé');
    });

    // Role changes
    s.on('role-changed', (data) => {
      if (data.socketId === Network.mySocketId) {
        this.player.isAdmin = data.isAdmin;
        UI.updateAdminUI(data.isAdmin);
        UI.showNotification(data.isAdmin ? 'Vous êtes maintenant administrateur' : 'Votre rôle administrateur a été retiré');
      }
      const rp = Network.remotePlayers.get(data.socketId);
      if (rp) rp.isAdmin = data.isAdmin;
      UI.showNotification(`${data.pseudo} est maintenant ${data.isAdmin ? 'administrateur' : 'participant'}`);
    });

    // Kicked
    s.on('kicked', (data) => {
      alert(data.reason || 'Vous avez été exclu de cette room');
      window.location.href = '/client/index.html';
    });
    s.on('participant-kicked', (data) => {
      UI.showNotification(`${data.pseudo} a été exclu`);
      Network.remotePlayers.delete(data.socketId);
    });

    // Room closed
    s.on('room-closed', (data) => {
      alert(data.reason || 'La room a été fermée');
      window.location.href = '/client/index.html';
    });

    // Mute
    s.on('participant-mute-changed', (data) => {
      const rp = Network.remotePlayers.get(data.socketId);
      if (rp) rp.isMuted = data.muted;
    });

    // Tables
    s.on('table-created', (table) => { this.tables.set(table.id, table); });
    s.on('table-deleted', (data) => { this.tables.delete(data.tableId); });
    s.on('table-renamed', (data) => {
      const t = this.tables.get(data.tableId);
      if (t) t.name = data.name;
    });
    s.on('table-moved', (data) => {
      const t = this.tables.get(data.tableId);
      if (t) { t.x = data.x; t.y = data.y; }
    });
    s.on('participant-table-changed', (data) => {
      const rp = Network.remotePlayers.get(data.socketId);
      if (rp) rp.tableId = data.tableId;
      if (data.socketId === Network.mySocketId) this.player.tableId = data.tableId;
    });

    // Theme
    s.on('theme-changed', (theme) => {
      if (theme.floorColor1) Board.floorColor1 = theme.floorColor1;
      if (theme.floorColor2) Board.floorColor2 = theme.floorColor2;
    });

    // Environment
    s.on('environment-changed', (data) => {
      this.roomConfig.environment = data.environment;
      Board.init(this.roomConfig.gridSize, data.environment);
      UI.showNotification(`Environnement changé : ${data.environment}`);
    });

    // Grid resize
    s.on('grid-resized', (data) => {
      this.roomConfig.gridSize = data.size;
      Board.init(data.size, this.roomConfig.environment);
      this.player.x = Math.min(this.player.x, data.size - 1);
      this.player.y = Math.min(this.player.y, data.size - 1);
      UI.showNotification(`Grille redimensionnée : ${data.size}x${data.size}`);
    });

    // Reactions
    s.on('reaction', (data) => {
      const rp = Network.remotePlayers.get(data.socketId);
      const x = rp ? rp.renderX : this.player.x;
      const y = rp ? rp.renderY : this.player.y;
      this.addReaction(data.socketId, data.emoji, x, y);
    });

    // Hands
    s.on('hand-toggled', (data) => {
      const rp = Network.remotePlayers.get(data.socketId);
      if (rp) rp.handRaised = data.handRaised;
      if (data.socketId === Network.mySocketId) this.player.handRaised = data.handRaised;
    });
    s.on('all-hands-lowered', () => {
      this.player.handRaised = false;
      for (const [, rp] of Network.remotePlayers) rp.handRaised = false;
      UI.showNotification('L\'admin a baissé les mains');
    });

    // Effects
    s.on('effect-triggered', (data) => {
      if (data.type === 'confetti') this.triggerConfetti();
      else if (data.type === 'applause') this.triggerApplause();
    });
    s.on('spotlight-changed', (data) => {
      this.spotlight = data.active ? data.targetSocketId : null;
    });

    // Votes
    s.on('vote-created', (vote) => UI.showVotePopup(vote));
    s.on('vote-updated', (vote) => UI.updateVotePopup(vote));
    s.on('vote-ended', (vote) => {
      UI.updateVotePopup(vote);
      setTimeout(() => UI.hideVotePopup(), 5000);
    });

    // Timers
    s.on('timer-created', (timer) => UI.showTimer(timer));
    s.on('timer-ended', () => UI.showNotification('Timer terminé !'));
    s.on('timer-paused', (data) => {
      if (UI.activeTimer) UI.activeTimer.paused = data.paused;
    });

    // Furniture
    s.on('furniture-added', (item) => {
      Board.furniture.push(item);
      Board.buildCollisionMap();
    });
    s.on('furniture-removed', (data) => {
      Board.furniture = Board.furniture.filter(f => f.id !== data.furnitureId);
      Board.buildCollisionMap();
    });
  },

  parseRoomConfig() {
    const params = new URLSearchParams(window.location.search);
    this.roomConfig.roomId = params.get('room');
    this.roomConfig.name = params.get('name') || 'Room';
    this.roomConfig.environment = params.get('env') || 'open-space';
    this.roomConfig.gridSize = Math.min(CONSTANTS.GRID_MAX, Math.max(CONSTANTS.GRID_MIN, parseInt(params.get('size')) || CONSTANTS.GRID_DEFAULT));
    this.roomConfig.isCreator = params.get('creator') === 'true';
  },

  async checkRoom() {
    if (!this.roomConfig.roomId) { UI.showError('Aucun ID de room spécifié'); return; }

    if (!this.roomConfig.isCreator) {
      try {
        const resp = await fetch(`/api/rooms/${this.roomConfig.roomId}`);
        if (resp.ok) {
          const info = await resp.json();
          this.roomConfig.name = info.name;
          this.roomConfig.environment = info.environment;
          this.roomConfig.gridSize = info.gridSize;
          if (info.participantCount >= info.maxParticipants) {
            UI.showError(`Cette room est pleine (${info.participantCount}/${info.maxParticipants})`);
            return;
          }
          UI.showRoomInfo(info);
        } else {
          UI.showError('Room introuvable');
          return;
        }
      } catch (e) { /* proceed */ }
    }

    Board.init(this.roomConfig.gridSize, this.roomConfig.environment);

    UI.initAvatarConfig(async (config) => {
      this.player.pseudo = config.pseudo;
      this.player.colors = config.colors;

      // Request microphone
      const micGranted = await Audio.requestMicrophone();
      this.player.isMuted = !micGranted;
      UI.updateMuteButton(this.player.isMuted);

      this.joinRoom();
    });

    document.getElementById('hud-room-name').textContent = this.roomConfig.name;
  },

  joinRoom() {
    Network.joinRoom(this.roomConfig.roomId, {
      pseudo: this.player.pseudo,
      colors: this.player.colors,
      isCreator: this.roomConfig.isCreator,
      roomName: this.roomConfig.name,
      environment: this.roomConfig.environment,
      gridSize: this.roomConfig.gridSize,
    }, (response) => {
      if (response.error) {
        const msgs = {
          room_not_found: 'Room introuvable',
          room_full: 'Cette room est pleine (20/20)',
          room_closed: 'Cette room a été fermée',
        };
        UI.showError(msgs[response.error] || 'Erreur de connexion');
        return;
      }

      this.player.x = response.you.x;
      this.player.y = response.you.y;
      this.player.role = response.you.role;
      this.player.isAdmin = response.you.isAdmin;
      this.roomConfig.name = response.room.name;
      this.roomConfig.environment = response.room.environment;
      this.roomConfig.gridSize = response.room.gridSize;

      document.getElementById('hud-room-name').textContent = this.roomConfig.name;

      if (!this.roomConfig.isCreator) {
        Board.init(response.room.gridSize, response.room.environment);
      }

      // Load tables
      if (response.tables) {
        for (const t of response.tables) this.tables.set(t.id, t);
      }

      UI.showCopyLink(this.roomConfig.roomId);
      UI.updateAdminUI(this.player.isAdmin);
      this.start();
    });
  },

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  generateStars() {
    this.stars = [];
    for (let i = 0; i < 80; i++) {
      this.stars.push({
        x: Math.random(), y: Math.random(),
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.5 + 0.2,
        twinkleSpeed: Math.random() * 2 + 1,
      });
    }
  },

  onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    this.keys[e.code] = true;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();

    // Shortcuts
    if (e.code === 'KeyM') { const m = Audio.toggleMute(); this.player.isMuted = m; UI.updateMuteButton(m); }
    if (e.code === 'KeyH') { Network.socket.emit('toggle-hand', {}); }
    if (e.code === 'Tab') { e.preventDefault(); const mc = document.getElementById('minimap-container'); if (mc) mc.style.display = mc.style.display === 'none' ? 'block' : 'none'; }
    if (e.key === '?') { UI.toggleShortcutsModal(); }
    if (e.code === 'Escape') {
      UI.hideContextMenu();
      if (UI.shortcutsModalOpen) UI.toggleShortcutsModal();
      const vp = document.getElementById('vote-popup'); if (vp) vp.style.display = 'none';
    }

    // Reaction shortcuts 1-6
    const reactionMap = { 'Digit1': '👍', 'Digit2': '👏', 'Digit3': '❓', 'Digit4': '💡', 'Digit5': '❤️', 'Digit6': '😂' };
    if (reactionMap[e.code]) this.sendReaction(reactionMap[e.code]);
  },

  onKeyUp(e) { this.keys[e.code] = false; },

  onRightClick(e) {
    if (!this.started) return;
    const gridPos = Board.screenToGrid(e.clientX, e.clientY, this.camera.x, this.camera.y);

    // Check if clicking on a remote player
    for (const [sid, rp] of Network.remotePlayers) {
      const dist = Math.sqrt((gridPos.x - rp.renderX) ** 2 + (gridPos.y - rp.renderY) ** 2);
      if (dist < 1.5) {
        UI.showContextMenu(e.clientX, e.clientY, sid, rp);
        return;
      }
    }
  },

  sendReaction(emoji) {
    Network.socket.emit('reaction', { emoji });
    this.addReaction(Network.mySocketId, emoji, this.player.x, this.player.y);
  },

  addReaction(socketId, emoji, x, y) {
    this.reactions.push({
      socketId, emoji, x, y,
      opacity: 1,
      offsetY: 0,
      createdAt: Date.now(),
    });
  },

  triggerConfetti() {
    for (let i = 0; i < 100; i++) {
      this.confetti.push({
        x: Math.random() * this.canvas.width,
        y: -Math.random() * 200,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        color: ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF78C4'][Math.floor(Math.random() * 5)],
        size: Math.random() * 6 + 2,
        opacity: 1,
      });
    }
  },

  triggerApplause() {
    // Create clap emojis from all avatars
    for (const [sid, rp] of Network.remotePlayers) {
      this.addReaction(sid, '👏', rp.renderX, rp.renderY);
    }
    this.addReaction(Network.mySocketId, '👏', this.player.x, this.player.y);
  },

  start() {
    if (this.started) return;
    this.started = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);

    // Start timer display update
    setInterval(() => { if (UI.activeTimer) UI.updateTimerDisplay(); }, 1000);
  },

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;
    this.update(dt);
    this.render(timestamp);
    requestAnimationFrame((t) => this.loop(t));
  },

  update(dt) {
    let dx = 0, dy = 0;
    if (this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['KeyZ']) dy = -1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) dy = 1;
    if (this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['KeyQ']) dx = -1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) dx = 1;

    const isMoving = dx !== 0 || dy !== 0;
    if (isMoving) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len; dy /= len;
      const speed = CONSTANTS.MOVE_SPEED * 60;
      const newX = this.player.x + dx * speed * dt;
      const newY = this.player.y + dy * speed * dt;
      if (!Board.isSolid(newX, this.player.y) && Board.isInBounds(newX, this.player.y)) this.player.x = newX;
      if (!Board.isSolid(this.player.x, newY) && Board.isInBounds(this.player.x, newY)) this.player.y = newY;
      this.player.x = Math.max(0.5, Math.min(Board.gridSize - 0.5, this.player.x));
      this.player.y = Math.max(0.5, Math.min(Board.gridSize - 0.5, this.player.y));
      this.player.direction = { dx, dy };
      this.player.isWalking = true;
      this.player.walkPhase += CONSTANTS.ANIMATION_SPEED * 60 * dt;
    } else {
      this.player.isWalking = false;
    }

    Network.sendPosition(this.player.x, this.player.y, this.player.direction, this.player.isWalking, this.player.walkPhase);
    Network.updateRemotePlayers(dt);

    // Audio proximity update
    Audio.updateProximity(this.player, Network.remotePlayers, CONSTANTS.AUDIO_RADIUS);

    // Camera
    const targetCamX = this.canvas.width / 2;
    const targetCamY = this.canvas.height / 2;
    const playerScreen = Board.iso(this.player.x, this.player.y);
    this.camera.x += (targetCamX - playerScreen.x - this.camera.x) * 0.1;
    this.camera.y += (targetCamY - playerScreen.y - this.camera.y) * 0.1;

    // Update reactions
    this.reactions = this.reactions.filter(r => {
      r.offsetY -= dt * 30;
      r.opacity -= dt * 0.5;
      return r.opacity > 0;
    });

    // Update confetti
    this.confetti = this.confetti.filter(c => {
      c.x += c.vx;
      c.y += c.vy;
      c.opacity -= 0.005;
      return c.opacity > 0 && c.y < this.canvas.height;
    });

    UI.updateHUD(this.roomConfig.name, this.player.x, this.player.y, Network.getParticipantCount());
  },

  render(timestamp) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ox = this.camera.x;
    const oy = this.camera.y;

    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, w, h);
    this.drawStars(ctx, w, h, timestamp);
    this.drawBoardGlow(ctx, w, h);
    Board.drawGrid(ctx, ox, oy, this.player.x, this.player.y);

    // Collect entities for depth sort
    const entities = [];
    for (const item of Board.furniture) {
      const def = Environments.furnitureTypes[item.type];
      entities.push({ type: 'furniture', item, sortKey: item.x + item.y + (def ? (def.width + def.height) / 2 : 0) });
    }

    // Tables
    for (const [, table] of this.tables) {
      entities.push({ type: 'table', table, sortKey: table.x + table.y + (table.width + table.height) / 2 });
    }

    // Local player
    entities.push({ type: 'local-player', sortKey: this.player.x + this.player.y });

    // Remote players
    for (const [sid, p] of Network.remotePlayers) {
      if (p.opacity <= 0) continue;
      entities.push({ type: 'remote-player', player: p, socketId: sid, sortKey: p.renderX + p.renderY });
    }

    entities.sort((a, b) => a.sortKey - b.sortKey);

    for (const entity of entities) {
      if (entity.type === 'furniture') {
        Board.drawFurnitureItem(ctx, entity.item, ox, oy);
      } else if (entity.type === 'table') {
        this.drawTable(ctx, entity.table, ox, oy);
      } else if (entity.type === 'local-player') {
        const onStage = Board.isOnStage(Math.floor(this.player.x), Math.floor(this.player.y));
        Character.draw(ctx, this.player.x, this.player.y, ox, oy, {
          colors: this.player.colors,
          direction: this.player.direction,
          walkPhase: this.player.walkPhase,
          isWalking: this.player.isWalking,
          pseudo: this.player.pseudo,
          isOnStage: onStage,
          isAdmin: this.player.isAdmin,
          isMuted: this.player.isMuted,
          handRaised: this.player.handRaised,
        });
      } else if (entity.type === 'remote-player') {
        const p = entity.player;
        const onStage = Board.isOnStage(Math.floor(p.renderX), Math.floor(p.renderY));
        ctx.save();
        ctx.globalAlpha = p.opacity;
        if (this.spotlight && this.spotlight !== entity.socketId) ctx.globalAlpha *= 0.4;
        Character.draw(ctx, p.renderX, p.renderY, ox, oy, {
          colors: p.colors,
          direction: p.direction,
          walkPhase: p.walkPhase,
          isWalking: p.isWalking,
          pseudo: p.pseudo,
          isOnStage: onStage,
          isAdmin: p.isAdmin,
          disconnected: p.disconnected,
          isMuted: p.isMuted,
          handRaised: p.handRaised,
        });
        ctx.restore();
      }
    }

    // Screen share
    ScreenShare.drawGlobalShare(ctx, ox, oy, Board.gridSize);

    // Proximity radius
    this.drawProximityRadius(ctx, ox, oy);

    // Reactions
    this.drawReactions(ctx, ox, oy);

    // Confetti
    this.drawConfetti(ctx);

    // Minimap
    this.drawMinimap();
  },

  drawTable(ctx, table, ox, oy) {
    const cx = table.x + table.width / 2;
    const cy = table.y + table.height / 2;
    const pos = Board.iso(cx, cy);
    const sx = pos.x + ox;
    const sy = pos.y + oy;
    const tw = Board.tileWidth * Math.cos(Math.PI / 6);

    // Table surface
    const w = tw * table.width * 0.4;
    const d = Board.tileHeight * table.height * 0.4;
    const h = 10;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, w * 0.6, d * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();

    // Top
    ctx.beginPath();
    ctx.moveTo(sx, sy - h - d * 0.5);
    ctx.lineTo(sx + w * 0.5, sy - h);
    ctx.lineTo(sx, sy - h + d * 0.5);
    ctx.lineTo(sx - w * 0.5, sy - h);
    ctx.closePath();
    ctx.fillStyle = '#8B6B3E';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Sides
    ctx.beginPath();
    ctx.moveTo(sx + w * 0.5, sy - h);
    ctx.lineTo(sx, sy - h + d * 0.5);
    ctx.lineTo(sx, sy + d * 0.5);
    ctx.lineTo(sx + w * 0.5, sy);
    ctx.closePath();
    ctx.fillStyle = '#5A3E28';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sx - w * 0.5, sy - h);
    ctx.lineTo(sx, sy - h + d * 0.5);
    ctx.lineTo(sx, sy + d * 0.5);
    ctx.lineTo(sx - w * 0.5, sy);
    ctx.closePath();
    ctx.fillStyle = '#6B4F2E';
    ctx.fill();

    // Name label
    if (table.name) {
      ctx.font = 'bold 9px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(table.name, sx, sy - h - d * 0.5 - 10);
    }

    // Participant count
    if (table.participantCount > 0) {
      ctx.font = '8px "Segoe UI", sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.fillText(`${table.participantCount} pers.`, sx, sy - h - d * 0.5 - 2);
    }

    // Proximity ring (dashed)
    const radiusX = table.radius * tw * 0.5;
    const radiusY = table.radius * Board.tileHeight * 0.5;
    ctx.beginPath();
    ctx.ellipse(sx, sy - h / 2, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.1)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.setLineDash([]);
  },

  drawReactions(ctx, ox, oy) {
    for (const r of this.reactions) {
      const pos = Board.iso(r.x, r.y);
      const sx = pos.x + ox;
      const sy = pos.y + oy + r.offsetY - 40;
      ctx.globalAlpha = r.opacity;
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(r.emoji, sx, sy);
      ctx.globalAlpha = 1;
    }
  },

  drawConfetti(ctx) {
    for (const c of this.confetti) {
      ctx.globalAlpha = c.opacity;
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.size, c.size * 0.6);
      ctx.globalAlpha = 1;
    }
  },

  drawStars(ctx, w, h, timestamp) {
    for (const star of this.stars) {
      const alpha = star.alpha * (0.5 + 0.5 * Math.sin(timestamp / 1000 * star.twinkleSpeed));
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * h * 0.4, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
      ctx.fill();
    }
  },

  drawBoardGlow(ctx, w, h) {
    const cs = Board.iso(Board.gridSize / 2, Board.gridSize / 2);
    const gx = cs.x + this.camera.x;
    const gy = cs.y + this.camera.y;
    const gradient = ctx.createRadialGradient(gx, gy, 50, gx, gy, 400);
    gradient.addColorStop(0, 'rgba(126, 184, 218, 0.04)');
    gradient.addColorStop(1, 'rgba(126, 184, 218, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  },

  drawProximityRadius(ctx, ox, oy) {
    const pos = Board.iso(this.player.x, this.player.y);
    const sx = pos.x + ox;
    const sy = pos.y + oy;
    const tw = Board.tileWidth * Math.cos(Math.PI / 6);
    const radiusX = CONSTANTS.AUDIO_RADIUS * tw * 0.5;
    const radiusY = CONSTANTS.AUDIO_RADIUS * Board.tileHeight * 0.5;

    ctx.beginPath();
    ctx.ellipse(sx, sy, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(126, 184, 218, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(126, 184, 218, 0.03)';
    ctx.fill();
  },

  drawMinimap() {
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const scale = Math.min(w, h) / Board.gridSize;

    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < Board.gridSize; y++) {
      for (let x = 0; x < Board.gridSize; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? Board.floorColor1 : Board.floorColor2;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    for (const item of Board.furniture) {
      const def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      ctx.fillStyle = def.isStage ? '#9A7E68' : def.color;
      ctx.fillRect(item.x * scale, item.y * scale, def.width * scale, def.height * scale);
    }

    for (const [, table] of this.tables) {
      ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
      ctx.fillRect(table.x * scale, table.y * scale, table.width * scale, table.height * scale);
    }

    for (const [, p] of Network.remotePlayers) {
      if (p.opacity <= 0) continue;
      ctx.fillStyle = p.disconnected ? 'rgba(255,255,100,0.5)' : '#6BFF6B';
      ctx.beginPath();
      ctx.arc(p.renderX * scale, p.renderY * scale, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#6B9FFF';
    ctx.beginPath();
    ctx.arc(this.player.x * scale, this.player.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(126, 184, 218, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  },
};

window.addEventListener('DOMContentLoaded', () => Engine.init());
