// Engine: game loop, input, camera, zoom, rendering

var Engine = {
  canvas: null, ctx: null,
  minimapCanvas: null, minimapCtx: null,

  player: {
    x: 10, y: 10,
    direction: { dx: 0, dy: 1 },
    walkPhase: 0, isWalking: false,
    pseudo: '', colors: null,
    role: 'participant', isAdmin: false,
    isMuted: true, tableId: null, handRaised: false,
    isBroadcasting: false,
  },

  camera: { x: 0, y: 0 },
  zoom: CONSTANTS.ZOOM_DEFAULT,
  keys: {},
  roomConfig: { name: 'Room', environment: 'bureau', gridSize: 20, roomId: null, isCreator: false },
  lastTime: 0, started: false,
  reactions: [], confetti: [], spotlight: null,
  tables: new Map(),
  // Camera drag state
  isDragging: false, dragStart: { x: 0, y: 0 }, cameraStart: { x: 0, y: 0 },

  init: function() {
    this.player.colors = Object.assign({}, CONSTANTS.DEFAULT_COLORS);
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    this.parseRoomConfig();
    this.resize();

    var self = this;
    window.addEventListener('resize', function() { self.resize(); });
    window.addEventListener('keydown', function(e) { self.onKeyDown(e); });
    window.addEventListener('keyup', function(e) { self.onKeyUp(e); });
    window.addEventListener('wheel', function(e) { self.onWheel(e); }, { passive: false });
    window.addEventListener('beforeunload', function() { Network.leaveRoom(); });
    window.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    this.canvas.addEventListener('mousedown', function(e) { self.onMouseDown(e); });
    this.canvas.addEventListener('mousemove', function(e) { self.onMouseMove(e); });
    this.canvas.addEventListener('mouseup', function(e) { self.onMouseUp(e); });
    this.canvas.addEventListener('click', function(e) { self.onClick(e); });

    Network.init();
    Audio.init();
    UI.initToolbar();

    Network.onParticipantJoined = function(d) { UI.showNotification(d.pseudo + ' a rejoint'); };
    Network.onParticipantLeft = function(d) { UI.showNotification(d.pseudo + ' a quitté'); };
    Network.onParticipantDisconnected = function(d) { UI.showNotification(d.pseudo + ' déconnecté'); };
    Network.onReconnecting = function() { UI.showReconnecting(true); };
    Network.onReconnected = function() { UI.showReconnecting(false); UI.showNotification('Reconnecté !'); };

    this.setupNetworkEvents();
    this.checkRoom();
  },

  setupNetworkEvents: function() {
    var self = this;
    var s = Network.socket;

    // WebRTC
    s.on('rtc-offer', function(d) { Audio.handleOffer(d.fromSocketId, d.offer); });
    s.on('rtc-answer', function(d) { Audio.handleAnswer(d.fromSocketId, d.answer); });
    s.on('rtc-ice-candidate', function(d) { Audio.handleIceCandidate(d.fromSocketId, d.candidate); });
    s.on('screen-rtc-offer', function(d) { ScreenShare.handleScreenOffer(d.fromSocketId, d.offer); });
    s.on('screen-rtc-answer', function(d) { ScreenShare.handleScreenAnswer(d.fromSocketId, d.answer); });
    s.on('screen-rtc-ice-candidate', function(d) { ScreenShare.handleScreenIceCandidate(d.fromSocketId, d.candidate); });
    s.on('screen-share-started', function(d) { ScreenShare.activeGlobalShare = { socketId: d.socketId, pseudo: d.pseudo }; UI.showNotification(d.pseudo + ' partage son écran'); });
    s.on('screen-share-stopped', function(d) { ScreenShare.removeShare(d.socketId); });
    s.on('role-changed', function(d) {
      if (d.socketId === Network.mySocketId) { self.player.isAdmin = d.isAdmin; UI.updateAdminUI(d.isAdmin); }
      var rp = Network.remotePlayers.get(d.socketId); if (rp) rp.isAdmin = d.isAdmin;
    });
    s.on('kicked', function(d) { alert(d.reason || 'Exclu'); window.location.href = '/client/index.html'; });
    s.on('participant-kicked', function(d) { Network.remotePlayers.delete(d.socketId); });
    s.on('room-closed', function(d) { alert('Room fermée'); window.location.href = '/client/index.html'; });
    s.on('participant-mute-changed', function(d) { var r = Network.remotePlayers.get(d.socketId); if (r) r.isMuted = d.muted; });
    s.on('table-created', function(t) { self.tables.set(t.id, t); });
    s.on('table-deleted', function(d) { self.tables.delete(d.tableId); });
    s.on('table-renamed', function(d) { var t = self.tables.get(d.tableId); if (t) t.name = d.name; });
    s.on('table-moved', function(d) { var t = self.tables.get(d.tableId); if (t) { t.x = d.x; t.y = d.y; } });
    s.on('participant-table-changed', function(d) {
      var r = Network.remotePlayers.get(d.socketId); if (r) r.tableId = d.tableId;
      if (d.socketId === Network.mySocketId) self.player.tableId = d.tableId;
    });
    s.on('theme-changed', function(t) { if (t.floorColor1) Board.floorColor1 = t.floorColor1; if (t.floorColor2) Board.floorColor2 = t.floorColor2; });
    s.on('environment-changed', function(d) { self.roomConfig.environment = d.environment; Board.init(self.roomConfig.gridSize, d.environment); });
    s.on('grid-resized', function(d) { self.roomConfig.gridSize = d.size; Board.init(d.size, self.roomConfig.environment); self.player.x = Math.min(self.player.x, d.size - 1); self.player.y = Math.min(self.player.y, d.size - 1); });
    s.on('reaction', function(d) {
      var r = Network.remotePlayers.get(d.socketId);
      if (r) self.addReaction(d.emoji, r.renderX, r.renderY);
    });
    s.on('hand-toggled', function(d) {
      var r = Network.remotePlayers.get(d.socketId); if (r) r.handRaised = d.handRaised;
      if (d.socketId === Network.mySocketId) self.player.handRaised = d.handRaised;
    });
    s.on('all-hands-lowered', function() { self.player.handRaised = false; Network.remotePlayers.forEach(function(r) { r.handRaised = false; }); });
    s.on('effect-triggered', function(d) { if (d.type === 'confetti') self.triggerConfetti(); if (d.type === 'applause') self.triggerApplause(); });
    s.on('spotlight-changed', function(d) { self.spotlight = d.active ? d.targetSocketId : null; });
    s.on('vote-created', function(v) { UI.showVotePopup(v); });
    s.on('vote-updated', function(v) { UI.updateVotePopup(v); });
    s.on('vote-ended', function(v) { UI.updateVotePopup(v); setTimeout(function() { UI.hideVotePopup(); }, 5000); });
    s.on('timer-created', function(t) { UI.showTimer(t); });
    s.on('timer-ended', function() { UI.showNotification('Timer terminé !'); });
    s.on('timer-paused', function(d) { if (UI.activeTimer) UI.activeTimer.paused = d.paused; });
    s.on('furniture-added', function(i) { Board.furniture.push(i); Board.buildCollisionMap(); });
    s.on('furniture-removed', function(d) { Board.furniture = Board.furniture.filter(function(f) { return f.id !== d.furnitureId; }); Board.buildCollisionMap(); });
    s.on('admin-broadcast-start', function(d) { var r = Network.remotePlayers.get(d.socketId); if (r) r.isBroadcasting = true; UI.showNotification(d.pseudo + ' parle à tous'); });
    s.on('admin-broadcast-stop', function(d) { var r = Network.remotePlayers.get(d.socketId); if (r) r.isBroadcasting = false; });
  },

  parseRoomConfig: function() {
    var p = new URLSearchParams(window.location.search);
    this.roomConfig.roomId = p.get('room');
    this.roomConfig.name = p.get('name') || 'Room';
    this.roomConfig.environment = p.get('env') || 'open-space';
    this.roomConfig.gridSize = Math.min(CONSTANTS.GRID_MAX, Math.max(CONSTANTS.GRID_MIN, parseInt(p.get('size')) || CONSTANTS.GRID_DEFAULT));
    this.roomConfig.isCreator = p.get('creator') === 'true';
  },

  checkRoom: function() {
    var self = this;
    if (!this.roomConfig.roomId) { UI.showError('Aucun ID de room'); return; }
    if (!this.roomConfig.isCreator) {
      fetch('/api/rooms/' + this.roomConfig.roomId).then(function(resp) {
        if (!resp.ok) { UI.showError('Room introuvable'); return; }
        return resp.json();
      }).then(function(info) {
        if (!info) return;
        self.roomConfig.name = info.name;
        self.roomConfig.environment = info.environment;
        self.roomConfig.gridSize = info.gridSize;
        if (info.participantCount >= info.maxParticipants) { UI.showError('Room pleine'); return; }
        self.initBoard();
      }).catch(function() { self.initBoard(); });
    } else {
      this.initBoard();
    }
  },

  initBoard: function() {
    var self = this;
    Board.init(this.roomConfig.gridSize, this.roomConfig.environment);
    document.getElementById('hud-room-name').textContent = this.roomConfig.name;
    UI.initAvatarConfig(function(config) {
      self.player.pseudo = config.pseudo;
      self.player.colors = config.colors;
      Audio.requestMicrophone().then(function(mic) {
        self.player.isMuted = !mic;
        UI.updateMuteButton(self.player.isMuted);
        self.joinRoom();
      });
    });
  },

  joinRoom: function() {
    var self = this;
    Network.joinRoom(this.roomConfig.roomId, {
      pseudo: this.player.pseudo, colors: this.player.colors,
      isCreator: this.roomConfig.isCreator, roomName: this.roomConfig.name,
      environment: this.roomConfig.environment, gridSize: this.roomConfig.gridSize,
    }, function(r) {
      if (r.error) { UI.showError(r.error); return; }
      self.player.x = r.you.x; self.player.y = r.you.y;
      self.player.role = r.you.role; self.player.isAdmin = r.you.isAdmin;
      self.roomConfig.name = r.room.name;
      self.roomConfig.environment = r.room.environment;
      self.roomConfig.gridSize = r.room.gridSize;
      document.getElementById('hud-room-name').textContent = r.room.name;
      if (!self.roomConfig.isCreator) Board.init(r.room.gridSize, r.room.environment);
      if (r.tables) r.tables.forEach(function(t) { self.tables.set(t.id, t); });
      UI.showCopyLink(self.roomConfig.roomId);
      UI.updateAdminUI(self.player.isAdmin);
      // Set camera immediately to player
      var ps = Board.iso(self.player.x, self.player.y);
      self.camera.x = self.canvas.width / 2 - ps.x * self.zoom;
      self.camera.y = self.canvas.height / 2 - ps.y * self.zoom;
      self.start();
    });
  },

  resize: function() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; },

  genStars: function() {
    this.stars = [];
    for (var i = 0; i < 100; i++) {
      this.stars.push({ x: Math.random(), y: Math.random(), s: Math.random() * 1.5 + 0.3, a: Math.random() * 0.3 + 0.1, sp: Math.random() * 2 + 0.5 });
    }
  },

  onWheel: function(e) {
    if (!this.started) return;
    e.preventDefault();
    var d = e.deltaY > 0 ? -CONSTANTS.ZOOM_STEP : CONSTANTS.ZOOM_STEP;
    this.zoom = Math.max(CONSTANTS.ZOOM_MIN, Math.min(CONSTANTS.ZOOM_MAX, this.zoom + d));
  },

  onKeyDown: function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    this.keys[e.code] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].indexOf(e.code) >= 0) e.preventDefault();
    if (e.code === 'KeyM') { var m = Audio.toggleMute(); this.player.isMuted = m; UI.updateMuteButton(m); }
    if (e.code === 'KeyH') Network.socket.emit('toggle-hand', {});
    if (e.code === 'Tab') { e.preventDefault(); var mc = document.getElementById('minimap-container'); if (mc) mc.style.display = mc.style.display === 'none' ? 'block' : 'none'; }
    if (e.key === '?') UI.toggleShortcutsModal();
    if (e.code === 'Escape') { UI.hideContextMenu(); if (UI.shortcutsModalOpen) UI.toggleShortcutsModal(); if (UI.adminPanelOpen) UI.toggleAdminPanel(); }
    if (e.code === 'Space' && this.player.isAdmin && !this.player.isBroadcasting) {
      this.player.isBroadcasting = true;
      Network.socket.emit('admin-broadcast-start');
    }
    var rMap = { 'Digit1': '👍', 'Digit2': '👏', 'Digit3': '❓', 'Digit4': '💡', 'Digit5': '❤️', 'Digit6': '😂' };
    if (rMap[e.code]) this.sendReaction(rMap[e.code]);
  },

  onKeyUp: function(e) {
    this.keys[e.code] = false;
    if (e.code === 'Space' && this.player.isBroadcasting) {
      this.player.isBroadcasting = false;
      Network.socket.emit('admin-broadcast-stop');
    }
  },

  onMouseDown: function(e) {
    if (!this.started) return;
    // Right-click or middle-click: camera drag
    if (e.button === 2 || e.button === 1) {
      this.isDragging = true;
      this.dragStart.x = e.clientX;
      this.dragStart.y = e.clientY;
      this.cameraStart.x = this.camera.x;
      this.cameraStart.y = this.camera.y;
      e.preventDefault();
    }
  },

  onMouseMove: function(e) {
    if (this.isDragging) {
      this.camera.x = this.cameraStart.x + (e.clientX - this.dragStart.x);
      this.camera.y = this.cameraStart.y + (e.clientY - this.dragStart.y);
    }
  },

  onMouseUp: function(e) {
    if (e.button === 2 || e.button === 1) {
      // If barely moved, it was a right-click (context menu)
      if (this.isDragging) {
        var movedDist = Math.abs(e.clientX - this.dragStart.x) + Math.abs(e.clientY - this.dragStart.y);
        if (movedDist < 5) {
          // Treat as right-click: show context menu for nearby player
          var gp = Board.screenToGrid(e.clientX, e.clientY, this.camera.x, this.camera.y, this.zoom);
          var self = this;
          Network.remotePlayers.forEach(function(rp, sid) {
            var dist = Math.sqrt((gp.x - rp.renderX) * (gp.x - rp.renderX) + (gp.y - rp.renderY) * (gp.y - rp.renderY));
            if (dist < 1.5) UI.showContextMenu(e.clientX, e.clientY, sid, rp);
          });
        }
      }
      this.isDragging = false;
    }
  },

  onClick: function(e) {
    UI.hideContextMenu();
    if (!this.started) return;
    // Check if clicked on a whiteboard
    var gp = Board.screenToGrid(e.clientX, e.clientY, this.camera.x, this.camera.y, this.zoom);
    var clickX = Math.floor(gp.x);
    var clickY = Math.floor(gp.y);
    for (var i = 0; i < Board.furniture.length; i++) {
      var item = Board.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def || !def.isWhiteboard) continue;
      if (clickX >= item.x && clickX < item.x + def.width && clickY >= item.y && clickY < item.y + def.height) {
        // Find or create whiteboard for this furniture item
        var wbId = item.whiteboardId || ('wb_furn_' + i);
        item.whiteboardId = wbId;
        UI.openWhiteboard(wbId, item);
        return;
      }
    }
  },

  sendReaction: function(emoji) {
    Network.socket.emit('reaction', { emoji: emoji });
    this.addReaction(emoji, this.player.x, this.player.y);
  },

  addReaction: function(emoji, x, y) {
    this.reactions.push({ emoji: emoji, x: x, y: y, opacity: 1.5, offsetY: 0, scale: 0.3, t: 0 });
  },

  triggerConfetti: function() {
    for (var i = 0; i < 100; i++) {
      this.confetti.push({
        x: Math.random() * this.canvas.width, y: -Math.random() * 200,
        vx: (Math.random() - 0.5) * 5, vy: Math.random() * 3 + 2,
        color: ['#FF6B6B','#FFD93D','#6BCB77','#4D96FF','#FF78C4'][Math.floor(Math.random() * 5)],
        size: Math.random() * 6 + 3, rot: Math.random() * 6, opacity: 1,
      });
    }
  },

  triggerApplause: function() {
    var self = this;
    Network.remotePlayers.forEach(function(r) { self.addReaction('👏', r.renderX, r.renderY); });
    this.addReaction('👏', this.player.x, this.player.y);
  },

  start: function() {
    if (this.started) return;
    this.started = true;
    this.lastTime = performance.now();
    var self = this;
    function loop(ts) {
      var dt = Math.min((ts - self.lastTime) / 1000, 0.1);
      self.lastTime = ts;
      self.update(dt);
      self.render(ts);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    setInterval(function() { if (UI.activeTimer) UI.updateTimerDisplay(); }, 1000);
  },

  update: function(dt) {
    var dx = 0, dy = 0;
    if (this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['KeyZ']) dy = -1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) dy = 1;
    if (this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['KeyQ']) dx = -1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) dx = 1;

    if (dx !== 0 || dy !== 0) {
      var len = Math.sqrt(dx * dx + dy * dy);
      dx /= len; dy /= len;
      var speed = CONSTANTS.MOVE_SPEED * 60;
      var nx = this.player.x + dx * speed * dt;
      var ny = this.player.y + dy * speed * dt;
      // Allow movement out of solid tiles (spawned inside furniture)
      var stuckInSolid = Board.isSolid(this.player.x, this.player.y);
      if (stuckInSolid || (!Board.isSolid(nx, this.player.y) && Board.isInBounds(nx, this.player.y))) this.player.x = nx;
      if (stuckInSolid || (!Board.isSolid(this.player.x, ny) && Board.isInBounds(this.player.x, ny))) this.player.y = ny;
      this.player.x = Math.max(0.5, Math.min(Board.gridSize - 0.5, this.player.x));
      this.player.y = Math.max(0.5, Math.min(Board.gridSize - 0.5, this.player.y));
      this.player.direction = { dx: dx, dy: dy };
      this.player.isWalking = true;
      this.player.walkPhase += CONSTANTS.ANIMATION_SPEED * 60 * dt;
    } else {
      this.player.isWalking = false;
    }

    Network.sendPosition(this.player.x, this.player.y, this.player.direction, this.player.isWalking, this.player.walkPhase);
    Network.updateRemotePlayers(dt);
    Audio.updateProximity(this.player, Network.remotePlayers, CONSTANTS.AUDIO_RADIUS);

    // Camera follow with zoom
    var ps = Board.iso(this.player.x, this.player.y);
    var tcx = this.canvas.width / 2 - ps.x * this.zoom;
    var tcy = this.canvas.height / 2 - ps.y * this.zoom;
    this.camera.x += (tcx - this.camera.x) * 0.12;
    this.camera.y += (tcy - this.camera.y) * 0.12;

    // Update reactions
    var newReactions = [];
    for (var i = 0; i < this.reactions.length; i++) {
      var r = this.reactions[i];
      r.t += dt;
      r.offsetY -= dt * 35;
      r.opacity -= dt * 0.5;
      r.scale = Math.min(1, r.scale + dt * 4);
      if (r.opacity > 0) newReactions.push(r);
    }
    this.reactions = newReactions;

    // Update confetti
    var newConf = [];
    for (var j = 0; j < this.confetti.length; j++) {
      var c = this.confetti[j];
      c.x += c.vx; c.y += c.vy; c.vy += 0.06; c.rot += 0.05; c.opacity -= 0.004;
      if (c.opacity > 0 && c.y < this.canvas.height + 50) newConf.push(c);
    }
    this.confetti = newConf;

    UI.updateHUD(this.roomConfig.name, this.player.x, this.player.y, Network.getParticipantCount(), this.zoom);
  },

  render: function(ts) {
    var ctx = this.ctx;
    var w = this.canvas.width;
    var h = this.canvas.height;

    // Background — light professional
    var bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#e8ecf0');
    bgGrad.addColorStop(1, '#d0d4d8');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Apply zoom transform
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.zoom, this.zoom);

    // Draw grid
    Board.drawGrid(ctx, 0, 0, this.player.x, this.player.y);

    // Collect entities for depth sort
    var entities = [];
    var furn = Board.furniture;
    for (var fi = 0; fi < furn.length; fi++) {
      var item = furn[fi];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      var sk = item.x + item.y + ((def.width || 1) + (def.height || 1)) / 2;
      entities.push({ type: 'f', item: item, sk: sk });
    }
    this.tables.forEach(function(t) {
      entities.push({ type: 't', t: t, sk: t.x + t.y + (t.width + t.height) / 2 });
    });
    entities.push({ type: 'me', sk: this.player.x + this.player.y });
    var self = this;
    Network.remotePlayers.forEach(function(p, sid) {
      if (p.opacity <= 0) return;
      entities.push({ type: 'r', p: p, sid: sid, sk: p.renderX + p.renderY });
    });
    entities.sort(function(a, b) { return a.sk - b.sk; });

    for (var ei = 0; ei < entities.length; ei++) {
      var e = entities[ei];
      if (e.type === 'f') {
        Board.drawFurnitureItem(ctx, e.item, 0, 0);
      } else if (e.type === 't') {
        this.drawTable(ctx, e.t);
      } else if (e.type === 'me') {
        var onS = Board.isOnStage(Math.floor(this.player.x), Math.floor(this.player.y));
        Character.draw(ctx, this.player.x, this.player.y, 0, 0, {
          colors: this.player.colors, direction: this.player.direction,
          walkPhase: this.player.walkPhase, isWalking: this.player.isWalking,
          pseudo: this.player.pseudo, isOnStage: onS, isAdmin: this.player.isAdmin,
          isMuted: this.player.isMuted, handRaised: this.player.handRaised,
          isBroadcasting: this.player.isBroadcasting,
        });
      } else if (e.type === 'r') {
        var p = e.p;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        if (self.spotlight && self.spotlight !== e.sid) ctx.globalAlpha *= 0.4;
        Character.draw(ctx, p.renderX, p.renderY, 0, 0, {
          colors: p.colors, direction: p.direction, walkPhase: p.walkPhase,
          isWalking: p.isWalking, pseudo: p.pseudo,
          isOnStage: Board.isOnStage(Math.floor(p.renderX), Math.floor(p.renderY)),
          isAdmin: p.isAdmin, disconnected: p.disconnected, isMuted: p.isMuted,
          handRaised: p.handRaised, isBroadcasting: p.isBroadcasting,
        });
        ctx.restore();
      }
    }

    // Proximity radius (gradient)
    this.drawProximityRadius(ctx);

    // Reactions
    this.drawReactions(ctx);

    ctx.restore(); // end zoom

    // Confetti (screen space)
    this.drawConfetti(ctx);

    // Minimap
    this.drawMinimap();
  },

  drawTable: function(ctx, table) {
    var cx = table.x + table.width / 2;
    var cy = table.y + table.height / 2;
    var pos = Board.iso(cx, cy);
    var sx = pos.x, sy = pos.y;
    var tw = Board.tileWidth / 2;
    var W = tw * table.width * 0.4;
    var D = (Board.tileHeight / 2) * table.height * 0.4;
    var H = 12;

    ctx.beginPath();
    ctx.ellipse(sx, sy + 4, W * 0.5, D * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sx, sy - H - D); ctx.lineTo(sx + W, sy - H);
    ctx.lineTo(sx, sy - H + D); ctx.lineTo(sx - W, sy - H);
    ctx.closePath();
    ctx.fillStyle = '#8B6B3E'; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sx + W, sy - H); ctx.lineTo(sx, sy - H + D);
    ctx.lineTo(sx, sy + D); ctx.lineTo(sx + W, sy);
    ctx.closePath();
    ctx.fillStyle = '#5A3E28'; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sx - W, sy - H); ctx.lineTo(sx, sy - H + D);
    ctx.lineTo(sx, sy + D); ctx.lineTo(sx - W, sy);
    ctx.closePath();
    ctx.fillStyle = '#6B4F2E'; ctx.fill();

    if (table.name) {
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center';
      ctx.fillText(table.name, sx, sy - H - D - 8);
    }
  },

  drawProximityRadius: function(ctx) {
    var pos = Board.iso(this.player.x, this.player.y);
    var rx = CONSTANTS.AUDIO_RADIUS * (Board.tileWidth / 2);
    var ry = CONSTANTS.AUDIO_RADIUS * (Board.tileHeight / 2);

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(1, ry / rx);
    var g = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
    g.addColorStop(0, 'rgba(70,130,180,0.08)');
    g.addColorStop(0.6, 'rgba(70,130,180,0.03)');
    g.addColorStop(1, 'rgba(70,130,180,0)');
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,130,180,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  },

  drawReactions: function(ctx) {
    for (var i = 0; i < this.reactions.length; i++) {
      var r = this.reactions[i];
      var pos = Board.iso(r.x, r.y);
      var sx = pos.x;
      var sy = pos.y + r.offsetY - 50;
      ctx.save();
      ctx.globalAlpha = Math.min(1, r.opacity);
      var fs = Math.max(12, Math.floor(28 * r.scale));
      ctx.font = fs + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.emoji, sx, sy);
      ctx.restore();
    }
  },

  drawConfetti: function(ctx) {
    for (var i = 0; i < this.confetti.length; i++) {
      var c = this.confetti[i];
      ctx.save();
      ctx.globalAlpha = c.opacity;
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size * 0.3, c.size, c.size * 0.6);
      ctx.restore();
    }
  },

  drawMinimap: function() {
    var ctx = this.minimapCtx;
    var w = this.minimapCanvas.width;
    var h = this.minimapCanvas.height;
    var sc = Math.min(w, h) / Board.gridSize;

    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, w, h);
    for (var y = 0; y < Board.gridSize; y++) {
      for (var x = 0; x < Board.gridSize; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? Board.floorColor1 : Board.floorColor2;
        ctx.fillRect(x * sc, y * sc, sc + 0.5, sc + 0.5);
      }
    }
    for (var fi = 0; fi < Board.furniture.length; fi++) {
      var item = Board.furniture[fi];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      ctx.fillStyle = def.isStage ? '#C8A878' : def.isZone ? 'rgba(100,160,200,0.15)' : def.color;
      ctx.fillRect(item.x * sc, item.y * sc, (def.width || 1) * sc, (def.height || 1) * sc);
    }
    var self = this;
    Network.remotePlayers.forEach(function(p) {
      if (p.opacity <= 0) return;
      ctx.fillStyle = p.disconnected ? 'rgba(200,200,50,0.5)' : '#2ecc71';
      ctx.beginPath(); ctx.arc(p.renderX * sc, p.renderY * sc, 2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#3498db';
    ctx.beginPath(); ctx.arc(this.player.x * sc, this.player.y * sc, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  },
};

window.addEventListener('DOMContentLoaded', function() { Engine.init(); });
