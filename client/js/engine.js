// Engine: main game loop, input, camera, zoom, rendering, reactions, effects

const Engine = {
  canvas: null,
  ctx: null,
  minimapCanvas: null,
  minimapCtx: null,

  player: {
    x: 10, y: 10,
    direction: { dx: 0, dy: 1 },
    walkPhase: 0, isWalking: false,
    pseudo: '', colors: { ...CONSTANTS.DEFAULT_COLORS },
    role: 'participant', isAdmin: false,
    isMuted: true, tableId: null, handRaised: false,
    isBroadcasting: false,
  },

  camera: { x: 0, y: 0 },
  zoom: CONSTANTS.ZOOM_DEFAULT,
  keys: {},

  roomConfig: {
    name: 'Room', environment: 'bureau',
    gridSize: 25, roomId: null, isCreator: false,
  },

  stars: [],
  lastTime: 0,
  started: false,
  reactions: [],
  confetti: [],
  spotlight: null,
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
    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('beforeunload', () => { Network.leaveRoom(); Audio.destroy(); });
    window.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onRightClick(e); });
    this.canvas.addEventListener('click', (e) => { UI.hideContextMenu(); });

    Network.init();
    Audio.init();
    UI.initToolbar();

    Network.onParticipantJoined = (d) => UI.showNotification(`${d.pseudo} a rejoint`);
    Network.onParticipantLeft = (d) => UI.showNotification(`${d.pseudo} a quitté`);
    Network.onParticipantDisconnected = (d) => UI.showNotification(`${d.pseudo} déconnecté`);
    Network.onReconnecting = () => UI.showReconnecting(true);
    Network.onReconnected = () => { UI.showReconnecting(false); UI.showNotification('Reconnecté !'); };

    this.setupNetworkEvents();
    this.checkRoom();
  },

  setupNetworkEvents() {
    const s = Network.socket;
    s.on('rtc-offer', (d) => Audio.handleOffer(d.fromSocketId, d.offer));
    s.on('rtc-answer', (d) => Audio.handleAnswer(d.fromSocketId, d.answer));
    s.on('rtc-ice-candidate', (d) => Audio.handleIceCandidate(d.fromSocketId, d.candidate));
    s.on('screen-rtc-offer', (d) => ScreenShare.handleScreenOffer(d.fromSocketId, d.offer));
    s.on('screen-rtc-answer', (d) => ScreenShare.handleScreenAnswer(d.fromSocketId, d.answer));
    s.on('screen-rtc-ice-candidate', (d) => ScreenShare.handleScreenIceCandidate(d.fromSocketId, d.candidate));
    s.on('screen-share-started', (d) => {
      ScreenShare.activeGlobalShare = { socketId: d.socketId, pseudo: d.pseudo };
      UI.showNotification(`${d.pseudo} partage son écran`);
    });
    s.on('screen-share-stopped', (d) => {
      ScreenShare.removeShare(d.socketId);
      UI.showNotification('Partage terminé');
    });
    s.on('role-changed', (d) => {
      if (d.socketId === Network.mySocketId) {
        this.player.isAdmin = d.isAdmin;
        UI.updateAdminUI(d.isAdmin);
        UI.showNotification(d.isAdmin ? 'Vous êtes admin !' : 'Rôle admin retiré');
      }
      const rp = Network.remotePlayers.get(d.socketId);
      if (rp) rp.isAdmin = d.isAdmin;
    });
    s.on('kicked', (d) => { alert(d.reason || 'Exclu'); window.location.href = '/client/index.html'; });
    s.on('participant-kicked', (d) => { UI.showNotification(`${d.pseudo} exclu`); Network.remotePlayers.delete(d.socketId); });
    s.on('room-closed', (d) => { alert(d.reason || 'Room fermée'); window.location.href = '/client/index.html'; });
    s.on('participant-mute-changed', (d) => { const r = Network.remotePlayers.get(d.socketId); if (r) r.isMuted = d.muted; });
    s.on('table-created', (t) => this.tables.set(t.id, t));
    s.on('table-deleted', (d) => this.tables.delete(d.tableId));
    s.on('table-renamed', (d) => { const t = this.tables.get(d.tableId); if (t) t.name = d.name; });
    s.on('table-moved', (d) => { const t = this.tables.get(d.tableId); if (t) { t.x = d.x; t.y = d.y; } });
    s.on('participant-table-changed', (d) => {
      const r = Network.remotePlayers.get(d.socketId); if (r) r.tableId = d.tableId;
      if (d.socketId === Network.mySocketId) this.player.tableId = d.tableId;
    });
    s.on('theme-changed', (t) => { if (t.floorColor1) Board.floorColor1 = t.floorColor1; if (t.floorColor2) Board.floorColor2 = t.floorColor2; });
    s.on('environment-changed', (d) => {
      this.roomConfig.environment = d.environment;
      Board.init(this.roomConfig.gridSize, d.environment);
      UI.showNotification(`Environnement: ${d.environment}`);
    });
    s.on('grid-resized', (d) => {
      this.roomConfig.gridSize = d.size;
      Board.init(d.size, this.roomConfig.environment);
      this.player.x = Math.min(this.player.x, d.size - 1);
      this.player.y = Math.min(this.player.y, d.size - 1);
      UI.showNotification(`Grille: ${d.size}x${d.size}`);
    });
    // Reactions from others only (local already added in sendReaction)
    s.on('reaction', (d) => {
      const r = Network.remotePlayers.get(d.socketId);
      if (r) this.addReaction(d.emoji, r.renderX, r.renderY);
    });
    s.on('hand-toggled', (d) => {
      const r = Network.remotePlayers.get(d.socketId); if (r) r.handRaised = d.handRaised;
      if (d.socketId === Network.mySocketId) this.player.handRaised = d.handRaised;
    });
    s.on('all-hands-lowered', () => {
      this.player.handRaised = false;
      for (const [, r] of Network.remotePlayers) r.handRaised = false;
    });
    s.on('effect-triggered', (d) => {
      if (d.type === 'confetti') this.triggerConfetti();
      if (d.type === 'applause') this.triggerApplause();
    });
    s.on('spotlight-changed', (d) => { this.spotlight = d.active ? d.targetSocketId : null; });
    s.on('vote-created', (v) => UI.showVotePopup(v));
    s.on('vote-updated', (v) => UI.updateVotePopup(v));
    s.on('vote-ended', (v) => { UI.updateVotePopup(v); setTimeout(() => UI.hideVotePopup(), 5000); });
    s.on('timer-created', (t) => UI.showTimer(t));
    s.on('timer-ended', () => UI.showNotification('Timer terminé !'));
    s.on('timer-paused', (d) => { if (UI.activeTimer) UI.activeTimer.paused = d.paused; });
    s.on('furniture-added', (i) => { Board.furniture.push(i); Board.buildCollisionMap(); });
    s.on('furniture-removed', (d) => { Board.furniture = Board.furniture.filter(f => f.id !== d.furnitureId); Board.buildCollisionMap(); });
    // Admin broadcast
    s.on('admin-broadcast-start', (d) => {
      const r = Network.remotePlayers.get(d.socketId);
      if (r) r.isBroadcasting = true;
      UI.showNotification(`${d.pseudo} parle à tout le monde`);
    });
    s.on('admin-broadcast-stop', (d) => {
      const r = Network.remotePlayers.get(d.socketId);
      if (r) r.isBroadcasting = false;
    });
  },

  parseRoomConfig() {
    const p = new URLSearchParams(window.location.search);
    this.roomConfig.roomId = p.get('room');
    this.roomConfig.name = p.get('name') || 'Room';
    this.roomConfig.environment = p.get('env') || 'open-space';
    this.roomConfig.gridSize = Math.min(CONSTANTS.GRID_MAX, Math.max(CONSTANTS.GRID_MIN, parseInt(p.get('size')) || CONSTANTS.GRID_DEFAULT));
    this.roomConfig.isCreator = p.get('creator') === 'true';
  },

  async checkRoom() {
    if (!this.roomConfig.roomId) { UI.showError('Aucun ID de room'); return; }
    if (!this.roomConfig.isCreator) {
      try {
        const resp = await fetch(`/api/rooms/${this.roomConfig.roomId}`);
        if (resp.ok) {
          const info = await resp.json();
          this.roomConfig.name = info.name;
          this.roomConfig.environment = info.environment;
          this.roomConfig.gridSize = info.gridSize;
          if (info.participantCount >= info.maxParticipants) { UI.showError('Room pleine'); return; }
          UI.showRoomInfo(info);
        } else { UI.showError('Room introuvable'); return; }
      } catch (e) { /* proceed */ }
    }
    Board.init(this.roomConfig.gridSize, this.roomConfig.environment);
    UI.initAvatarConfig(async (config) => {
      this.player.pseudo = config.pseudo;
      this.player.colors = config.colors;
      const mic = await Audio.requestMicrophone();
      this.player.isMuted = !mic;
      UI.updateMuteButton(this.player.isMuted);
      this.joinRoom();
    });
    document.getElementById('hud-room-name').textContent = this.roomConfig.name;
  },

  joinRoom() {
    Network.joinRoom(this.roomConfig.roomId, {
      pseudo: this.player.pseudo, colors: this.player.colors,
      isCreator: this.roomConfig.isCreator, roomName: this.roomConfig.name,
      environment: this.roomConfig.environment, gridSize: this.roomConfig.gridSize,
    }, (r) => {
      if (r.error) {
        const m = { room_not_found: 'Room introuvable', room_full: 'Room pleine', room_closed: 'Room fermée' };
        UI.showError(m[r.error] || 'Erreur'); return;
      }
      this.player.x = r.you.x; this.player.y = r.you.y;
      this.player.role = r.you.role; this.player.isAdmin = r.you.isAdmin;
      this.roomConfig.name = r.room.name;
      this.roomConfig.environment = r.room.environment;
      this.roomConfig.gridSize = r.room.gridSize;
      document.getElementById('hud-room-name').textContent = this.roomConfig.name;
      if (!this.roomConfig.isCreator) Board.init(r.room.gridSize, r.room.environment);
      if (r.tables) for (const t of r.tables) this.tables.set(t.id, t);
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
    for (let i = 0; i < 120; i++) {
      this.stars.push({
        x: Math.random(), y: Math.random(),
        size: Math.random() * 1.5 + 0.3,
        alpha: Math.random() * 0.4 + 0.1,
        speed: Math.random() * 2 + 0.5,
      });
    }
  },

  onWheel(e) {
    if (!this.started) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -CONSTANTS.ZOOM_STEP : CONSTANTS.ZOOM_STEP;
    this.zoom = Math.max(CONSTANTS.ZOOM_MIN, Math.min(CONSTANTS.ZOOM_MAX, this.zoom + delta));
  },

  onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    this.keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();

    // Shortcuts
    if (e.code === 'KeyM') { const m = Audio.toggleMute(); this.player.isMuted = m; UI.updateMuteButton(m); }
    if (e.code === 'KeyH') Network.socket.emit('toggle-hand', {});
    if (e.code === 'Tab') { e.preventDefault(); const mc = document.getElementById('minimap-container'); if (mc) mc.style.display = mc.style.display === 'none' ? 'block' : 'none'; }
    if (e.key === '?') UI.toggleShortcutsModal();
    if (e.code === 'Escape') {
      UI.hideContextMenu();
      if (UI.shortcutsModalOpen) UI.toggleShortcutsModal();
      if (UI.adminPanelOpen) UI.toggleAdminPanel();
      const vp = document.getElementById('vote-popup'); if (vp) vp.style.display = 'none';
    }

    // Admin broadcast: hold Space to talk to everyone
    if (e.code === 'Space' && this.player.isAdmin && !this.player.isBroadcasting) {
      this.player.isBroadcasting = true;
      Network.socket.emit('admin-broadcast-start');
    }

    // Reactions 1-6
    const rMap = { 'Digit1': '👍', 'Digit2': '👏', 'Digit3': '❓', 'Digit4': '💡', 'Digit5': '❤️', 'Digit6': '😂' };
    if (rMap[e.code]) this.sendReaction(rMap[e.code]);
  },

  onKeyUp(e) {
    this.keys[e.code] = false;
    if (e.code === 'Space' && this.player.isBroadcasting) {
      this.player.isBroadcasting = false;
      Network.socket.emit('admin-broadcast-stop');
    }
  },

  onRightClick(e) {
    if (!this.started) return;
    const gp = Board.screenToGrid(e.clientX, e.clientY, this.camera.x, this.camera.y, this.zoom);
    for (const [sid, rp] of Network.remotePlayers) {
      const dist = Math.sqrt((gp.x - rp.renderX) ** 2 + (gp.y - rp.renderY) ** 2);
      if (dist < 1.5) { UI.showContextMenu(e.clientX, e.clientY, sid, rp); return; }
    }
  },

  sendReaction(emoji) {
    Network.socket.emit('reaction', { emoji });
    this.addReaction(emoji, this.player.x, this.player.y);
  },

  addReaction(emoji, x, y) {
    this.reactions.push({ emoji, x, y, opacity: 1.2, offsetY: 0, scale: 0.5, createdAt: Date.now() });
  },

  triggerConfetti() {
    for (let i = 0; i < 120; i++) {
      this.confetti.push({
        x: Math.random() * this.canvas.width, y: -Math.random() * 300,
        vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4 + 2,
        color: ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF78C4', '#A78BFA'][Math.floor(Math.random() * 6)],
        size: Math.random() * 8 + 3, rotation: Math.random() * Math.PI, opacity: 1,
      });
    }
  },

  triggerApplause() {
    for (const [, r] of Network.remotePlayers) this.addReaction('👏', r.renderX, r.renderY);
    this.addReaction('👏', this.player.x, this.player.y);
  },

  start() {
    if (this.started) return;
    this.started = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
    setInterval(() => { if (UI.activeTimer) UI.updateTimerDisplay(); }, 1000);
  },

  loop(ts) {
    const dt = Math.min((ts - this.lastTime) / 1000, 0.1);
    this.lastTime = ts;
    this.update(dt);
    this.render(ts);
    requestAnimationFrame((t) => this.loop(t));
  },

  update(dt) {
    let dx = 0, dy = 0;
    if (this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['KeyZ']) dy = -1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) dy = 1;
    if (this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['KeyQ']) dx = -1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) dx = 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len; dy /= len;
      const speed = CONSTANTS.MOVE_SPEED * 60;
      const nx = this.player.x + dx * speed * dt;
      const ny = this.player.y + dy * speed * dt;
      if (!Board.isSolid(nx, this.player.y) && Board.isInBounds(nx, this.player.y)) this.player.x = nx;
      if (!Board.isSolid(this.player.x, ny) && Board.isInBounds(this.player.x, ny)) this.player.y = ny;
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
    Audio.updateProximity(this.player, Network.remotePlayers, CONSTANTS.AUDIO_RADIUS);

    // Camera follow
    const ps = Board.iso(this.player.x, this.player.y);
    const tcx = this.canvas.width / 2 - ps.x * this.zoom;
    const tcy = this.canvas.height / 2 - ps.y * this.zoom;
    this.camera.x += (tcx - this.camera.x) * 0.08;
    this.camera.y += (tcy - this.camera.y) * 0.08;

    // Update reactions
    this.reactions = this.reactions.filter(r => {
      r.offsetY -= dt * 40;
      r.opacity -= dt * 0.45;
      r.scale = Math.min(1, r.scale + dt * 3);
      return r.opacity > 0;
    });

    // Update confetti
    this.confetti = this.confetti.filter(c => {
      c.x += c.vx; c.y += c.vy; c.vy += 0.05;
      c.rotation += 0.05; c.opacity -= 0.004;
      return c.opacity > 0 && c.y < this.canvas.height + 50;
    });

    UI.updateHUD(this.roomConfig.name, this.player.x, this.player.y, Network.getParticipantCount(), this.zoom);
  },

  render(ts) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = '#080818';
    ctx.fillRect(0, 0, w, h);

    this.drawStars(ctx, w, h, ts);
    this.drawBoardGlow(ctx, w, h);

    // Apply zoom
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.zoom, this.zoom);

    Board.drawGrid(ctx, 0, 0, this.player.x, this.player.y, this.zoom);

    // Collect & sort entities
    const ents = [];
    for (const item of Board.furniture) {
      const def = Environments.furnitureTypes[item.type];
      if (def && (def.isZone || def.isCarpet)) continue; // already drawn under grid
      ents.push({ type: 'furn', item, sk: item.x + item.y + (def ? (def.width + def.height) / 2 : 0) });
    }
    for (const [, t] of this.tables) ents.push({ type: 'table', t, sk: t.x + t.y + (t.width + t.height) / 2 });
    ents.push({ type: 'local', sk: this.player.x + this.player.y });
    for (const [sid, p] of Network.remotePlayers) {
      if (p.opacity <= 0) continue;
      ents.push({ type: 'remote', p, sid, sk: p.renderX + p.renderY });
    }
    ents.sort((a, b) => a.sk - b.sk);

    for (const e of ents) {
      if (e.type === 'furn') Board.drawFurnitureItem(ctx, e.item, 0, 0);
      else if (e.type === 'table') this.drawTable(ctx, e.t, 0, 0);
      else if (e.type === 'local') {
        const onS = Board.isOnStage(Math.floor(this.player.x), Math.floor(this.player.y));
        Character.draw(ctx, this.player.x, this.player.y, 0, 0, {
          colors: this.player.colors, direction: this.player.direction,
          walkPhase: this.player.walkPhase, isWalking: this.player.isWalking,
          pseudo: this.player.pseudo, isOnStage: onS, isAdmin: this.player.isAdmin,
          isMuted: this.player.isMuted, handRaised: this.player.handRaised,
          isBroadcasting: this.player.isBroadcasting,
        });
      } else if (e.type === 'remote') {
        const p = e.p;
        const onS = Board.isOnStage(Math.floor(p.renderX), Math.floor(p.renderY));
        ctx.save();
        ctx.globalAlpha = p.opacity;
        if (this.spotlight && this.spotlight !== e.sid) ctx.globalAlpha *= 0.4;
        Character.draw(ctx, p.renderX, p.renderY, 0, 0, {
          colors: p.colors, direction: p.direction,
          walkPhase: p.walkPhase, isWalking: p.isWalking,
          pseudo: p.pseudo, isOnStage: onS, isAdmin: p.isAdmin,
          disconnected: p.disconnected, isMuted: p.isMuted,
          handRaised: p.handRaised, isBroadcasting: p.isBroadcasting,
        });
        ctx.restore();
      }
    }

    // Proximity radius gradient
    this.drawProximityRadius(ctx);

    // Reactions
    this.drawReactions(ctx);

    ctx.restore(); // end zoom

    // Confetti (screen space)
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
    const W = tw * table.width * 0.4;
    const D = Board.tileHeight * table.height * 0.4;
    const H = 10;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + 3, W * 0.55, D * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    // Top
    ctx.beginPath();
    ctx.moveTo(sx, sy - H - D * 0.5);
    ctx.lineTo(sx + W * 0.5, sy - H);
    ctx.lineTo(sx, sy - H + D * 0.5);
    ctx.lineTo(sx - W * 0.5, sy - H);
    ctx.closePath();
    ctx.fillStyle = '#8B6B3E';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Right side
    ctx.beginPath();
    ctx.moveTo(sx + W * 0.5, sy - H);
    ctx.lineTo(sx, sy - H + D * 0.5);
    ctx.lineTo(sx, sy + D * 0.5);
    ctx.lineTo(sx + W * 0.5, sy);
    ctx.closePath();
    ctx.fillStyle = '#5A3E28';
    ctx.fill();

    // Left side
    ctx.beginPath();
    ctx.moveTo(sx - W * 0.5, sy - H);
    ctx.lineTo(sx, sy - H + D * 0.5);
    ctx.lineTo(sx, sy + D * 0.5);
    ctx.lineTo(sx - W * 0.5, sy);
    ctx.closePath();
    ctx.fillStyle = '#6B4F2E';
    ctx.fill();

    // Label
    if (table.name) {
      ctx.font = 'bold 9px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(table.name, sx, sy - H - D * 0.5 - 10);
    }
    if (table.participantCount > 0) {
      ctx.font = '8px "Segoe UI", sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.fillText(`${table.participantCount} pers.`, sx, sy - H - D * 0.5 - 2);
    }
  },

  drawProximityRadius(ctx) {
    const pos = Board.iso(this.player.x, this.player.y);
    const sx = pos.x;
    const sy = pos.y;
    const tw = Board.tileWidth * Math.cos(Math.PI / 6);
    const rx = CONSTANTS.AUDIO_RADIUS * tw * 0.5;
    const ry = CONSTANTS.AUDIO_RADIUS * Board.tileHeight * 0.5;

    // Radial gradient ellipse
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, ry / rx);

    const grad = ctx.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
    grad.addColorStop(0, 'rgba(126, 184, 218, 0.08)');
    grad.addColorStop(0.5, 'rgba(126, 184, 218, 0.04)');
    grad.addColorStop(0.85, 'rgba(126, 184, 218, 0.02)');
    grad.addColorStop(1, 'rgba(126, 184, 218, 0)');

    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Soft outer ring
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(126, 184, 218, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  },

  drawReactions(ctx) {
    for (const r of this.reactions) {
      const pos = Board.iso(r.x, r.y);
      const sx = pos.x;
      const sy = pos.y + r.offsetY - 45;
      ctx.save();
      ctx.globalAlpha = Math.min(1, r.opacity);
      ctx.font = `${Math.floor(24 * r.scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.emoji, sx, sy);
      ctx.restore();
    }
  },

  drawConfetti(ctx) {
    for (const c of this.confetti) {
      ctx.save();
      ctx.globalAlpha = c.opacity;
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size * 0.3, c.size, c.size * 0.6);
      ctx.restore();
    }
  },

  drawStars(ctx, w, h, ts) {
    for (const s of this.stars) {
      const a = s.alpha * (0.5 + 0.5 * Math.sin(ts / 1000 * s.speed));
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h * 0.5, s.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 200, 240, ${a})`;
      ctx.fill();
    }
  },

  drawBoardGlow(ctx, w, h) {
    const cs = Board.iso(Board.gridSize / 2, Board.gridSize / 2);
    const gx = cs.x * this.zoom + this.camera.x;
    const gy = cs.y * this.zoom + this.camera.y;
    const grad = ctx.createRadialGradient(gx, gy, 30, gx, gy, 500);
    grad.addColorStop(0, 'rgba(126, 184, 218, 0.035)');
    grad.addColorStop(1, 'rgba(126, 184, 218, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  },

  drawMinimap() {
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const sc = Math.min(w, h) / Board.gridSize;

    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < Board.gridSize; y++) {
      for (let x = 0; x < Board.gridSize; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? Board.floorColor1 : Board.floorColor2;
        ctx.fillRect(x * sc, y * sc, sc + 0.5, sc + 0.5);
      }
    }

    for (const item of Board.furniture) {
      const def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      ctx.fillStyle = def.isStage ? '#9A7E68' : def.isZone ? 'rgba(126,184,218,0.2)' : def.color;
      ctx.fillRect(item.x * sc, item.y * sc, (def.width || 1) * sc, (def.height || 1) * sc);
    }
    for (const [, t] of this.tables) {
      ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
      ctx.fillRect(t.x * sc, t.y * sc, t.width * sc, t.height * sc);
    }
    for (const [, p] of Network.remotePlayers) {
      if (p.opacity <= 0) continue;
      ctx.fillStyle = p.disconnected ? 'rgba(255,255,100,0.5)' : '#6BFF6B';
      ctx.beginPath(); ctx.arc(p.renderX * sc, p.renderY * sc, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#6B9FFF';
    ctx.beginPath(); ctx.arc(this.player.x * sc, this.player.y * sc, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(126,184,218,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  },
};

window.addEventListener('DOMContentLoaded', () => Engine.init());
