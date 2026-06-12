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
    audioRadius: CONSTANTS.AUDIO_RADIUS,
  },

  camera: { x: 0, y: 0 },
  zoom: CONSTANTS.ZOOM_DEFAULT,
  keys: {},
  roomConfig: { name: 'Salle', environment: 'bureau', gridSize: 20, roomId: null, isCreator: false },
  lastTime: 0, started: false,
  reactions: [], confetti: [], spotlight: null,
  tables: new Map(),
  subRooms: new Map(),
  // Camera drag state
  isDragging: false, dragStart: { x: 0, y: 0 }, cameraStart: { x: 0, y: 0 },
  // View mode: 'iso' or 'topdown'
  viewMode: 'iso',
  // Follow player mode (improvement #15)
  followTarget: null, // socketId of player to follow
  // Table notes debounce (improvement #7)
  _tableNotesTimer: null,
  _tableNotesQueue: null,
  // Furniture undo stack (improvement #14)
  _furnitureUndoStack: [],
  // Edit mode state (admin only)
  editMode: false,
  editTool: 'place', // 'place', 'move', 'delete'
  editSelectedType: null,
  editDragging: null, // { item, startX, startY, origX, origY }
  editHover: { x: -1, y: -1 },
  editCamera: { x: 0, y: 0 },
  editZoom: 1,
  editHovered: null, // furniture item under cursor
  editMouseGrid: { x: 0, y: 0 }, // current mouse grid position
  editIsPanning: false,
  editPanStart: { x: 0, y: 0 },
  editCameraStart: { x: 0, y: 0 },
  // Rayon de parole affiché (interpolé pour grandir/rétrécir en douceur)
  _displayAudioRadius: null,
  _radiusChangedAt: 0,
  // Cache des couleurs CSS du thème actif (invalidé au changement de thème)
  _themeColorCache: {}, _themeColorKey: null,

  // Lit une variable CSS du thème actif (avec cache par thème)
  themeColor: function(name, fallback) {
    var key = (typeof Themes !== 'undefined') ? Themes.current : 'default';
    if (this._themeColorKey !== key) { this._themeColorCache = {}; this._themeColorKey = key; }
    if (!(name in this._themeColorCache)) {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      this._themeColorCache[name] = v || fallback;
    }
    return this._themeColorCache[name] || fallback;
  },

  init: function() {
    this.player.colors = Object.assign({}, CONSTANTS.DEFAULT_COLORS);
    try { var sv = localStorage.getItem('insuffle_view'); if (sv === 'topdown' || sv === 'iso') this.viewMode = sv; } catch (err) {}
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
    window.addEventListener('beforeunload', function() {
      if (self.sfxCtx) { try { self.sfxCtx.close(); } catch(e) {} self.sfxCtx = null; }
      Audio.destroy();
      Network.leaveRoom();
    });
    window.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    // #16 Double-click to center camera on a point
    this.canvas.addEventListener('dblclick', function(e) { self.onDblClick(e); });
    this.canvas.addEventListener('mousedown', function(e) { self.onMouseDown(e); });
    this.canvas.addEventListener('mousemove', function(e) { self.onMouseMove(e); });
    // Glisser-déposer du mobilier depuis la palette (mode édition)
    this.canvas.addEventListener('dragover', function(e) {
      if (!self.editMode || !self._dragFurnitureType) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      var gp = self.editScreenToGrid(e.clientX, e.clientY);
      self.editMouseGrid = { x: Math.floor(gp.x), y: Math.floor(gp.y) };
    });
    this.canvas.addEventListener('drop', function(e) {
      if (!self.editMode || !self._dragFurnitureType) return;
      e.preventDefault();
      var gp = self.editScreenToGrid(e.clientX, e.clientY);
      self.placeFurnitureAt(self._dragFurnitureType, gp.x, gp.y);
    });
    this.canvas.addEventListener('mouseup', function(e) { self.onMouseUp(e); });
    this.canvas.addEventListener('click', function(e) { self.onClick(e); });

    Network.init();
    Audio.init();
    UI.initToolbar();

    // Initialize UX enhancements (#1-#50)
    if (typeof UXEnhancements !== 'undefined') {
      UXEnhancements.init();
    }

    Network.onParticipantJoined = function(d) {
      self.initSfx(); self.playSfx('join');
      // #30 Grouped join notifications
      if (typeof UXEnhancements !== 'undefined') {
        UXEnhancements.groupedJoinNotification(d.pseudo);
      } else {
        UI.showNotification(d.pseudo + ' a rejoint la salle');
      }
      // Send screen share stream to late joiners
      if (ScreenShare.isSharing && ScreenShare.localStream) {
        ScreenShare.sendStreamToPeer(d.socketId);
      }
    };
    Network.onParticipantLeft = function(d) {
      self.initSfx(); self.playSfx('leave');
      UI.showNotification(d.pseudo + ' a quitté la salle');
      // Clean up screen share connections for the leaving participant
      ScreenShare.removeShare(d.socketId);
      var outConn = ScreenShare.outgoingPeers.get(d.socketId);
      if (outConn) { try { outConn.close(); } catch (e) {} ScreenShare.outgoingPeers.delete(d.socketId); }
    };
    Network.onParticipantDisconnected = function(d) {
      self.initSfx(); self.playSfx('leave');
      UI.showNotification(d.pseudo + ' s\'est déconnecté(e)');
    };
    Network.onReconnecting = function() {
      UI.showReconnecting(true);
      // #16 Connection status, #17 reconnection counter, #25 disconnected timer
      if (typeof UXEnhancements !== 'undefined') {
        UXEnhancements.updateConnectionStatus(false);
        UXEnhancements.startReconnectCounter();
      }
    };
    Network.onReconnected = function() {
      UI.showReconnecting(false);
      // #16, #17 Restore connection status
      if (typeof UXEnhancements !== 'undefined') {
        UXEnhancements.stopReconnectCounter();
        UXEnhancements.updateConnectionStatus(true);
      }
      // Re-join room with same config after reconnection (new socket ID)
      if (self.roomConfig && self.roomConfig.roomId) {
        var attempts = 0;
        var maxRetries = 5;
        function tryRejoin() {
          Network.joinRoom(self.roomConfig.roomId, {
            pseudo: self.player.pseudo,
            colors: self.player.colors,
            accessory: self.player.accessory || 'none',
            isCreator: false, // on reconnect, not creator
            roomName: self.roomConfig.name,
            environment: self.roomConfig.environment,
            gridSize: self.roomConfig.gridSize,
          }, function(resp) {
            if (resp && !resp.error) {
              self.initSfx(); self.playSfx('join');
              UI.showNotification('Vous êtes de retour !');
            } else if (++attempts < maxRetries) {
              setTimeout(tryRejoin, 2000 * attempts);
            } else {
              UI.showNotification('Impossible de se reconnecter. Veuillez recharger la page.');
            }
          });
        }
        tryRejoin();
      }
    };

    this.setupNetworkEvents();
    this.setupChat();
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
    s.on('screen-share-started', function(d) { ScreenShare.activeGlobalShare = { socketId: d.socketId, pseudo: d.pseudo }; UI.showNotification(d.pseudo + ' partage son écran avec vous'); });
    s.on('screen-share-stopped', function(d) { ScreenShare.removeShare(d.socketId); });
    s.on('role-changed', function(d) {
      if (d.socketId === Network.mySocketId) {
        var wasAdmin = self.player.isAdmin;
        self.player.isAdmin = d.isAdmin;
        UI.updateAdminUI(d.isAdmin);
        // #10 Crown animation when promoted to admin
        if (!wasAdmin && d.isAdmin && typeof UXEnhancements !== 'undefined') {
          UXEnhancements.showAdminCrown();
        }
      }
      var rp = Network.remotePlayers.get(d.socketId); if (rp) rp.isAdmin = d.isAdmin;
    });
    s.on('kicked', function(d) { alert(d.reason || 'Vous avez été exclu(e) de cette salle.'); window.location.href = '/client/index.html'; });
    s.on('participant-kicked', function(d) { Network.remotePlayers.delete(d.socketId); });
    s.on('room-closed', function(d) { alert('Cette salle a été fermée par l\'administrateur.'); window.location.href = '/client/index.html'; });
    s.on('participant-mute-changed', function(d) { var r = Network.remotePlayers.get(d.socketId); if (r) r.isMuted = d.muted; });
    s.on('table-created', function(t) { self.tables.set(t.id, t); });
    s.on('table-deleted', function(d) { self.tables.delete(d.tableId); });
    s.on('table-renamed', function(d) { var t = self.tables.get(d.tableId); if (t) t.name = d.name; });
    s.on('table-moved', function(d) { var t = self.tables.get(d.tableId); if (t) { t.x = d.x; t.y = d.y; } });
    s.on('participant-table-changed', function(d) {
      var r = Network.remotePlayers.get(d.socketId); if (r) r.tableId = d.tableId;
      if (d.socketId === Network.mySocketId) self.player.tableId = d.tableId;
    });
    s.on('theme-changed', function(t) {
      if (t && t.preset && typeof Themes !== 'undefined' && Themes.THEMES[t.preset]) { Themes.apply(t.preset); return; }
      if (t.floorColor1) Board.floorColor1 = t.floorColor1;
      if (t.floorColor2) Board.floorColor2 = t.floorColor2;
    });
    s.on('environment-changed', function(d) { self.roomConfig.environment = d.environment; Board.init(self.roomConfig.gridSize, d.environment); UI.updateAdminSettings(); UI.refreshFurnitureList(); });
    s.on('grid-resized', function(d) { self.roomConfig.gridSize = d.size; Board.init(d.size, self.roomConfig.environment); self.player.x = Math.min(self.player.x, d.size - 1); self.player.y = Math.min(self.player.y, d.size - 1); UI.updateAdminSettings(); });
    s.on('reaction', function(d) {
      var r = Network.remotePlayers.get(d.socketId);
      if (r) self.addReaction(d.emoji, r.renderX, r.renderY);
    });
    s.on('hand-toggled', function(d) {
      var r = Network.remotePlayers.get(d.socketId); if (r) r.handRaised = d.handRaised;
      if (d.socketId === Network.mySocketId) {
        self.player.handRaised = d.handRaised;
        var handBtn = document.getElementById('btn-hand');
        if (handBtn) handBtn.classList.toggle('hand-raised', d.handRaised);
      }
    });
    s.on('all-hands-lowered', function() { self.player.handRaised = false; Network.remotePlayers.forEach(function(r) { r.handRaised = false; }); });
    s.on('effect-triggered', function(d) { if (d.type === 'confetti') self.triggerConfetti(); if (d.type === 'applause') self.triggerApplause(); });
    s.on('spotlight-changed', function(d) { self.spotlight = d.active ? d.targetSocketId : null; });
    s.on('vote-created', function(v) { self.initSfx(); self.playSfx('notification'); UI.showVotePopup(v); });
    s.on('vote-updated', function(v) { UI.updateVotePopup(v); });
    s.on('vote-ended', function(v) { UI.updateVotePopup(v); setTimeout(function() { UI.hideVotePopup(); }, 5000); });
    s.on('timer-created', function(t) { UI.showTimer(t); });
    s.on('timer-ended', function() { self.initSfx(); self.playSfx('notification'); UI.showNotification('Le minuteur est terminé !'); });
    s.on('timer-paused', function(d) { if (UI.activeTimer) UI.activeTimer.paused = d.paused; });
    s.on('timer-cancelled', function(d) { UI.activeTimer = null; UI.hideTimer(); UI.showNotification('Minuteur annulé'); });
    s.on('furniture-added', function(i) { Board.furniture.push(i); Board.buildCollisionMap(); });
    s.on('furniture-removed', function(d) { Board.furniture = Board.furniture.filter(function(f) { return f.id !== d.furnitureId; }); Board.buildCollisionMap(); });
    s.on('furniture-moved', function(d) {
      var f = Board.furniture.find(function(item) { return item.id === d.furnitureId; });
      if (f) { f.x = d.x; f.y = d.y; Board.buildCollisionMap(); }
    });
    s.on('doors-linked', function(d) {
      var d1 = Board.furniture.find(function(f) { return f.id === d.door1Id; });
      var d2 = Board.furniture.find(function(f) { return f.id === d.door2Id; });
      if (d1) { d1.linkedDoorId = d.door2Id; d1.doorLabel = d.label; }
      if (d2) { d2.linkedDoorId = d.door1Id; d2.doorLabel = d.label; }
    });
    s.on('admin-broadcast-start', function(d) { var r = Network.remotePlayers.get(d.socketId); if (r) r.isBroadcasting = true; self.initSfx(); self.playSfx('notification'); UI.showNotification(d.pseudo + ' s\'adresse à tous les participants'); });
    s.on('admin-broadcast-stop', function(d) { var r = Network.remotePlayers.get(d.socketId); if (r) r.isBroadcasting = false; });
    s.on('participant-speaking-changed', function(d) { var r = Network.remotePlayers.get(d.socketId); if (r) r.isSpeaking = d.speaking; });
    // Improvement #4: room renamed
    s.on('room-renamed', function(d) { self.roomConfig.name = d.name; UI.showNotification('Salle renommée : ' + d.name); });
    // Improvement #22: force muted by admin
    s.on('mute-unlocked', function() { UI.showNotification('🎙 Votre micro a été libéré par l\'animateur'); });
    s.on('force-muted', function() { self.player.isMuted = true; Audio.isMuted = true; Audio._applyMuteState(); UI.updateMuteButton(true); UI.showNotification('Vous avez été mis en sourdine'); });
    // Improvement #24: audio radius changed
    s.on('force-moved', function(d) {
      self.player.x = d.x; self.player.y = d.y;
      self.moveTarget = null;
      Network.sendPosition(d.x, d.y, self.player.direction, false, 0);
      if (d.reason) UI.showNotification(d.reason);
    });
    s.on('room-locked-changed', function(d) {
      UI.showNotification(d.locked ? '🔒 Salle verrouillée — plus personne ne peut entrer' : '🔓 Salle déverrouillée');
      var btn = document.getElementById('btn-lock-room');
      if (btn) btn.textContent = d.locked ? '🔓 Déverrouiller la salle' : '🔒 Verrouiller la salle';
      if (btn) btn.dataset.locked = d.locked ? '1' : '';
    });
    s.on('status-changed', function(d) {
      if (typeof Facilitation !== 'undefined') Facilitation.onStatus(d.socketId, d.status);
    });
    s.on('game-event', function(d) {
      if (typeof Facilitation !== 'undefined') Facilitation.onGameEvent(d);
    });
    s.on('audio-radius-changed', function(d) {
      self.player.audioRadius = d.audioRadius;
      self._radiusChangedAt = performance.now();
      var rs = document.getElementById('radius-slider');
      if (rs) rs.value = d.audioRadius;
      var lbl = d.audioRadius < 1 ? Math.round(d.audioRadius * 100) + ' cm' : d.audioRadius + ' m';
      UI.showNotification('Rayon de parole : ' + lbl);
    });
    // Improvement #6: furniture rotated
    s.on('furniture-rotated', function(d) { var f = Board.furniture.find(function(item) { return item.id === d.furnitureId; }); if (f) { f.rotation = d.rotation; Board.buildCollisionMap(); } });

    // Sub-rooms
    s.on('sub-room-created', function(d) { self.subRooms.set(d.id, d); });
    s.on('sub-room-deleted', function(d) { self.subRooms.delete(d.subRoomId); });
    s.on('sub-room-updated', function(d) { var sr = self.subRooms.get(d.subRoomId); if (sr) sr.participants = d.participants; });

    // Collab spaces
    s.on('collab-space-updated', function(d) { UI.updateCollabSpaceUsers(d); });
    s.on('collab-screen-started', function(d) { UI.onCollabScreenStarted(d); });
    s.on('collab-screen-stopped', function(d) { UI.onCollabScreenStopped(d); });
    s.on('collab-rtc-offer', function(d) { UI.handleCollabRtcOffer(d); });
    s.on('collab-rtc-answer', function(d) { UI.handleCollabRtcAnswer(d); });
    s.on('collab-rtc-ice', function(d) { UI.handleCollabRtcIce(d); });
  },

  parseRoomConfig: function() {
    var p = new URLSearchParams(window.location.search);
    this.roomConfig.roomId = p.get('room');
    this.roomConfig.name = p.get('name') || 'Salle';
    this.roomConfig.environment = p.get('env') || 'open-space';
    this.roomConfig.gridSize = Math.min(CONSTANTS.GRID_MAX, Math.max(CONSTANTS.GRID_MIN, parseInt(p.get('size')) || CONSTANTS.GRID_DEFAULT));
    this.roomConfig.isCreator = p.get('creator') === 'true';
  },

  checkRoom: function() {
    var self = this;
    if (!this.roomConfig.roomId) { UI.showError('Aucun identifiant de salle fourni. Veuillez utiliser un lien valide.'); return; }
    // #41 Show loading indicator while checking room
    var loadingBar = document.getElementById('room-loading-indicator');
    if (loadingBar) loadingBar.style.display = 'block';
    if (!this.roomConfig.isCreator) {
      fetch('/api/rooms/' + this.roomConfig.roomId).then(function(resp) {
        if (!resp.ok) { if (loadingBar) loadingBar.style.display = 'none'; UI.showError('Cette salle est introuvable. V\u00e9rifiez le lien et r\u00e9essayez.'); return; }
        return resp.json();
      }).then(function(info) {
        if (!info) return;
        if (loadingBar) loadingBar.style.display = 'none';
        self.roomConfig.name = info.name;
        self.roomConfig.environment = info.environment;
        self.roomConfig.gridSize = info.gridSize;
        // #5 Show room participant count on join screen
        UI.showRoomInfo(info);
        if (info.participantCount >= info.maxParticipants) { UI.showError('Cette salle est compl\u00e8te. Le nombre maximum de participants est atteint.'); return; }
        self.initBoard();
      }).catch(function() { if (loadingBar) loadingBar.style.display = 'none'; self.initBoard(); });
    } else {
      this.initBoard();
    }
  },

  initBoard: function() {
    var self = this;
    Board.init(this.roomConfig.gridSize, this.roomConfig.environment);
    document.getElementById('hud-room-name').textContent = this.roomConfig.name;

    // Check for saved session (reconnect on refresh)
    var savedSession = null;
    try {
      var saved = localStorage.getItem('insuffle_session');
      if (saved) savedSession = JSON.parse(saved);
    } catch (e) {}

    // If same room, auto-reconnect (no time limit — resume session no matter what)
    if (savedSession && savedSession.roomId === this.roomConfig.roomId) {
      self.player.pseudo = savedSession.pseudo;
      self.player.colors = savedSession.colors;
      self.player.accessory = savedSession.accessory || 'none';
      // Skip avatar config, go straight to mic + join
      document.getElementById('avatar-config').style.display = 'none';
      document.getElementById('hud').style.display = 'flex';
      document.getElementById('minimap-container').style.display = 'block';
      document.getElementById('toolbar').style.display = 'flex';
      self.requestMicAndJoin();
      return;
    }

    UI.initAvatarConfig(function(config) {
      self.player.pseudo = config.pseudo;
      self.player.colors = config.colors;
      self.player.accessory = config.accessory || 'none';
      // Save session for reconnect
      try {
        localStorage.setItem('insuffle_session', JSON.stringify({
          roomId: self.roomConfig.roomId,
          pseudo: config.pseudo,
          colors: config.colors,
          accessory: config.accessory || 'none',
          time: Date.now(),
        }));
      } catch (e) {}
      self.requestMicAndJoin();
    });
  },

  requestMicAndJoin: function() {
    var self = this;
    Audio.requestMicrophone().then(function(mic) {
      self.player.isMuted = !mic;
      UI.updateMuteButton(self.player.isMuted);
      if (!mic) {
        UI.showMicPermissionHint();
      }
      self.joinRoom();
    });
  },

  joinRoom: function() {
    var self = this;
    Network.joinRoom(this.roomConfig.roomId, {
      pseudo: this.player.pseudo, colors: this.player.colors,
      accessory: this.player.accessory || 'none',
      isCreator: this.roomConfig.isCreator, roomName: this.roomConfig.name,
      environment: this.roomConfig.environment, gridSize: this.roomConfig.gridSize,
    }, function(r) {
      if (r.error) {
        var msgs = {
          room_locked: 'Cette salle est verrouillée — la session a commencé. Contactez l\'organisateur.',
          room_full: 'Cette salle est complète.',
          room_closed: 'Cette salle a été fermée.',
          invalid_password: 'Mot de passe incorrect.',
        };
        UI.showError(msgs[r.error] || r.error);
        return;
      }
      self.player.x = r.you.x; self.player.y = r.you.y;
      self.player.role = r.you.role; self.player.isAdmin = r.you.isAdmin;
      self.roomConfig.name = r.room.name;
      self.roomConfig.environment = r.room.environment;
      self.roomConfig.gridSize = r.room.gridSize;
      document.getElementById('hud-room-name').textContent = r.room.name;
      if (!self.roomConfig.isCreator) Board.init(r.room.gridSize, r.room.environment);
      // Thème de la salle : le preset design prime, sinon couleurs de sol custom
      if (r.theme) {
        if (r.theme.preset && typeof Themes !== 'undefined' && Themes.THEMES[r.theme.preset]) {
          Themes.apply(r.theme.preset, { silent: true });
        } else {
          if (r.theme.floorColor1) Board.floorColor1 = r.theme.floorColor1;
          if (r.theme.floorColor2) Board.floorColor2 = r.theme.floorColor2;
        }
      }
      // Apply server furniture state (preserves door links, server-added items)
      if (r.furniture && r.furniture.length > 0) {
        // Merge server furniture with client-generated preset
        for (var fi = 0; fi < r.furniture.length; fi++) {
          var sf = r.furniture[fi];
          var existing = Board.furniture.find(function(f) { return f.id === sf.id; });
          if (existing) {
            // Copy server properties (door links, etc.)
            if (sf.linkedDoorId) existing.linkedDoorId = sf.linkedDoorId;
            if (sf.doorLabel) existing.doorLabel = sf.doorLabel;
          } else {
            Board.furniture.push(sf);
          }
        }
        Board.buildCollisionMap();
      }
      if (r.tables) r.tables.forEach(function(t) { self.tables.set(t.id, t); });
      // Historique du chat : on retrouve la conversation en arrivant
      if (r.chat && r.chat.length && self.renderChatMessage) {
        r.chat.forEach(function(m) { self.renderChatMessage(m); });
        var box = document.getElementById('chat-messages');
        if (box) box.scrollTop = box.scrollHeight;
      }
      UI.showCopyLink(self.roomConfig.roomId);
      UI.updateAdminUI(self.player.isAdmin);
      // Restore active screen share if one is in progress
      if (r.activeScreenShare) {
        ScreenShare.activeGlobalShare = { socketId: r.activeScreenShare.socketId, pseudo: r.activeScreenShare.pseudo };
      }
      // Set camera immediately to player
      var ps = Board.iso(self.player.x, self.player.y);
      self.camera.x = self.canvas.width / 2 - ps.x * self.zoom;
      self.camera.y = self.canvas.height / 2 - ps.y * self.zoom;
      self.start();

      // === UX Enhancements on join ===
      if (typeof UXEnhancements !== 'undefined') {
        // #1 Welcome confetti burst (one-time)
        setTimeout(function() { UXEnhancements.triggerWelcomeConfetti(); }, 500);
        // #11, #12 Welcome message in chat
        UXEnhancements.addWelcomeChat(self.player.pseudo);
        // #10 Admin crown animation
        if (self.player.isAdmin) {
          setTimeout(function() { UXEnhancements.showAdminCrown(); }, 800);
        }
        // #16 Connection status
        UXEnhancements.updateConnectionStatus(true);
      }
    });
  },

  resize: function() {
    // Logical (CSS) viewport size used by all camera/layout math.
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    // Render at the device pixel ratio (capped at 2) for crisp output on Retina/4K
    // without paying the full cost on very high-DPI displays.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = this.viewW + 'px';
    this.canvas.style.height = this.viewH + 'px';
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    // Backing-store resize resets context state — re-apply smoothing prefs.
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
    }
  },

  genStars: function() {
    this.stars = [];
    for (var i = 0; i < 100; i++) {
      this.stars.push({ x: Math.random(), y: Math.random(), s: Math.random() * 1.5 + 0.3, a: Math.random() * 0.3 + 0.1, sp: Math.random() * 2 + 0.5 });
    }
  },

  onWheel: function(e) {
    if (!this.started) return;
    if (this.editMode) { this.onEditWheel(e); return; }
    e.preventDefault();
    var d = e.deltaY > 0 ? -CONSTANTS.ZOOM_STEP : CONSTANTS.ZOOM_STEP;
    this.zoom = Math.max(CONSTANTS.ZOOM_MIN, Math.min(CONSTANTS.ZOOM_MAX, this.zoom + d));
  },

  // Un overlay modal est-il ouvert ? (tableaux, partage, raccourcis)
  // Les raccourcis de la scène ne doivent jamais agir « derrière » un overlay.
  _uiOverlayOpen: function() {
    var ids = ['postit-overlay', 'whiteboard-overlay', 'collab-space-overlay', 'shortcuts-modal'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.style.display !== 'none' && el.style.display !== '') return true;
      if (el && getComputedStyle(el).display !== 'none' && el.style.display === '' ) return true;
    }
    return false;
  },

  onKeyDown: function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
    if (e.code !== 'Escape' && this._uiOverlayOpen()) return;
    this.keys[e.code] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].indexOf(e.code) >= 0) e.preventDefault();
    if (e.code === 'KeyM') { var m = Audio.toggleMute(); this.player.isMuted = m; UI.updateMuteButton(m); }
    if (e.code === 'KeyH') Network.socket.emit('toggle-hand', {});
    if (e.code === 'Tab') { e.preventDefault(); var mc = document.getElementById('minimap-container'); if (mc) mc.style.display = mc.style.display === 'none' ? 'block' : 'none'; }
    if (e.key === '?') UI.toggleShortcutsModal();
    if (e.code === 'KeyV' && !this.editMode) { this.viewMode = this.viewMode === 'iso' ? 'topdown' : 'iso'; try { localStorage.setItem('insuffle_view', this.viewMode); } catch (err) {} UI.showNotification('Vue : ' + (this.viewMode === 'iso' ? 'Isométrique' : 'Plan de salle')); if (typeof UXEnhancements !== 'undefined') UXEnhancements.fadeViewTransition(); }
    if (e.code === 'KeyE' && this.player.isAdmin) this.toggleEditMode();
    if (e.code === 'Escape') { if (this.editMode) { this.toggleEditMode(); return; } UI.hideContextMenu(); if (UI.shortcutsModalOpen) UI.toggleShortcutsModal(); if (UI.adminPanelOpen) UI.toggleAdminPanel(); }
    if (e.code === 'Space' && this.player.isAdmin && !this.player.isBroadcasting) {
      this.player.isBroadcasting = true;
      Network.socket.emit('admin-broadcast-start');
    }
    // Improvement #14: Ctrl+Z undo furniture in edit mode
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && this.editMode) {
      e.preventDefault();
      var self = this;
      Network.socket.emit('undo-furniture', {}, function(r) {
        if (r && r.success) {
          Board.furniture = Board.furniture.filter(function(f) { return f.id !== r.removedId; });
          Board.buildCollisionMap();
          UI.showNotification('Annulation du dernier mobilier');
        }
      });
    }
    // Improvement #15: F key toggles follow player mode (admin)
    if (e.code === 'KeyF' && this.player.isAdmin && !this.editMode) {
      if (this.followTarget) {
        this.followTarget = null;
        UI.showNotification('Suivi désactivé');
      }
    }
    var rMap = { 'Digit1': '👍', 'Digit2': '👏', 'Digit3': '❓', 'Digit4': '💡', 'Digit5': '❤️', 'Digit6': '😂' };
    if (rMap[e.code]) this.sendReaction(rMap[e.code]);
  },

  onKeyUp: function(e) {
    this.keys[e.code] = false;
    if (e.code === 'Space' && this.player.isBroadcasting && this.player.isAdmin) {
      this.player.isBroadcasting = false;
      Network.socket.emit('admin-broadcast-stop');
    }
  },

  onMouseDown: function(e) {
    if (!this.started) return;
    if (this.editMode) { this.onEditMouseDown(e); return; }
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
    if (this.editMode) { this.onEditMouseMove(e); return; }
    if (this.isDragging) {
      this.camera.x = this.cameraStart.x + (e.clientX - this.dragStart.x);
      this.camera.y = this.cameraStart.y + (e.clientY - this.dragStart.y);
      // #18 Pan limits
      var maxPan = Board.gridSize * Board.tileWidth * this.zoom;
      this.camera.x = Math.max(-maxPan, Math.min(this.viewW + maxPan * 0.5, this.camera.x));
      this.camera.y = Math.max(-maxPan, Math.min(this.viewH + maxPan * 0.5, this.camera.y));
    }
    // #21 Furniture hover tooltip
    if (this.started && !this.isDragging) {
      this._showFurnitureTooltip(e.clientX, e.clientY);
      // Curseur main au survol des pastilles de zone (elles sont cliquables)
      var hwx = (e.clientX - this.camera.x) / this.zoom;
      var hwy = (e.clientY - this.camera.y) / this.zoom;
      var overPill = false;
      if (this._zonePills) {
        for (var hp = 0; hp < this._zonePills.length; hp++) {
          var hpill = this._zonePills[hp];
          if (hwx >= hpill.x0 && hwx <= hpill.x1 && hwy >= hpill.y0 && hwy <= hpill.y1) { overPill = true; break; }
        }
      }
      this._hoverPill = overPill;
      this.canvas.style.cursor = overPill ? 'pointer' : 'default';
    }
  },

  // #21 Furniture hover tooltip
  _showFurnitureTooltip: function(mx, my) {
    var tooltip = document.getElementById('furniture-tooltip');
    if (!tooltip) return;
    var gp = this.screenToGridView(mx, my);
    var cx = Math.floor(gp.x), cy = Math.floor(gp.y);
    var found = null;
    for (var i = Board.furniture.length - 1; i >= 0; i--) {
      var item = Board.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      if (cx >= item.x && cx < item.x + (def.width || 1) && cy >= item.y && cy < item.y + (def.height || 1)) {
        found = { item: item, def: def }; break;
      }
    }
    if (found) {
      var hint = '';
      if (found.def.isWhiteboard) hint = 'Cliquer pour ouvrir le tableau';
      else if (found.def.isPostItBoard) hint = 'Cliquer pour ouvrir le board';
      else if (found.def.isDoor) hint = 'Cliquer pour utiliser la porte';
      else if (found.def.isCollabSpace) hint = 'Cliquer pour collaborer';
      tooltip.innerHTML = '<div class="tooltip-name">' + found.def.name + '</div>' + (hint ? '<div class="tooltip-hint">' + hint + '</div>' : '');
      tooltip.style.left = (mx + 12) + 'px';
      tooltip.style.top = (my - 10) + 'px';
      tooltip.style.display = 'block';
    } else {
      tooltip.style.display = 'none';
    }
  },

  onMouseUp: function(e) {
    if (this.editMode) { this.onEditMouseUp(e); return; }
    if (e.button === 2 || e.button === 1) {
      // If barely moved, it was a right-click (context menu)
      if (this.isDragging) {
        var movedDist = Math.abs(e.clientX - this.dragStart.x) + Math.abs(e.clientY - this.dragStart.y);
        if (movedDist < 5) {
          var gp = this.screenToGridView(e.clientX, e.clientY);
          var self = this;

          // Check if right-clicking on furniture (admin)
          if (this.player.isAdmin) {
            var clickX = Math.floor(gp.x);
            var clickY = Math.floor(gp.y);
            for (var fi = Board.furniture.length - 1; fi >= 0; fi--) {
              var fitem = Board.furniture[fi];
              var fdef = Environments.furnitureTypes[fitem.type];
              if (!fdef || !fitem.id) continue;
              if (clickX >= fitem.x && clickX < fitem.x + (fdef.width || 1) && clickY >= fitem.y && clickY < fitem.y + (fdef.height || 1)) {
                UI.showFurnitureMenu(e.clientX, e.clientY, fitem, fdef);
                return;
              }
            }
          }

          // Check if right-clicking on a sub-room portal (admin)
          if (self.player.isAdmin) {
            var sClickX = Math.floor(gp.x);
            var sClickY = Math.floor(gp.y);
            var foundSubRoom = false;
            self.subRooms.forEach(function(sr, srId) {
              if (foundSubRoom) return;
              var srw = sr.width || 3, srh = sr.height || 3;
              if (sClickX >= sr.x && sClickX < sr.x + srw && sClickY >= sr.y && sClickY < sr.y + srh) {
                foundSubRoom = true;
                UI.showSubRoomMenu(e.clientX, e.clientY, srId, sr);
              }
            });
            if (foundSubRoom) return;
          }

          // Otherwise show player context menu or return-to-player (#20)
          var foundPlayer = false;
          Network.remotePlayers.forEach(function(rp, sid) {
            var dist = Math.sqrt((gp.x - rp.renderX) * (gp.x - rp.renderX) + (gp.y - rp.renderY) * (gp.y - rp.renderY));
            if (dist < 1.5) { UI.showContextMenu(e.clientX, e.clientY, sid, rp); foundPlayer = true; }
          });
          if (!foundPlayer) { UI.showReturnToPlayerMenu(e.clientX, e.clientY); }
        }
      }
      this.isDragging = false;
    }
  },

  // #16 Double-click to center camera on a point
  onDblClick: function(e) {
    if (!this.started || this.editMode) return;
    if (this.viewMode === 'topdown') return; // le plan est déjà centré
    var gp = this.screenToGridView(e.clientX, e.clientY);
    var ps = Board.iso(gp.x, gp.y);
    this._cameraCenterTarget = {
      x: this.viewW / 2 - ps.x * this.zoom,
      y: this.viewH / 2 - ps.y * this.zoom,
    };
  },

  // Case praticable la plus proche autour d'un point (pour marcher vers un
  // meuble plein) — on privilégie le côté d'où vient le joueur.
  findWalkableNear: function(cx, cy, fromX, fromY) {
    var best = null, bestScore = Infinity;
    for (var r = 1; r <= 2; r++) {
      for (var ddy = -r; ddy <= r; ddy++) {
        for (var ddx = -r; ddx <= r; ddx++) {
          if (Math.max(Math.abs(ddx), Math.abs(ddy)) !== r) continue;
          var tx = cx + ddx, ty = cy + ddy;
          if (!Board.isInBounds(tx, ty) || Board.isSolid(tx, ty)) continue;
          var score = (tx - fromX) * (tx - fromX) + (ty - fromY) * (ty - fromY);
          if (score < bestScore) { bestScore = score; best = { x: tx, y: ty }; }
        }
      }
      if (best) return best;
    }
    return best;
  },

  // Conversion écran -> grille selon la vue active (iso ou plan de salle)
  screenToGridView: function(mx, my) {
    if (this.viewMode === 'topdown' && this._tdView) {
      return {
        x: (mx - this._tdView.ox) / this._tdView.cell,
        y: (my - this._tdView.oy) / this._tdView.cell,
      };
    }
    return Board.screenToGrid(mx, my, this.camera.x, this.camera.y, this.zoom);
  },

  selectedFurniture: null,

  onClick: function(e) {
    UI.hideContextMenu();
    if (!this.started) return;
    if (this.editMode) { this.onEditClick(e); return; }
    var gp = this.screenToGridView(e.clientX, e.clientY);
    var clickX = Math.floor(gp.x);
    var clickY = Math.floor(gp.y);
    var px = this.player.x;
    var py = this.player.y;

    // Clic sur une étiquette de zone (pastille flottante) : cible directe.
    // Les pastilles sont enregistrées en coordonnées monde par drawZoneLabels.
    var wpx = (e.clientX - this.camera.x) / this.zoom;
    var wpy = (e.clientY - this.camera.y) / this.zoom;
    if (this._zonePills && this.viewMode !== 'topdown') {
      for (var zp = 0; zp < this._zonePills.length; zp++) {
        var pill = this._zonePills[zp];
        if (wpx >= pill.x0 && wpx <= pill.x1 && wpy >= pill.y0 && wpy <= pill.y1) {
          // Recale le clic sur la tuile du meuble : les détections suivantes
          // (porte, espace collab, tableau) le traitent comme un clic direct.
          clickX = Math.floor(pill.item.x);
          clickY = Math.floor(pill.item.y);
          gp = { x: pill.item.x + 0.5, y: pill.item.y + 0.5 };
          break;
        }
      }
    }

    // Teleport cooldown (prevent double-click spam)
    if (this._lastTeleport && Date.now() - this._lastTeleport < 1000) {
      // Skip door check during cooldown
    } else {
    // Check door furniture (paired portals — teleport between doors)
    for (var di = 0; di < Board.furniture.length; di++) {
      var ditem = Board.furniture[di];
      var ddef = Environments.furnitureTypes[ditem.type];
      if (!ddef || !ddef.isDoor) continue;
      if (clickX >= ditem.x && clickX < ditem.x + (ddef.width || 1) && clickY >= ditem.y && clickY < ditem.y + (ddef.height || 1)) {
        var doorDist = Math.sqrt((px - (ditem.x + 0.5)) * (px - (ditem.x + 0.5)) + (py - (ditem.y + 0.5)) * (py - (ditem.y + 0.5)));
        if (doorDist < 3) {
          // If door is linked to another door, teleport player there
          if (ditem.linkedDoorId) {
            var targetDoor = Board.furniture.find(function(f) { return f.id === ditem.linkedDoorId; });
            if (targetDoor) {
              this._lastTeleport = Date.now();
              // Try multiple spawn positions around the target door (avoid solid tiles)
              var spawnOffsets = [{dx:0, dy:1.5}, {dx:0, dy:-0.5}, {dx:1.5, dy:0}, {dx:-0.5, dy:0}];
              var spawnX = targetDoor.x + 0.5, spawnY = targetDoor.y + 1.5;
              for (var so = 0; so < spawnOffsets.length; so++) {
                var sx = targetDoor.x + spawnOffsets[so].dx;
                var sy = targetDoor.y + spawnOffsets[so].dy;
                var gsx = Math.floor(sx), gsy = Math.floor(sy);
                if (gsx >= 0 && gsy >= 0 && gsx < Board.gridSize && gsy < Board.gridSize &&
                    (!Board.collisionMap[gsy] || !Board.collisionMap[gsy][gsx])) {
                  spawnX = sx + 0.5; spawnY = sy + 0.5; break;
                }
              }
              this.player.x = spawnX;
              this.player.y = spawnY;
              // Broadcast new position to all players
              Network.socket.emit('position-update', {
                x: this.player.x, y: this.player.y,
                direction: this.player.direction,
                isWalking: false, walkPhase: 0
              });
              UI.showNotification('Téléporté(e) vers « ' + (ditem.doorLabel || 'Portail') + ' »');
            } else {
              UI.showNotification('La porte de destination est introuvable');
            }
          } else if (this.player.isAdmin) {
            // Admin links two doors together
            if (!ditem.id) { UI.showNotification('Cette porte n\'a pas d\'identifiant'); return; }
            var allDoors = Board.furniture.filter(function(f) {
              var fd = Environments.furnitureTypes[f.type];
              return fd && fd.isDoor && f.id && f.id !== ditem.id;
            });
            if (allDoors.length === 0) {
              UI.showNotification('Placez une seconde porte pour créer un passage');
            } else {
              // Auto-link to first unlinked door, or let admin choose
              var unlinked = allDoors.filter(function(d) { return !d.linkedDoorId; });
              var target;
              if (unlinked.length === 1) {
                target = unlinked[0];
              } else if (unlinked.length > 1) {
                // Ask which door to link to
                var names = unlinked.map(function(d, idx) { return (idx+1) + ': ' + d.type + ' (' + d.x + ',' + d.y + ')'; }).join('\n');
                var choice = prompt('À quelle porte souhaitez-vous relier celle-ci ?\n' + names);
                var idx = parseInt(choice) - 1;
                target = (idx >= 0 && idx < unlinked.length) ? unlinked[idx] : unlinked[0];
              } else {
                target = allDoors[0]; // all linked, relink first
              }
              var label = prompt('Donnez un nom à ce passage (facultatif) :') || 'Passage';
              ditem.linkedDoorId = target.id;
              target.linkedDoorId = ditem.id;
              ditem.doorLabel = label;
              target.doorLabel = label;
              // Persist door links on server
              Network.socket.emit('link-doors', {
                door1Id: ditem.id, door2Id: target.id, label: label
              });
              UI.showNotification('Portes reliées : « ' + label + ' »');
            }
          } else {
            UI.showNotification('Cette porte n\'est reliée à aucune autre. Rapprochez-vous d\'une porte en tant qu\'admin pour la relier.');
          }
          return;
        }
      }
    }
    } // end teleport cooldown else

    // First check sub-rooms (portals)
    if (this.subRooms) {
      for (var [srId, sr] of this.subRooms) {
        var srw = sr.width || 3;
        var srh = sr.height || 3;
        if (clickX >= sr.x && clickX < sr.x + srw && clickY >= sr.y && clickY < sr.y + srh) {
          var srDist = Math.sqrt((px - (sr.x + srw/2)) * (px - (sr.x + srw/2)) + (py - (sr.y + srh/2)) * (py - (sr.y + srh/2)));
          if (srDist < srw + 2) {
            // Open sub-room in new tab
            var subUrl = '/client/room.html?room=' + this.roomConfig.roomId + '_' + srId + '&name=' + encodeURIComponent(sr.name) + '&env=' + this.roomConfig.environment + '&size=15&creator=true';
            Network.socket.emit('join-sub-room', { subRoomId: srId });
            window.open(subUrl, '_blank');
            return;
          }
        }
      }
    }

    // First check collaboration spaces
    for (var ci = 0; ci < Board.furniture.length; ci++) {
      var citem = Board.furniture[ci];
      var cdef = Environments.furnitureTypes[citem.type];
      if (!cdef || !cdef.isCollabSpace) continue;
      var cw = citem.width || cdef.width;
      var ch = citem.height || cdef.height;
      if (clickX >= citem.x && clickX < citem.x + cw && clickY >= citem.y && clickY < citem.y + ch) {
        var dist = Math.sqrt((px - (citem.x + cw/2)) * (px - (citem.x + cw/2)) + (py - (citem.y + ch/2)) * (py - (citem.y + ch/2)));
        if (dist < cw + 2) {
          var spaceId = citem.id ? ('collab_' + citem.id) : ('collab_' + citem.x + '_' + citem.y);
          UI.openCollabSpace(spaceId);
          return;
        }
      }
    }

    // First check interactive wall objects (whiteboard, post-it board)
    // These are on walls (y=0 or x=0) so we need proximity-based detection
    for (var i = 0; i < Board.furniture.length; i++) {
      var item = Board.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      if (!def.isWhiteboard && !def.isPostItBoard) continue;

      // Check player is close enough (within 3 tiles of the item center)
      var icx = item.x + (def.width || 1) / 2;
      var icy = item.y + (def.height || 1) / 2;
      var distToPlayer = Math.sqrt((px - icx) * (px - icx) + (py - icy) * (py - icy));
      if (distToPlayer > 4) continue;

      // Expanded hit zone for wall items:
      // Whiteboard is on y=0 wall → expand y hit area to include y=-1..1
      // PostIt board is on x=0 wall → expand x hit area to include x=-1..1
      var hitMinX = item.x - 1;
      var hitMaxX = item.x + (def.width || 1) + 1;
      var hitMinY = item.y - 1;
      var hitMaxY = item.y + (def.height || 1) + 1;

      if (clickX >= hitMinX && clickX < hitMaxX && clickY >= hitMinY && clickY < hitMaxY) {
        var wbId = item.whiteboardId || ('wb_' + item.type + '_' + i);
        item.whiteboardId = wbId;
        // #7 Achievement for first board interaction
        if (typeof UXEnhancements !== 'undefined') UXEnhancements.checkAchievement('firstBoard');
        if (def.isPostItBoard) {
          UI.openPostItBoard(wbId, item);
        } else {
          UI.openWhiteboard(wbId, item);
        }
        return;
      }
    }

    // Clic sur un meuble : l'admin le sélectionne; tout le monde marche
    // jusqu'à lui (case adjacente libre si le meuble est plein).
    for (var j = Board.furniture.length - 1; j >= 0; j--) {
      var fitem = Board.furniture[j];
      var fdef = Environments.furnitureTypes[fitem.type];
      if (!fdef || fdef.isWhiteboard || fdef.isPostItBoard) continue;
      if (clickX >= fitem.x && clickX < fitem.x + (fdef.width || 1) && clickY >= fitem.y && clickY < fitem.y + (fdef.height || 1)) {
        // #22 Click feedback: brief highlight on clicked furniture
        this._flashFurniture = { item: fitem, time: performance.now() };
        // La sélection admin se fait au clic droit (menu contextuel) ou en
        // mode édition — le clic gauche reste toujours un déplacement.
        if (!Board.isSolid(gp.x, gp.y)) {
          this.moveTarget = { x: gp.x, y: gp.y, setAt: performance.now() };
        } else {
          var adj = this.findWalkableNear(fitem.x + (fdef.width || 1) / 2, fitem.y + (fdef.height || 1) / 2, px, py);
          if (adj) this.moveTarget = { x: adj.x, y: adj.y, setAt: performance.now() };
        }
        return;
      }
    }
    // Click on empty space: deselect
    this.selectedFurniture = null;

    // Clic sur le sol : on s'y rend (design — « Clic : aller à un endroit »).
    // Aucun clic n'est « mort » : une case occupée envoie vers la case libre
    // la plus proche, pour un déplacement toujours réactif.
    if (gp.x > 0.5 && gp.y > 0.5 && gp.x < Board.gridSize - 0.5 && gp.y < Board.gridSize - 0.5) {
      if (!Board.isSolid(gp.x, gp.y)) {
        this.moveTarget = { x: gp.x, y: gp.y, setAt: performance.now() };
      } else {
        var near = this.findWalkableNear(gp.x, gp.y, px, py);
        if (near) this.moveTarget = { x: near.x, y: near.y, setAt: performance.now() };
      }
    }
  },

  setupChat: function() {
    var self = this;
    var input = document.getElementById('chat-input');
    var sendBtn = document.getElementById('chat-send');
    var container = document.getElementById('chat-container');
    var messages = document.getElementById('chat-messages');
    var badge = document.getElementById('chat-badge');
    var unread = 0;

    var newMsgBtn = document.getElementById('chat-new-messages-btn');
    var typingIndicator = document.getElementById('chat-typing-indicator');
    var userIsScrolledUp = false;

    // #26 Track if user has scrolled up
    if (messages) {
      messages.addEventListener('scroll', function() {
        var isAtBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 30;
        userIsScrolledUp = !isAtBottom;
        if (isAtBottom && newMsgBtn) newMsgBtn.style.display = 'none';
      });
    }
    // #26 New messages button click
    if (newMsgBtn) {
      newMsgBtn.addEventListener('click', function() {
        if (messages) messages.scrollTop = messages.scrollHeight;
        newMsgBtn.style.display = 'none';
      });
    }

    // #27 Typing indicator - debounced emit
    var typingTimeout = null;
    function sendMessage() {
      if (!input || !input.value.trim()) return;
      var text = input.value.trim();
      Network.socket.emit('chat-message', { text: text });
      Network.socket.emit('chat-typing', { typing: false });
      self.player.chatBubble = { text: text, time: Date.now() };
      input.value = '';
      // #7 Achievement for first chat message
      if (typeof UXEnhancements !== 'undefined') UXEnhancements.checkAchievement('firstChat');
      // #43 Prune old messages
      if (typeof UXEnhancements !== 'undefined') UXEnhancements.pruneChatMessages();
    }

    if (input) {
      input.addEventListener('keydown', function(e) {
        e.stopPropagation();
        if (e.code === 'Enter') sendMessage();
      });
      // #27 Typing indicator emit
      input.addEventListener('input', function() {
        if (input.value.trim().length > 0) {
          Network.socket.emit('chat-typing', { typing: true });
          clearTimeout(typingTimeout);
          typingTimeout = setTimeout(function() {
            Network.socket.emit('chat-typing', { typing: false });
          }, 3000);
        } else {
          Network.socket.emit('chat-typing', { typing: false });
        }
      });
    }
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    // #27 Receive typing indicators
    var typingUsers = {};
    Network.socket.on('chat-typing', function(d) {
      if (d.socketId === Network.mySocketId) return;
      if (d.typing) {
        typingUsers[d.socketId] = d.pseudo || '...';
      } else {
        delete typingUsers[d.socketId];
      }
      var names = Object.values(typingUsers);
      if (typingIndicator) {
        if (names.length > 0) {
          var who = names.length <= 2 ? names.join(' et ') : names.length + ' personnes';
          typingIndicator.innerHTML = who + ' \u00e9cri' + (names.length > 1 ? 'vent' : 't') + ' <span class="typing-dots"><span></span><span></span><span></span></span>';
        } else {
          typingIndicator.innerHTML = '';
        }
      }
    });

    // Échappe PUIS rend les liens cliquables (jamais l'inverse : XSS)
    self.linkifyChat = function(text) {
      var safe = self.escapeHtml(text);
      return safe.replace(/(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    };
    // La couleur de l'auteur = la couleur du haut de son avatar
    self.chatAuthorColor = function(socketId) {
      if (socketId === Network.mySocketId && self.player.colors) return self.player.colors.shirt;
      var rp = Network.remotePlayers.get(socketId);
      return (rp && rp.colors) ? rp.colors.shirt : null;
    };
    self.renderChatMessage = function(msg) {
      if (!messages) return;
      var emptyEl = document.getElementById('chat-empty-state');
      if (emptyEl) emptyEl.remove();
      var div = document.createElement('div');
      div.className = 'chat-msg';
      // #84 Mention de mon pseudo : message mis en avant + petit ping
      var me = (self.player.pseudo || '').toLowerCase();
      if (me && msg.socketId !== Network.mySocketId &&
          (msg.text || '').toLowerCase().indexOf('@' + me) >= 0) {
        div.classList.add('chat-msg-mention');
        self.initSfx && self.initSfx();
        self.playSfx && self.playSfx('notification');
      }
      var color = self.chatAuthorColor(msg.socketId);
      div.innerHTML = '<span class="chat-msg-author"' + (color ? ' style="color:' + color + '"' : '') + '>' +
        self.escapeHtml(msg.pseudo || 'Anonyme') + ':</span> ' + self.linkifyChat(msg.text);
      messages.appendChild(div);
      return div;
    };

    Network.socket.on('chat-message', function(msg) {
      if (!messages) return;
      // Clear typing for sender
      delete typingUsers[msg.socketId];
      self.renderChatMessage(msg);

      // #26 Auto-scroll or show "new messages" button
      if (!userIsScrolledUp) {
        messages.scrollTop = messages.scrollHeight;
      } else if (newMsgBtn) {
        newMsgBtn.style.display = 'block';
      }

      // Show chat bubble above the sender's character
      if (msg.socketId && msg.socketId !== Network.mySocketId) {
        var rp = Network.remotePlayers.get(msg.socketId);
        if (rp) rp.chatBubble = { text: msg.text, time: Date.now() };
      }

      // Badge if collapsed
      if (container && container.classList.contains('chat-collapsed')) {
        unread++;
        if (badge) { badge.textContent = unread; badge.style.display = 'inline'; }
      }
      // #43 Prune old chat messages
      if (typeof UXEnhancements !== 'undefined') UXEnhancements.pruneChatMessages();
    });

    // Reset badge on open
    if (container) {
      container.addEventListener('click', function() {
        if (!container.classList.contains('chat-collapsed')) {
          unread = 0;
          if (badge) badge.style.display = 'none';
        }
      });
    }
  },

  escapeHtml: function(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // ===== SOUND DESIGN =====
  sfxCtx: null,
  sfxMasterGain: null,
  sfxVolume: 0.7,
  sfxLastStep: 0,
  sfxInitialized: false,
  // Sound spam prevention: track last play time per sound type
  _sfxLastPlay: {},
  _sfxMinInterval: { step: 200, bump: 250, join: 800, leave: 800, proximity: 500, notification: 1000, click: 100 },
  // Queue for sounds when multiple fire at once
  _sfxQueue: [],
  _sfxQueueTimer: null,

  initSfx: function() {
    if (this.sfxInitialized) return;
    try {
      this.sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Master gain node for SFX volume control (separate from voice)
      this.sfxMasterGain = this.sfxCtx.createGain();
      this.sfxMasterGain.gain.value = this.sfxVolume;
      this.sfxMasterGain.connect(this.sfxCtx.destination);
      this.sfxInitialized = true;
    } catch(e) {}
  },

  setSfxVolume: function(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    if (this.sfxMasterGain) {
      this.sfxMasterGain.gain.setValueAtTime(this.sfxVolume, this.sfxCtx.currentTime);
    }
  },

  // Resume AudioContext on user interaction (Chrome autoplay policy)
  _ensureSfxContext: function() {
    if (!this.sfxCtx) return false;
    if (this.sfxCtx.state === 'suspended') {
      this.sfxCtx.resume();
    }
    return this.sfxCtx.state === 'running';
  },

  playSfx: function(type) {
    if (!this.sfxCtx || !this.sfxMasterGain) return;
    if (this.sfxMuted) return; // #42 Sound mute toggle
    if (!this._ensureSfxContext()) return;

    // Sound spam prevention: debounce by type
    var now = performance.now();
    var minInterval = this._sfxMinInterval[type] || 200;
    if (this._sfxLastPlay[type] && now - this._sfxLastPlay[type] < minInterval) return;
    this._sfxLastPlay[type] = now;

    try {
      var ctx = this.sfxCtx;
      var dest = this.sfxMasterGain;
      var t = ctx.currentTime;

      if (type === 'step') {
        // Barely audible soft tap — filtered noise-like click
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 150 + Math.random() * 60;
        gain.gain.setValueAtTime(0.015, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.05);

      } else if (type === 'bump') {
        // Percussive wall hit: short noise burst + low thud
        // Thud component
        var osc1 = ctx.createOscillator();
        var gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(100, t);
        osc1.frequency.exponentialRampToValueAtTime(40, t + 0.08);
        gain1.gain.setValueAtTime(0.12, t);
        gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc1.connect(gain1);
        gain1.connect(dest);
        osc1.start(t);
        osc1.stop(t + 0.1);
        // Noise/click component using high-frequency square wave
        var osc2 = ctx.createOscillator();
        var gain2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.value = 800;
        gain2.gain.setValueAtTime(0.04, t);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc2.connect(gain2);
        gain2.connect(dest);
        osc2.start(t);
        osc2.stop(t + 0.03);

      } else if (type === 'proximity') {
        // Gentle shimmer to indicate entering audio range
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.15);
        gain.gain.setValueAtTime(0.02, t);
        gain.gain.linearRampToValueAtTime(0.03, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.2);

      } else if (type === 'join') {
        // Pleasant two-note chime with harmonic: C5 -> E5
        // Fundamental note 1: C5 (523 Hz)
        var osc1 = ctx.createOscillator();
        var gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = 523.25;
        gain1.gain.setValueAtTime(0.09, t);
        gain1.gain.exponentialRampToValueAtTime(0.02, t + 0.15);
        gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc1.connect(gain1);
        gain1.connect(dest);
        osc1.start(t);
        osc1.stop(t + 0.25);
        // Harmonic of note 1 (octave above, subtle)
        var osc1h = ctx.createOscillator();
        var gain1h = ctx.createGain();
        osc1h.type = 'sine';
        osc1h.frequency.value = 1046.5;
        gain1h.gain.setValueAtTime(0.025, t);
        gain1h.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc1h.connect(gain1h);
        gain1h.connect(dest);
        osc1h.start(t);
        osc1h.stop(t + 0.2);
        // Fundamental note 2: E5 (659 Hz), starts after note 1
        var osc2 = ctx.createOscillator();
        var gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = 659.25;
        gain2.gain.setValueAtTime(0.001, t);
        gain2.gain.setValueAtTime(0.1, t + 0.13);
        gain2.gain.exponentialRampToValueAtTime(0.02, t + 0.35);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc2.connect(gain2);
        gain2.connect(dest);
        osc2.start(t);
        osc2.stop(t + 0.5);
        // Harmonic of note 2 (octave above, subtle)
        var osc2h = ctx.createOscillator();
        var gain2h = ctx.createGain();
        osc2h.type = 'sine';
        osc2h.frequency.value = 1318.5;
        gain2h.gain.setValueAtTime(0.001, t);
        gain2h.gain.setValueAtTime(0.02, t + 0.13);
        gain2h.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc2h.connect(gain2h);
        gain2h.connect(dest);
        osc2h.start(t);
        osc2h.stop(t + 0.4);

      } else if (type === 'leave') {
        // Soft descending tone: E5 -> C5, gentle and not alarming
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659, t);
        osc.frequency.exponentialRampToValueAtTime(440, t + 0.2);
        osc.frequency.exponentialRampToValueAtTime(392, t + 0.35);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.linearRampToValueAtTime(0.03, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.35);

      } else if (type === 'notification') {
        // Three-note ascending chime for important events (timer, admin)
        var notes = [523.25, 659.25, 783.99]; // C5, E5, G5 (major triad)
        for (var i = 0; i < notes.length; i++) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = notes[i];
          var noteStart = t + i * 0.12;
          gain.gain.setValueAtTime(0.001, t);
          gain.gain.setValueAtTime(0.1, noteStart);
          gain.gain.exponentialRampToValueAtTime(0.02, noteStart + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.4);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(noteStart + 0.4);
        }
        // Add a subtle fifth harmonic on the last note for richness
        var osc3h = ctx.createOscillator();
        var gain3h = ctx.createGain();
        osc3h.type = 'sine';
        osc3h.frequency.value = 1567.98; // G6
        var lastStart = t + 0.24;
        gain3h.gain.setValueAtTime(0.001, t);
        gain3h.gain.setValueAtTime(0.025, lastStart);
        gain3h.gain.exponentialRampToValueAtTime(0.001, lastStart + 0.35);
        osc3h.connect(gain3h);
        gain3h.connect(dest);
        osc3h.start(t);
        osc3h.stop(lastStart + 0.35);

      } else if (type === 'click') {
        // Crisp, short UI click
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.02);
        gain.gain.setValueAtTime(0.03, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.04);
      }
    } catch(e) {}
  },

  sendReaction: function(emoji) {
    Network.socket.emit('reaction', { emoji: emoji });
    this.addReaction(emoji, this.player.x, this.player.y);
  },

  addReaction: function(emoji, x, y) {
    // #5 Bigger, more visible reactions with bounce
    this.reactions.push({ emoji: emoji, x: x, y: y, opacity: 2.0, offsetY: 0, scale: 0.3, t: 0, bouncePhase: 0 });
    // #7 Achievement for first reaction
    if (typeof UXEnhancements !== 'undefined') UXEnhancements.checkAchievement('firstReaction');
  },

  triggerConfetti: function() {
    // #38 Reduce particle count when FPS is low
    var count = 100;
    if (typeof UXEnhancements !== 'undefined' && UXEnhancements.shouldReduceParticles()) count = 40;
    for (var i = 0; i < count; i++) {
      this.confetti.push({
        x: Math.random() * this.viewW, y: -Math.random() * 200,
        vx: (Math.random() - 0.5) * 5, vy: Math.random() * 3 + 2,
        color: ['#FF6B6B','#FFD93D','#6BCB77','#4D96FF','#FF78C4'][Math.floor(Math.random() * 5)],
        size: Math.random() * 6 + 3, rot: Math.random() * 6, opacity: 1,
      });
    }
  },

  triggerApplause: function() {
    var self = this;
    Network.remotePlayers.forEach(function(r) { self.addReaction('\uD83D\uDC4F', r.renderX, r.renderY); });
    this.addReaction('\uD83D\uDC4F', this.player.x, this.player.y);
  },

  // #24 Door approach prompt
  _doorPromptVisible: false,
  _updateDoorPrompt: function() {
    var prompt = document.getElementById('door-prompt');
    if (!prompt) return;
    var px = this.player.x, py = this.player.y;
    var nearDoor = null;
    for (var i = 0; i < Board.furniture.length; i++) {
      var item = Board.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def || !def.isDoor) continue;
      var dist = Math.sqrt((px - (item.x + 0.5)) * (px - (item.x + 0.5)) + (py - (item.y + 0.5)) * (py - (item.y + 0.5)));
      if (dist < 2.5 && item.linkedDoorId) { nearDoor = item; break; }
    }
    if (nearDoor && !this._doorPromptVisible) {
      var screenPos = Board.iso(nearDoor.x + 0.5, nearDoor.y);
      var sx = screenPos.x * this.zoom + this.camera.x;
      var sy = screenPos.y * this.zoom + this.camera.y - 40;
      prompt.style.left = sx + 'px';
      prompt.style.top = sy + 'px';
      prompt.innerHTML = 'Cliquer pour entrer \u00ab ' + (nearDoor.doorLabel || 'Portail') + ' \u00bb';
      prompt.style.display = 'block';
      this._doorPromptVisible = true;
    } else if (!nearDoor && this._doorPromptVisible) {
      prompt.style.display = 'none';
      this._doorPromptVisible = false;
    }
  },

  // #44 Connection quality indicator
  _updateConnectionIndicator: function() {
    var dot = document.getElementById('connection-dot');
    if (!dot) return;
    if (!Network.socket || !Network.socket.connected) {
      dot.className = 'connection-dot poor';
    } else {
      // Use socket transport type as proxy for quality
      var transport = Network.socket.io && Network.socket.io.engine ? Network.socket.io.engine.transport.name : 'websocket';
      dot.className = transport === 'websocket' ? 'connection-dot good' : 'connection-dot medium';
    }
  },

  // Sound mute flag (#42)
  sfxMuted: false,

  start: function() {
    if (this.started) return;
    this.started = true;
    this.lastTime = performance.now();
    // #12 Show compass indicator
    var compass = document.getElementById('compass-indicator');
    if (compass) compass.style.display = 'flex';
    // #41 Hide loading bar
    var loadingBar = document.getElementById('room-loading-indicator');
    if (loadingBar) loadingBar.style.display = 'none';

    var self = this;
    function loop(ts) {
      var dt = Math.min((ts - self.lastTime) / 1000, 0.1);
      self.lastTime = ts;
      self.update(dt);
      // #99 Économie : onglet en arrière-plan → on garde la logique réseau
      // mais on ne rend plus qu'à ~4 images/s
      if (document.hidden) {
        setTimeout(function() { requestAnimationFrame(loop); }, 250);
        return;
      }
      self.render(ts);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    setInterval(function() { if (UI.activeTimer) UI.updateTimerDisplay(); }, 1000);
    // #46 Update room uptime periodically
    setInterval(function() { if (UI.adminPanelOpen) UI.updateRoomUptime(); }, 5000);
  },

  update: function(dt) {
    if (this.editMode) return; // Skip player update in edit mode
    var dx = 0, dy = 0;
    if (this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['KeyZ']) dy = -1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) dy = 1;
    if (this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['KeyQ']) dx = -1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) dx = 1;

    // Clic-pour-se-déplacer (design) : le clavier reprend toujours la main
    if (dx !== 0 || dy !== 0) {
      this.moveTarget = null;
    } else if (this.moveTarget) {
      var mtx = this.moveTarget.x - this.player.x;
      var mty = this.moveTarget.y - this.player.y;
      var mtd = Math.sqrt(mtx * mtx + mty * mty);
      if (mtd < 0.15) {
        this.moveTarget = null;
      } else {
        dx = mtx / mtd; dy = mty / mtd;
        // Contournement : si l'axe X est bloqué on glisse sur Y, et inversement.
        var blockedX = Board.isSolid(this.player.x + dx * 0.35, this.player.y);
        var blockedY = Board.isSolid(this.player.x, this.player.y + dy * 0.35);
        if (blockedX && !blockedY) { dx = 0; dy = dy > 0 ? 1 : (dy < 0 ? -1 : 0); }
        else if (blockedY && !blockedX) { dy = 0; dx = dx > 0 ? 1 : (dx < 0 ? -1 : 0); }
        else if (blockedX && blockedY) {
          // Coin bloquant : on abandonne sans gigoter
          this.moveTarget = null; dx = 0; dy = 0;
        }
        // Cible inatteignable depuis trop longtemps : on s'arrête proprement
        if (this.moveTarget && performance.now() - this.moveTarget.setAt > 12000) {
          this.moveTarget = null; dx = 0; dy = 0;
        }
      }
    }

    if (dx !== 0 || dy !== 0) {
      var len = Math.sqrt(dx * dx + dy * dy);
      dx /= len; dy /= len;
      var speed = CONSTANTS.MOVE_SPEED * 60;
      var nx = this.player.x + dx * speed * dt;
      var ny = this.player.y + dy * speed * dt;
      // Allow movement out of solid tiles (spawned inside furniture)
      var stuckInSolid = Board.isSolid(this.player.x, this.player.y);
      var couldMoveX = stuckInSolid || (!Board.isSolid(nx, this.player.y) && Board.isInBounds(nx, this.player.y));
      var couldMoveY = stuckInSolid || (!Board.isSolid(this.player.x, ny) && Board.isInBounds(this.player.x, ny));
      if (couldMoveX) this.player.x = nx;
      if (couldMoveY) this.player.y = ny;

      // Bump sound when hitting wall/furniture
      if (!couldMoveX || !couldMoveY) {
        this.initSfx();
        if (performance.now() - this.sfxLastStep > 300) {
          this.playSfx('bump');
          this.sfxLastStep = performance.now();
        }
      }

      this.player.x = Math.max(0.5, Math.min(Board.gridSize - 0.5, this.player.x));
      this.player.y = Math.max(0.5, Math.min(Board.gridSize - 0.5, this.player.y));
      this.player.direction = { dx: dx, dy: dy };
      this.player.isWalking = true;
      this.player.walkPhase += CONSTANTS.ANIMATION_SPEED * 60 * dt;

      // Footstep sound
      this.initSfx();
      if (performance.now() - this.sfxLastStep > 250) {
        this.playSfx('step');
        this.sfxLastStep = performance.now();
      }
    } else {
      this.player.isWalking = false;
    }

    Network.sendPosition(this.player.x, this.player.y, this.player.direction, this.player.isWalking, this.player.walkPhase);
    Network.updateRemotePlayers(dt);
    Audio.updateProximity(this.player, Network.remotePlayers, this.player.audioRadius);

    // Camera follow with zoom
    var followX = this.player.x, followY = this.player.y;
    if (this.followTarget) {
      var ft = Network.remotePlayers.get(this.followTarget);
      if (ft) { followX = ft.renderX; followY = ft.renderY; }
      else { this.followTarget = null; }
    }
    var ps = Board.iso(followX, followY);
    var tcx = this.viewW / 2 - ps.x * this.zoom;
    var tcy = this.viewH / 2 - ps.y * this.zoom;
    // #16 Double-click camera centering
    if (this._cameraCenterTarget) {
      tcx = this._cameraCenterTarget.x;
      tcy = this._cameraCenterTarget.y;
      if (Math.abs(this.camera.x - tcx) < 1 && Math.abs(this.camera.y - tcy) < 1) {
        this._cameraCenterTarget = null;
      }
    }
    // #13 Smooth camera ease
    this.camera.x += (tcx - this.camera.x) * 0.12;
    this.camera.y += (tcy - this.camera.y) * 0.12;

    // #24 Door approach prompt + #23 Proximity indicator for interactive furniture
    this._updateDoorPrompt();

    // #44 Connection quality indicator (periodic check)
    if (!this._lastConnCheck || performance.now() - this._lastConnCheck > 5000) {
      this._lastConnCheck = performance.now();
      this._updateConnectionIndicator();
    }

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
      if (c.opacity > 0 && c.y < this.viewH + 50) newConf.push(c);
    }
    this.confetti = newConf;

    UI.updateHUD(this.roomConfig.name, this.player.x, this.player.y, Network.getParticipantCount(), this.zoom);

    // === UX Enhancements per-frame updates ===
    if (typeof UXEnhancements !== 'undefined') {
      // #2 Particle trail
      UXEnhancements.updateParticleTrail(this.player.x, this.player.y, this.player.isWalking, dt);
      // #3 Wave on first proximity
      UXEnhancements.checkFirstProximity(this.player.x, this.player.y);
      // #38 FPS tracking for adaptive quality
      UXEnhancements.updateFps(dt);
      // #39 Smooth zoom (disabled - caused zoom interference)
      // UXEnhancements.updateSmoothZoom(dt);
    }
  },

  render: function(ts) {
    if (this.editMode) { this.renderEditMode(ts); return; }
    if (this.viewMode === 'topdown') { this.renderTopDown(ts); return; }

    var ctx = this.ctx;
    var w = this.viewW;
    var h = this.viewH;
    // Map logical pixels -> device pixels for this frame (crisp HiDPI rendering).
    ctx.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);

    // Fond thémé (design Insuffle Espace) : dégradé + halo, avec léger parallaxe
    var parallaxX = this.camera.x * 0.02;
    var parallaxY = this.camera.y * 0.02;
    var bgGrad = ctx.createLinearGradient(parallaxX, parallaxY, parallaxX, h + parallaxY);
    bgGrad.addColorStop(0, this.themeColor('--bg-1', '#eef1fc'));
    bgGrad.addColorStop(1, this.themeColor('--bg-2', '#dfe4f5'));
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    // Halo lumineux en haut de l'écran (radial-gradient du design)
    var glow = ctx.createRadialGradient(w / 2, -h * 0.1, 0, w / 2, -h * 0.1, h * 0.9);
    glow.addColorStop(0, this.themeColor('--bg-glowc', 'rgba(123,139,255,.30)'));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Apply zoom transform
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.zoom, this.zoom);

    // Draw grid
    Board.drawGrid(ctx, 0, 0, this.player.x, this.player.y);

    // Zones communes nommées (World Café, Forum Ouvert…) : bordure pointillée
    // légère + nom de musicien — tout le monde sait où aller.
    this.drawZoneAreas(ctx);

    // Collect entities for depth sort
    var entities = [];
    var furn = Board.furniture;
    for (var fi = 0; fi < furn.length; fi++) {
      var item = furn[fi];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      var sk;
      if (def.isStage || def.isCarpet || def.isZone || def.isCollabSpace || (def.drawHeight || 0) === 0) {
        // Plateformes et tapis : on marche dessus, ils se dessinent comme du
        // sol — jamais par-dessus un avatar qui se tient dessus.
        sk = item.x + item.y - 50;
      } else {
        sk = item.x + item.y + ((def.width || 1) + (def.height || 1)) / 2;
      }
      entities.push({ type: 'f', item: item, sk: sk });
    }
    this.tables.forEach(function(t) {
      entities.push({ type: 't', t: t, sk: t.x + t.y + (t.width + t.height) / 2 });
    });
    // Tiny elevation bias (always < 1) keeps a character on a raised stage in
    // front of the stage surface without ever crossing an iso tile boundary.
    var meElev = Board.getElevationAt(Math.floor(this.player.x), Math.floor(this.player.y)) || 0;
    entities.push({ type: 'me', sk: this.player.x + this.player.y + meElev * 0.01 });
    var self = this;
    Network.remotePlayers.forEach(function(p, sid) {
      if (p.opacity <= 0) return;
      var pElev = Board.getElevationAt(Math.floor(p.renderX), Math.floor(p.renderY)) || 0;
      entities.push({ type: 'r', p: p, sid: sid, sk: p.renderX + p.renderY + pElev * 0.01 });
    });
    // #45 Only resort when entities actually change positions
    entities.sort(function(a, b) { return a.sk - b.sk; });

    for (var ei = 0; ei < entities.length; ei++) {
      var e = entities[ei];
      if (e.type === 'f') {
        Board.drawFurnitureItem(ctx, e.item, 0, 0);
        // #22 Click feedback flash on furniture
        if (this._flashFurniture && this._flashFurniture.item === e.item) {
          var elapsed = performance.now() - this._flashFurniture.time;
          if (elapsed < 300) {
            var flashAlpha = 0.4 * (1 - elapsed / 300);
            var fdef22 = Environments.furnitureTypes[e.item.type];
            if (fdef22) {
              var fpos22 = Board.iso(e.item.x + (fdef22.width || 1) / 2, e.item.y + (fdef22.height || 1) / 2);
              ctx.save();
              ctx.globalAlpha = flashAlpha;
              ctx.fillStyle = '#fff';
              ctx.beginPath();
              ctx.arc(fpos22.x, fpos22.y, Board.tileWidth * 0.6, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          } else {
            this._flashFurniture = null;
          }
        }
      } else if (e.type === 't') {
        this.drawTable(ctx, e.t);
      } else if (e.type === 'me') {
        var onS = Board.isOnStage(Math.floor(this.player.x), Math.floor(this.player.y));
        // Expire old chat bubbles (5 seconds)
        var myChatBubble = this.player.chatBubble;
        if (myChatBubble && Date.now() - myChatBubble.time > 5000) { myChatBubble = null; this.player.chatBubble = null; }

        Character.draw(ctx, this.player.x, this.player.y, 0, 0, {
          colors: this.player.colors, direction: this.player.direction,
          walkPhase: this.player.walkPhase, isWalking: this.player.isWalking,
          pseudo: this.player.pseudo, isOnStage: onS, isAdmin: this.player.isAdmin,
          isMuted: this.player.isMuted, handRaised: this.player.handRaised,
          isBroadcasting: this.player.isBroadcasting,
          isSpeaking: Audio.isSpeaking(),
          isSharingScreen: ScreenShare.isSharing,
          accessory: this.player.accessory || 'none',
          chatBubble: myChatBubble,
          isMe: true,
        });
      } else if (e.type === 'r') {
        var p = e.p;
        // Expire old chat bubbles
        if (p.chatBubble && Date.now() - p.chatBubble.time > 5000) p.chatBubble = null;

        ctx.save();
        ctx.globalAlpha = p.opacity;
        if (self.spotlight && self.spotlight !== e.sid) ctx.globalAlpha *= 0.4;
        Character.draw(ctx, p.renderX, p.renderY, 0, 0, {
          colors: p.colors, direction: p.direction, walkPhase: p.walkPhase,
          isWalking: p.isWalking, pseudo: p.pseudo,
          isOnStage: Board.isOnStage(Math.floor(p.renderX), Math.floor(p.renderY)),
          isAdmin: p.isAdmin, disconnected: p.disconnected, isMuted: p.isMuted,
          handRaised: p.handRaised, isBroadcasting: p.isBroadcasting,
          isSpeaking: p.isSpeaking,
          isSharingScreen: ScreenShare.isSharingFrom(e.sid),
          accessory: p.accessory || 'none',
          chatBubble: p.chatBubble,
        });
        ctx.restore();
      }
    }

    // #25 Stage step-up visual cue (chevron arrows at stage edges)
    this.drawStageStepCues(ctx);

    // Sub-rooms (portals)
    this.drawSubRooms(ctx);

    // #23 Proximity indicator: subtle glow when near interactive furniture
    this.drawInteractiveGlow(ctx);

    // Étiquettes de zones (design) au-dessus des meubles interactifs
    this.drawZoneLabels(ctx);

    // Statuts, humeurs et jeu (module Facilitation)
    if (typeof Facilitation !== 'undefined' && Facilitation.draw) Facilitation.draw(ctx);
    // Traces de pas, boussole admin (module Extras)
    if (typeof Extras !== 'undefined' && Extras.draw) Extras.draw(ctx);

    // #2 Particle trail behind walking character
    if (typeof UXEnhancements !== 'undefined') {
      UXEnhancements.drawParticleTrail(ctx);
    }

    // Proximity radius (gradient)
    this.drawProximityRadius(ctx);

    // Marqueur de destination du clic-pour-se-déplacer (pulsation accent)
    if (this.moveTarget) {
      // #68 Chemin prévu : pointillé discret du joueur vers la destination
      var fromPos = Board.iso(this.player.x, this.player.y);
      var toPos = Board.iso(this.moveTarget.x, this.moveTarget.y);
      ctx.save();
      ctx.strokeStyle = this._withAlpha(this.themeColor('--accent', '#5b6cff'), 0.35);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -(performance.now() / 60) % 14;
      ctx.beginPath();
      ctx.moveTo(fromPos.x, fromPos.y);
      ctx.lineTo(toPos.x, toPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      var mtPos = Board.iso(this.moveTarget.x, this.moveTarget.y);
      var mtAge = (performance.now() - this.moveTarget.setAt) / 1000;
      var mtPulse = (mtAge * 1.4) % 1;
      var mtAccent = this.themeColor('--accent', '#5b6cff');
      ctx.save();
      ctx.translate(mtPos.x, mtPos.y);
      ctx.scale(1, 0.5);
      ctx.strokeStyle = this._withAlpha(mtAccent, 0.55 * (1 - mtPulse));
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 6 + mtPulse * 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = this._withAlpha(mtAccent, 0.8);
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Reactions
    this.drawReactions(ctx);

    // Screen share overlay
    ScreenShare.drawGlobalShare(ctx, 0, 0, this.roomConfig.gridSize);

    ctx.restore(); // end zoom

    // Confetti (screen space)
    this.drawConfetti(ctx);

    // #9 Subtle parallax on walls (applied via camera offset during draw)
    // Already handled by the camera lerp system

    // #34 Throttled minimap
    if (typeof UXEnhancements !== 'undefined' && UXEnhancements.shouldDrawMinimap()) {
      this.drawMinimap();
    } else if (typeof UXEnhancements === 'undefined') {
      this.drawMinimap();
    }
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

  // Convertit une couleur hex/rgb du thème en rgba avec alpha donné
  _withAlpha: function(color, alpha) {
    if (color.charAt(0) === '#') {
      var hex = color.slice(1);
      if (hex.length === 3) hex = hex.split('').map(function(c) { return c + c; }).join('');
      var n = parseInt(hex, 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
    }
    if (color.indexOf('rgb(') === 0) return color.replace(')', ',' + alpha + ')').replace('rgb(', 'rgba(');
    return color;
  },

  drawProximityCircle: function(ctx, px, py, radius, color, isLocal) {
    var pos = Board.iso(px, py);
    var now = performance.now();
    // Le cercle de parole respire doucement et s'agrandit en fluide
    // quand l'admin change le rayon.
    if (isLocal) {
      if (this._displayAudioRadius == null) this._displayAudioRadius = radius;
      if (Math.abs(this._displayAudioRadius - radius) > 0.005) {
        this._displayAudioRadius += (radius - this._displayAudioRadius) * 0.08;
      } else {
        this._displayAudioRadius = radius;
      }
      radius = this._displayAudioRadius;
      radius *= 1 + 0.012 * Math.sin(now / 900); // respiration subtile
    }
    var rx = radius * (Board.tileWidth / 2);
    var ry = radius * (Board.tileHeight / 2);
    var accent = isLocal ? this.themeColor('--accent', '#5b6cff') : color;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(1, ry / rx);

    // Halo doux (le « territoire de conversation »)
    var g = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
    g.addColorStop(0, this._withAlpha(accent, isLocal ? 0.07 : 0.04));
    g.addColorStop(0.7, this._withAlpha(accent, isLocal ? 0.035 : 0.015));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // Bord — plein pour soi, pointillé pour les autres
    if (isLocal) {
      ctx.strokeStyle = this._withAlpha(accent, 0.30);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = this._withAlpha(accent, 0.15);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
    }
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Onde sonore : anneau qui se propage quand on parle
    if (isLocal && typeof Audio !== 'undefined' && Audio.isSpeaking && Audio.isSpeaking()) {
      var wave = (now % 1400) / 1400;
      ctx.strokeStyle = this._withAlpha(accent, 0.4 * (1 - wave));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, rx * (0.25 + 0.75 * wave), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Étiquette du rayon en mètres, montrée brièvement quand il change
    if (isLocal && now - this._radiusChangedAt < 2600) {
      var fade = Math.min(1, (2600 - (now - this._radiusChangedAt)) / 600);
      var meters = this.player.audioRadius;
      var label = meters < 1 ? Math.round(meters * 100) + ' cm' : (Math.round(meters * 10) / 10) + ' m';
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.font = '700 12px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = this._withAlpha(accent, 0.85);
      ctx.fillText('Rayon de parole : ' + label, pos.x, pos.y - ry - 10);
      ctx.restore();
    }
  },

  // #25 Draw step-up chevrons at stage edges
  drawStageStepCues: function(ctx) {
    var px = this.player.x, py = this.player.y;
    for (var i = 0; i < Board.furniture.length; i++) {
      var item = Board.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def || !def.isStage) continue;
      var sw = def.width || 1, sh = def.height || 1;
      var cx = item.x + sw / 2, cy = item.y + sh / 2;
      var dist = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
      if (dist > sw + 3) continue;
      // Draw small upward chevrons along the bottom edge of the stage
      var bottomY = item.y + sh;
      for (var sx = 0; sx < sw; sx++) {
        var pos = Board.iso(item.x + sx + 0.5, bottomY);
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.2 * Math.sin(performance.now() / 500 + sx);
        ctx.fillStyle = '#C89868';
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - 8);
        ctx.lineTo(pos.x - 5, pos.y);
        ctx.lineTo(pos.x + 5, pos.y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  },

  // #23 Draw subtle glow on interactive furniture when player is near
  drawInteractiveGlow: function(ctx) {
    var px = this.player.x, py = this.player.y;
    for (var i = 0; i < Board.furniture.length; i++) {
      var item = Board.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      if (!def.isWhiteboard && !def.isPostItBoard && !def.isDoor && !def.isCollabSpace) continue;
      var icx = item.x + (def.width || 1) / 2;
      var icy = item.y + (def.height || 1) / 2;
      var dist = Math.sqrt((px - icx) * (px - icx) + (py - icy) * (py - icy));
      if (dist > 4) continue;
      var glowAlpha = Math.max(0.05, 0.25 * (1 - dist / 4));
      var isoPos = Board.iso(icx, icy);
      var glowR = Board.tileWidth * Math.max(def.width || 1, def.height || 1) * 0.4;
      var grad = ctx.createRadialGradient(isoPos.x, isoPos.y, 0, isoPos.x, isoPos.y, glowR);
      grad.addColorStop(0, 'rgba(94,140,106,' + glowAlpha + ')');
      grad.addColorStop(1, 'rgba(94,140,106,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(isoPos.x, isoPos.y, glowR, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // Noms d'espaces : musiciens et musiciennes iconiques, attribués de façon
  // déterministe (ordre stable des zones) — identiques pour tout le monde
  // sans synchronisation serveur.
  ZONE_NAMES: ['Daft Punk', 'Nina Simone', 'Miles Davis', 'Björk', 'Bowie',
    'Aretha', 'Coltrane', 'Édith Piaf', 'Stromae', 'Air', 'Gainsbourg',
    'Angèle', 'Prince', 'Camille', 'Vivaldi', 'Fela Kuti'],

  // Zones de discussion : tout le monde s'y entend, comme autour d'une table.
  // (zones, espaces collab et tapis/salons — géométrie partagée par tous)
  _buildDiscussionZones: function() {
    // Cache : on ne reconstruit que si le mobilier a changé
    var sig = Board.furniture.length + ':' + (Board.furniture.length ? (Board.furniture[Board.furniture.length - 1].id || '') : '');
    if (this._discussionZones && this._zonesSig === sig) return this._discussionZones;
    this._zonesSig = sig;
    var zones = [];
    for (var i = 0; i < Board.furniture.length; i++) {
      var item = Board.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def || (!def.isZone && !def.isCollabSpace && !def.isCarpet)) continue;
      var zw = item.width || def.width || 1;
      var zh = item.height || def.height || 1;
      zones.push({
        item: item, def: def,
        x0: item.x, y0: item.y,
        x1: item.x + zw, y1: item.y + zh,
      });
    }
    // Ordre stable (y puis x) pour des noms identiques chez tous
    zones.sort(function(a, b) { return (a.item.y - b.item.y) || (a.item.x - b.item.x); });
    for (var z = 0; z < zones.length; z++) {
      zones[z].private = !!zones[z].def.isPrivate;
      zones[z].name = (zones[z].private ? 'Salle ' : '') +
        this.ZONE_NAMES[z % this.ZONE_NAMES.length] + ' · ' + (z + 1);
    }
    this._discussionZones = zones;
    return zones;
  },

  // La zone d'index donné est-elle une salle fermée (conversation isolée) ?
  zoneIsPrivate: function(idx) {
    var zs = this._discussionZones || this._buildDiscussionZones();
    return idx >= 0 && idx < zs.length && !!zs[idx].private;
  },

  // Index de la zone de discussion contenant (x, y), -1 sinon
  zoneIndexAt: function(x, y) {
    var zs = this._discussionZones || this._buildDiscussionZones();
    for (var i = 0; i < zs.length; i++) {
      var z = zs[i];
      if (x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1) return i;
    }
    return -1;
  },

  drawZoneAreas: function(ctx) {
    var zones = this._buildDiscussionZones();
    if (!zones.length) return;
    var accent = this.themeColor('--accent', '#5b6cff');
    var muted = this.themeColor('--muted', '#737b96');
    var ink = this.themeColor('--ink', '#1d2138');
    var myZone = this.zoneIndexAt(this.player.x, this.player.y);

    for (var z = 0; z < zones.length; z++) {
      var it = zones[z].item, df = zones[z].def;
      var w = it.width || df.width || 1, h = it.height || df.height || 1;
      var pA = Board.iso(it.x, it.y), pB = Board.iso(it.x + w, it.y);
      var pC = Board.iso(it.x + w, it.y + h), pD = Board.iso(it.x, it.y + h);

      // Qui est dans cet espace ? (soi + les autres)
      var count = 0;
      if (myZone === z) count++;
      Network.remotePlayers.forEach(function(p) {
        if (p.opacity <= 0) return;
        if (p.renderX >= zones[z].x0 && p.renderX < zones[z].x1 &&
            p.renderY >= zones[z].y0 && p.renderY < zones[z].y1) count++;
      });
      var active = count >= 2;       // conversation en cours
      var mine = myZone === z;       // j'y suis

      ctx.save();
      // L'espace s'illumine doucement quand on y est ou qu'on y discute
      if (mine || active) {
        ctx.fillStyle = this._withAlpha(accent, mine ? 0.07 : 0.04);
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y);
        ctx.lineTo(pC.x, pC.y); ctx.lineTo(pD.x, pD.y);
        ctx.closePath();
        ctx.fill();
      }
      var priv = zones[z].private;
      ctx.strokeStyle = priv
        ? this._withAlpha(this.themeColor('--accent-2', '#ff9d7a'), mine ? 0.9 : 0.55)
        : this._withAlpha(accent, mine ? 0.75 : (active ? 0.5 : 0.35));
      ctx.lineWidth = priv ? (mine ? 3 : 2) : (mine ? 2.5 : 1.5);
      ctx.setLineDash(priv ? [] : [7, 6]);
      ctx.lineDashOffset = -(performance.now() / 90) % 13; // fourmille doucement
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y);
      ctx.lineTo(pC.x, pC.y); ctx.lineTo(pD.x, pD.y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // Nom de l'espace + occupation
      var name = (zones[z].private ? '🚪 ' : '') + zones[z].name + (count > 0 ? '  🗣 ' + count : '');
      ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      var tw = ctx.measureText(name).width;
      ctx.fillStyle = mine ? this._withAlpha(accent, 0.92) : this._withAlpha(accent, 0.10);
      ctx.beginPath();
      ctx.roundRect(pA.x - tw / 2 - 8, pA.y - 18, tw + 16, 17, 999);
      ctx.fill();
      ctx.fillStyle = mine ? '#ffffff' : muted;
      ctx.fillText(name, pA.x, pA.y - 4);
      ctx.restore();
    }

    // #15 Qui est avec moi ? — ligne vivante dans la room card
    var hereRow = document.getElementById('rc-here');
    if (myZone >= 0) {
      var names = [];
      Network.remotePlayers.forEach(function(p) {
        if (p.opacity <= 0) return;
        if (p.renderX >= zones[myZone].x0 && p.renderX < zones[myZone].x1 &&
            p.renderY >= zones[myZone].y0 && p.renderY < zones[myZone].y1) names.push(p.pseudo || '?');
      });
      if (!hereRow) {
        var rows = document.querySelector('.rc-rows');
        if (rows) {
          hereRow = document.createElement('div');
          hereRow.className = 'rc-row';
          hereRow.id = 'rc-here';
          rows.appendChild(hereRow);
        }
      }
      if (hereRow) {
        hereRow.style.display = 'flex';
        hereRow.textContent = (zones[myZone].private ? '🚪 ' : '🗣 ') + zones[myZone].name +
          (names.length ? ' — avec ' + names.slice(0, 3).join(', ') + (names.length > 3 ? ' +' + (names.length - 3) : '') : ' — seul·e ici');
      }
    } else if (hereRow) {
      hereRow.style.display = 'none';
    }

    // #21 Toc-toc : quelqu'un entre dans MON espace → petit son discret
    if (myZone >= 0) {
      var nowIn = {};
      Network.remotePlayers.forEach(function(p, sid) {
        if (p.opacity <= 0) return;
        if (p.renderX >= zones[myZone].x0 && p.renderX < zones[myZone].x1 &&
            p.renderY >= zones[myZone].y0 && p.renderY < zones[myZone].y1) nowIn[sid] = true;
      });
      var prevIn = this._zoneOccupants || {};
      var self9 = this;
      Object.keys(nowIn).forEach(function(sid) {
        if (!prevIn[sid] && performance.now() - (self9._lastKnock || 0) > 3000) {
          self9._lastKnock = performance.now();
          self9.initSfx && self9.initSfx();
          self9.playSfx && self9.playSfx('notification');
          var rp = Network.remotePlayers.get(sid);
          if (rp && zones[myZone].private) UI.showNotification('🚪 ' + (rp.pseudo || 'Quelqu\'un') + ' entre dans la salle');
        }
      });
      this._zoneOccupants = nowIn;
    } else {
      this._zoneOccupants = {};
    }

    // Entrée / sortie d'un espace : on le dit clairement
    if (myZone !== this._lastZoneIdx) {
      if (myZone >= 0) {
        UI.showNotification(zones[myZone].private
          ? '🚪 « ' + zones[myZone].name + ' » — conversation privée : vous n\'entendez plus que cette salle'
          : '🗣 Espace « ' + zones[myZone].name + ' » — tout le monde s\'entend ici');
      } else if (this._lastZoneIdx >= 0 && this._lastZoneIdx < zones.length) {
        UI.showNotification('Vous quittez « ' + zones[this._lastZoneIdx].name + ' »');
      }
      this._lastZoneIdx = myZone;
    }
  },

  // Étiquettes de zones du design : pastille flottante au-dessus des
  // meubles interactifs (tableau blanc, mur collaboratif, espace partagé, portes)
  drawZoneLabels: function(ctx) {
    this._zonePills = [];
    if (this.zoom < 0.55) return; // illisible en dézoom fort
    var panelBg = this.themeColor('--panel-solid', '#ffffff');
    var panelBorder = this.themeColor('--panel-border', 'rgba(20,28,60,.08)');
    var ink = this.themeColor('--ink', '#1d2138');
    var muted = this.themeColor('--muted', '#737b96');
    var accent = this.themeColor('--accent', '#5b6cff');
    var bob = Math.sin(performance.now() / 1100) * 2; // flotte doucement
    for (var i = 0; i < Board.furniture.length; i++) {
      var item = Board.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      var label = null, hint = '';
      if (def.isWhiteboard) { label = 'Tableau blanc'; hint = 'Dessiner ensemble'; }
      else if (def.isPostItBoard) { label = 'Mur collaboratif'; hint = 'Post-its & idées'; }
      else if (def.isCollabSpace) { label = 'Espace partagé'; hint = 'Partager un écran'; }
      else if (def.isDoor) { label = item.doorLabel || 'Sous-salle'; hint = 'Entrer'; }
      if (!label) continue;
      var cx = item.x + (def.width || 1) / 2;
      var pos = Board.iso(cx, item.y + (def.height || 1) / 2);
      var topY = pos.y - (def.drawHeight || 0) - 34 + bob;

      ctx.save();
      ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
      var wLabel = ctx.measureText(label).width;
      ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
      var wHint = hint ? ctx.measureText(hint).width : 0;
      var padX = 11, dotW = 14, sepW = hint ? 13 : 0;
      var pillW = padX * 2 + dotW + wLabel + sepW + wHint;
      var pillH = 26;
      var x0 = pos.x - pillW / 2, y0 = topY - pillH / 2;
      // Zone cliquable (coordonnées monde, marge généreuse)
      this._zonePills.push({ x0: x0 - 6, y0: y0 - 6, x1: x0 + pillW + 6, y1: y0 + pillH + 6, item: item, def: def });

      ctx.shadowColor = 'rgba(20,24,60,.28)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = panelBg;
      ctx.beginPath();
      ctx.roundRect(x0, y0, pillW, pillH, 13);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = panelBorder;
      ctx.lineWidth = 1;
      ctx.stroke();

      // point accent avec halo
      var dx0 = x0 + padX + 4;
      ctx.fillStyle = this._withAlpha(accent, 0.25);
      ctx.beginPath(); ctx.arc(dx0, topY, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(dx0, topY, 4, 0, Math.PI * 2); ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = ink;
      ctx.fillText(label, x0 + padX + dotW, topY);
      if (hint) {
        var sepX = x0 + padX + dotW + wLabel + 6;
        ctx.strokeStyle = panelBorder;
        ctx.beginPath(); ctx.moveTo(sepX, topY - 6); ctx.lineTo(sepX, topY + 6); ctx.stroke();
        ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = muted;
        ctx.fillText(hint, sepX + 7, topY);
      }
      ctx.restore();
    }
  },

  drawProximityRadius: function(ctx) {
    var self = this;
    var px = this.player.x;
    var py = this.player.y;
    var pr = this.player.audioRadius;
    var viewRange = pr * 3; // Only show circles for nearby players

    // Draw remote players' indicators (only when close enough to matter)
    Network.remotePlayers.forEach(function(p) {
      if (p.opacity <= 0) return;
      var dist = Math.sqrt((px - p.renderX) * (px - p.renderX) + (py - p.renderY) * (py - p.renderY));

      // Only show proximity circles for players within view range
      if (dist > viewRange) return;

      var inRange = dist < pr;
      if (inRange) {
        // Draw subtle connection line
        var p1 = Board.iso(px, py);
        var p2 = Board.iso(p.renderX, p.renderY);
        var lineAlpha = Math.max(0.05, 0.2 * (1 - dist / pr));
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = 'rgba(46,204,113,' + lineAlpha + ')';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Show small circle only for nearby players (green if talking range, gray if not)
      var color = inRange ? 'rgb(46,204,113)' : 'rgb(160,160,160)';
      self.drawProximityCircle(ctx, p.renderX, p.renderY, CONSTANTS.AUDIO_RADIUS, color, false);
    });

    // Draw local player's circle (always visible but subtle)
    this.drawProximityCircle(ctx, px, py, pr, 'rgb(52,152,219)', true);

    // Stage indicator
    if (Board.isOnStage(Math.floor(px), Math.floor(py))) {
      var elev = Board.getElevationAt(Math.floor(px), Math.floor(py));
      var stagePos = Board.iso(px, py, elev);
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(241,196,15,0.8)';
      ctx.textAlign = 'center';
      ctx.fillText('📢 Sur l\'estrade', stagePos.x, stagePos.y - 50);
    }
  },

  // #28 Reactions with pop animation and slight horizontal drift
  drawReactions: function(ctx) {
    for (var i = 0; i < this.reactions.length; i++) {
      var r = this.reactions[i];
      var pos = Board.iso(r.x, r.y);
      // #28 Add slight horizontal wobble for pop effect
      var wobble = Math.sin(r.t * 4) * 5 * r.scale;
      var sx = pos.x + wobble;
      var sy = pos.y + r.offsetY - 50;
      ctx.save();
      ctx.globalAlpha = Math.min(1, r.opacity);
      // #5 + #28 Bigger reactions with pop scale and bounce
      var popScale = r.t < 0.2 ? (r.scale * 1.4) : r.scale;
      var bounceOffset = Math.sin(r.t * 6) * Math.max(0, 3 - r.t * 2);
      sy += bounceOffset;
      var fs = Math.max(18, Math.floor(42 * popScale));
      ctx.font = fs + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.emoji, sx, sy);
      ctx.restore();
    }
  },

  drawSubRooms: function(ctx) {
    var self = this;
    if (!this.subRooms) return;
    this.subRooms.forEach(function(sr) {
      var w = sr.width || 3;
      var h = sr.height || 3;
      // Draw portal overlay on the floor
      for (var dy = 0; dy < h; dy++) {
        for (var dx = 0; dx < w; dx++) {
          Board.drawIsoPoly(ctx,
            [[sr.x+dx, sr.y+dy, 0.3],[sr.x+dx+1, sr.y+dy, 0.3],[sr.x+dx+1, sr.y+dy+1, 0.3],[sr.x+dx, sr.y+dy+1, 0.3]],
            'rgba(155,89,182,0.08)', null, 0
          );
        }
      }
      // Border
      Board.drawIsoLine(ctx, [sr.x, sr.y, 0.4], [sr.x+w, sr.y, 0.4], 'rgba(155,89,182,0.5)', 2);
      Board.drawIsoLine(ctx, [sr.x+w, sr.y, 0.4], [sr.x+w, sr.y+h, 0.4], 'rgba(155,89,182,0.5)', 2);
      Board.drawIsoLine(ctx, [sr.x+w, sr.y+h, 0.4], [sr.x, sr.y+h, 0.4], 'rgba(155,89,182,0.5)', 2);
      Board.drawIsoLine(ctx, [sr.x, sr.y+h, 0.4], [sr.x, sr.y, 0.4], 'rgba(155,89,182,0.5)', 2);
      // Label
      var lp = Board.iso(sr.x + w/2, sr.y + h/2, 1);
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(155,89,182,0.8)';
      ctx.textAlign = 'center';
      ctx.fillText('🚪 ' + (sr.name || 'Sous-salle'), lp.x, lp.y - 6);
      var count = sr.participants ? sr.participants.length : 0;
      if (count > 0) {
        ctx.font = '8px "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(155,89,182,0.6)';
        ctx.fillText(count + ' personne' + (count > 1 ? 's' : ''), lp.x, lp.y + 6);
      }
    });
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

    ctx.fillStyle = this.themeColor('--floor-b', '#e8e8e8');
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
      ctx.fillStyle = def.isStage ? '#C8A878' : def.isZone ? 'rgba(100,160,200,0.15)' : def.isCollabSpace ? 'rgba(46,204,113,0.15)' : def.isDoor ? 'rgba(155,89,182,0.4)' : def.color;
      ctx.fillRect(item.x * sc, item.y * sc, (def.width || 1) * sc, (def.height || 1) * sc);
    }
    var self = this;
    Network.remotePlayers.forEach(function(p) {
      if (p.opacity <= 0) return;
      ctx.fillStyle = p.disconnected ? 'rgba(200,200,50,0.5)' : '#2ecc71';
      ctx.beginPath(); ctx.arc(p.renderX * sc, p.renderY * sc, 2, 0, Math.PI * 2); ctx.fill();
      // #15 Speaking indicator on minimap
      if (p.isSpeaking && typeof UXEnhancements !== 'undefined') {
        UXEnhancements.drawMinimapSpeakingIndicator(ctx, p.renderX, p.renderY, sc);
      }
    });
    ctx.fillStyle = '#3498db';
    ctx.beginPath(); ctx.arc(this.player.x * sc, this.player.y * sc, 3, 0, Math.PI * 2); ctx.fill();
    // #15 Local speaking indicator on minimap
    if (Audio.isSpeaking() && typeof UXEnhancements !== 'undefined') {
      UXEnhancements.drawMinimapSpeakingIndicator(ctx, this.player.x, this.player.y, sc);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  },

  // ===== TOP-DOWN NAVIGATION VIEW =====

  // Vue de dessus — « Plan de salle » au design Insuffle Espace.
  // Grille centrée à l'écran (caméra indépendante de la vue iso), molette pour
  // zoomer. Les coordonnées du dernier rendu sont mémorisées dans _tdView pour
  // que clics, survols et téléportations tombent exactement où l'on pointe.
  renderTopDown: function(ts) {
    var ctx = this.ctx;
    var w = this.viewW;
    var h = this.viewH;
    ctx.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
    var gs = Board.gridSize;

    var cellSize = Math.min((w - 360) / gs, (h - 160) / gs) * this.zoom;
    cellSize = Math.max(6, cellSize);
    var gridW = gs * cellSize;
    var gridH = gs * cellSize;
    var ox = (w - gridW) / 2;
    var oy = (h - gridH) / 2 + 10;
    this._tdView = { ox: ox, oy: oy, cell: cellSize };

    // Fond thémé + halo (cohérent avec la vue iso)
    var bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, this.themeColor('--bg-1', '#eef1fc'));
    bgGrad.addColorStop(1, this.themeColor('--bg-2', '#dfe4f5'));
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Plateau : cadre arrondi avec ombre douce
    ctx.save();
    ctx.shadowColor = 'rgba(20,24,60,.30)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = this.themeColor('--floor-edge', '#a9c0a6');
    ctx.beginPath();
    ctx.roundRect(ox - 10, oy - 10, gridW + 20, gridH + 20, 18);
    ctx.fill();
    ctx.restore();

    // Damier
    for (var y = 0; y < gs; y++) {
      for (var x = 0; x < gs; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? Board.floorColor1 : Board.floorColor2;
        ctx.fillRect(ox + x * cellSize, oy + y * cellSize, cellSize + 0.5, cellSize + 0.5);
      }
    }

    // Mobilier : tuiles arrondies, point accent sur l'interactif
    var accent = this.themeColor('--accent', '#5b6cff');
    var ink = this.themeColor('--ink', '#1d2138');
    for (var fi = 0; fi < Board.furniture.length; fi++) {
      var item = Board.furniture[fi];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      var fw = (item.width || def.width || 1) * cellSize;
      var fh = (item.height || def.height || 1) * cellSize;
      var fx = ox + item.x * cellSize;
      var fy = oy + item.y * cellSize;
      var interactive = def.isWhiteboard || def.isPostItBoard || def.isCollabSpace || def.isDoor;

      ctx.save();
      ctx.shadowColor = 'rgba(20,24,60,.18)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = def.color || '#999';
      ctx.beginPath();
      ctx.roundRect(fx + 1.5, fy + 1.5, Math.max(3, fw - 3), Math.max(3, fh - 3), Math.min(7, cellSize * 0.3));
      ctx.fill();
      ctx.restore();

      if (interactive) {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(fx + fw - 6, fy + 6, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (cellSize > 17 && (def.width || 1) * (def.height || 1) >= 2) {
        ctx.font = '700 ' + Math.max(8, Math.min(11, cellSize * 0.32)) + 'px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.name, fx + fw / 2, fy + fh / 2);
      }
    }

    // Tables de travail : cadre pointillé accent + nom
    var self = this;
    this.tables.forEach(function(t) {
      var tx = ox + t.x * cellSize;
      var ty = oy + t.y * cellSize;
      var tw = t.width * cellSize;
      var th = t.height * cellSize;
      ctx.strokeStyle = self._withAlpha(accent, 0.65);
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.roundRect(tx, ty, tw, th, 8);
      ctx.stroke();
      ctx.setLineDash([]);
      if (t.name && cellSize > 12) {
        ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = accent;
        ctx.textAlign = 'center';
        ctx.fillText(t.name, tx + tw / 2, ty - 7);
      }
    });

    // #24 Espaces de discussion sur le plan : pointillés (ouverts),
    // trait plein chaud (salles fermées), avec leur nom
    var planZones = this._buildDiscussionZones();
    for (var pz = 0; pz < planZones.length; pz++) {
      var zz = planZones[pz];
      var zx = ox + zz.x0 * cellSize, zy = oy + zz.y0 * cellSize;
      var zw = (zz.x1 - zz.x0) * cellSize, zh = (zz.y1 - zz.y0) * cellSize;
      ctx.strokeStyle = zz.private
        ? this._withAlpha(this.themeColor('--accent-2', '#ff9d7a'), 0.8)
        : this._withAlpha(accent, 0.5);
      ctx.lineWidth = zz.private ? 2.5 : 1.5;
      ctx.setLineDash(zz.private ? [] : [5, 4]);
      ctx.beginPath();
      ctx.roundRect(zx, zy, zw, zh, 6);
      ctx.stroke();
      ctx.setLineDash([]);
      if (cellSize > 13) {
        ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = zz.private ? this.themeColor('--accent-2', '#ff9d7a') : this._withAlpha(accent, 0.8);
        ctx.fillText((zz.private ? '🚪 ' : '🗣 ') + zz.name, zx + 5, zy + 4);
      }
    }

    // Marqueur de destination (clic-pour-se-déplacer)
    if (this.moveTarget) {
      var mtx = ox + this.moveTarget.x * cellSize;
      var mty = oy + this.moveTarget.y * cellSize;
      var mtPulse = ((performance.now() - this.moveTarget.setAt) / 700) % 1;
      ctx.strokeStyle = this._withAlpha(accent, 0.55 * (1 - mtPulse));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mtx, mty, 5 + mtPulse * 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = this._withAlpha(accent, 0.8);
      ctx.beginPath();
      ctx.arc(mtx, mty, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pastille de joueur : pion + anneau + pseudo
    function drawPawn(px, py, fill, ring, pseudo, isMe) {
      ctx.save();
      ctx.shadowColor = 'rgba(20,24,60,.35)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(5, cellSize * 0.32), 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = ring;
      ctx.lineWidth = isMe ? 2.5 : 1.5;
      ctx.stroke();
      if (pseudo && cellSize > 11) {
        ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        var pw = ctx.measureText(pseudo).width + 12;
        var pyy = py - Math.max(12, cellSize * 0.55);
        ctx.fillStyle = isMe ? accent : self.themeColor('--panel-solid', '#fff');
        ctx.beginPath();
        ctx.roundRect(px - pw / 2, pyy - 8, pw, 15, 999);
        ctx.fill();
        ctx.fillStyle = isMe ? '#fff' : ink;
        ctx.textBaseline = 'middle';
        ctx.fillText(pseudo, px, pyy);
      }
    }

    // Cercle de parole du joueur local (rayon de la salle)
    var lpx = ox + this.player.x * cellSize;
    var lpy = oy + this.player.y * cellSize;
    ctx.beginPath();
    ctx.arc(lpx, lpy, this.player.audioRadius * cellSize, 0, Math.PI * 2);
    ctx.fillStyle = this._withAlpha(accent, 0.06);
    ctx.fill();
    ctx.strokeStyle = this._withAlpha(accent, 0.30);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    Network.remotePlayers.forEach(function(p) {
      if (p.opacity <= 0) return;
      drawPawn(ox + p.renderX * cellSize, oy + p.renderY * cellSize,
        p.colors ? p.colors.shirt : '#39b58a', '#ffffff', p.pseudo || '', false);
    });
    drawPawn(lpx, lpy, this.player.colors ? this.player.colors.shirt : accent, '#ffffff', this.player.pseudo || 'Vous', true);

    // Flèche de direction
    var ddx = this.player.direction.dx || 0;
    var ddy = this.player.direction.dy || 0;
    if (ddx !== 0 || ddy !== 0) {
      var dl = Math.sqrt(ddx * ddx + ddy * ddy);
      ctx.beginPath();
      ctx.moveTo(lpx, lpy);
      ctx.lineTo(lpx + (ddx / dl) * cellSize * 0.6, lpy + (ddy / dl) * cellSize * 0.6);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Bandeau d'aide discret
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = this.themeColor('--muted', '#737b96');
    ctx.textAlign = 'center';
    ctx.fillText('Plan de salle — V : vue isométrique · Clic : se déplacer · Molette : zoom', w / 2, h - 76);
  },

  // ===== TABLE NOTES DEBOUNCE (improvement #7) =====

  debouncedSaveTableNotes: function(tableId, content) {
    var self = this;
    if (this._tableNotesTimer) clearTimeout(this._tableNotesTimer);
    this._tableNotesQueue = { tableId: tableId, content: content };
    this._tableNotesTimer = setTimeout(function() {
      if (self._tableNotesQueue && Network.socket) {
        Network.socket.emit('update-table-notes', self._tableNotesQueue);
      }
      self._tableNotesQueue = null;
      self._tableNotesTimer = null;
    }, 500); // 500ms debounce
  },

  // ===== FOLLOW PLAYER (improvement #15) =====

  setFollowTarget: function(socketId) {
    this.followTarget = socketId;
    var rp = Network.remotePlayers.get(socketId);
    if (rp) {
      UI.showNotification('Suivi de ' + rp.pseudo);
    }
  },

  // ===== EDIT MODE =====

  toggleEditMode: function() {
    if (!this.player.isAdmin) return;
    this.editMode = !this.editMode;
    if (this.editMode) {
      // Center camera on grid
      var cellSize = this.getEditCellSize();
      this.editZoom = 1;
      this.editCamera.x = this.viewW / 2 - (Board.gridSize * cellSize) / 2;
      this.editCamera.y = this.viewH / 2 - (Board.gridSize * cellSize) / 2;
      this.editTool = 'place';
      this.editSelectedType = null;
      this.editDragging = null;
      this.editHovered = null;
      UI.showEditToolbar(true);
      UI.showNotification('Mode édition activé — Vue de dessus');
    } else {
      Board.buildCollisionMap();
      UI.showEditToolbar(false);
      UI.showNotification('Mode édition désactivé');
    }
  },

  getEditCellSize: function() {
    var maxDim = Math.min(this.viewW, this.viewH) * 0.85;
    return Math.max(10, Math.min(40, Math.floor(maxDim / Board.gridSize)));
  },

  editScreenToGrid: function(sx, sy) {
    var cellSize = this.getEditCellSize() * this.editZoom;
    var gx = Math.floor((sx - this.editCamera.x) / cellSize);
    var gy = Math.floor((sy - this.editCamera.y) / cellSize);
    return { x: gx, y: gy };
  },

  editFurnitureAt: function(gx, gy) {
    for (var i = Board.furniture.length - 1; i >= 0; i--) {
      var item = Board.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      var w = def.width || 1;
      var h = def.height || 1;
      if (gx >= item.x && gx < item.x + w && gy >= item.y && gy < item.y + h) {
        return item;
      }
    }
    return null;
  },

  onEditMouseDown: function(e) {
    var gp = this.editScreenToGrid(e.clientX, e.clientY);

    if (this.editTool === 'move') {
      var item = this.editFurnitureAt(gp.x, gp.y);
      if (item) {
        this.editDragging = { item: item, startX: e.clientX, startY: e.clientY, origX: item.x, origY: item.y };
        return;
      }
    }

    // Pan: left click on empty space (or any click when in place mode on empty)
    if (e.button === 0 && this.editTool !== 'delete') {
      var furn = this.editFurnitureAt(gp.x, gp.y);
      if (!furn && this.editTool !== 'place') {
        this.editIsPanning = true;
        this.editPanStart.x = e.clientX;
        this.editPanStart.y = e.clientY;
        this.editCameraStart.x = this.editCamera.x;
        this.editCameraStart.y = this.editCamera.y;
        return;
      }
      // Also allow panning if in place mode but no type selected
      if (this.editTool === 'place' && !this.editSelectedType) {
        this.editIsPanning = true;
        this.editPanStart.x = e.clientX;
        this.editPanStart.y = e.clientY;
        this.editCameraStart.x = this.editCamera.x;
        this.editCameraStart.y = this.editCamera.y;
        return;
      }
    }

    // Right-click to pan
    if (e.button === 2) {
      this.editIsPanning = true;
      this.editPanStart.x = e.clientX;
      this.editPanStart.y = e.clientY;
      this.editCameraStart.x = this.editCamera.x;
      this.editCameraStart.y = this.editCamera.y;
      e.preventDefault();
    }
  },

  onEditMouseMove: function(e) {
    var gp = this.editScreenToGrid(e.clientX, e.clientY);
    this.editMouseGrid.x = gp.x;
    this.editMouseGrid.y = gp.y;

    if (this.editIsPanning) {
      this.editCamera.x = this.editCameraStart.x + (e.clientX - this.editPanStart.x);
      this.editCamera.y = this.editCameraStart.y + (e.clientY - this.editPanStart.y);
      return;
    }

    if (this.editDragging) {
      var cellSize = this.getEditCellSize() * this.editZoom;
      var dx = Math.round((e.clientX - this.editDragging.startX) / cellSize);
      var dy = Math.round((e.clientY - this.editDragging.startY) / cellSize);
      this.editDragging.item.x = this.editDragging.origX + dx;
      this.editDragging.item.y = this.editDragging.origY + dy;
      return;
    }

    // Hover detection for move/delete
    if (this.editTool === 'move' || this.editTool === 'delete') {
      this.editHovered = this.editFurnitureAt(gp.x, gp.y);
    } else {
      this.editHovered = null;
    }
  },

  onEditMouseUp: function(e) {
    if (this.editIsPanning) {
      this.editIsPanning = false;
      return;
    }

    if (this.editDragging) {
      var item = this.editDragging.item;
      // Improvement #12: snap to grid (integer positions)
      item.x = Math.round(item.x);
      item.y = Math.round(item.y);
      // Improvement #5: enforce grid bounds
      item.x = Math.max(0, Math.min(Board.gridSize - 1, item.x));
      item.y = Math.max(0, Math.min(Board.gridSize - 1, item.y));
      this.editDragging = null;
      Board.buildCollisionMap();
      // Sync position to server (preserves all item properties including door links)
      if (item.id) {
        Network.socket.emit('move-furniture', { furnitureId: item.id, x: item.x, y: item.y });
      }
      return;
    }
  },

  // Placement vérifié (limites de grille) + synchro serveur — partagé entre
  // le clic en mode placement et le glisser-déposer depuis la palette.
  placeFurnitureAt: function(type, gx, gy) {
    var def = Environments.furnitureTypes[type];
    if (!def) return;
    gx = Math.floor(gx); gy = Math.floor(gy);
    if (gx < 0 || gy < 0 || gx + (def.width || 1) > Board.gridSize || gy + (def.height || 1) > Board.gridSize) {
      UI.showNotification('Hors de la salle — déposez sur la grille', 'warning');
      return;
    }
    Network.socket.emit('add-furniture', { type: type, x: gx, y: gy }, function(r) {
      if (r && r.success) {
        Board.furniture.push(r.item);
        Board.buildCollisionMap();
        UI.showNotification(def.name + ' placé avec succès');
      } else if (r && r.error) {
        UI.showNotification('Placement impossible (' + r.error + ')', 'warning');
      }
    });
  },

  onEditClick: function(e) {
    if (this.editIsPanning) return;
    var gp = this.editScreenToGrid(e.clientX, e.clientY);

    if (this.editTool === 'place' && this.editSelectedType) {
      var selDef = Environments.furnitureTypes[this.editSelectedType];
      // Zones et tapis : on les DESSINE en deux clics (coin A puis coin B)
      if (selDef && (selDef.isZone || selDef.isCollabSpace || selDef.isCarpet)) {
        if (!this._zoneDrawStart) {
          this._zoneDrawStart = { x: Math.floor(gp.x), y: Math.floor(gp.y) };
          UI.showNotification('🗣 Coin posé — cliquez le coin opposé pour dessiner l\'espace');
          return;
        }
        var a = this._zoneDrawStart;
        this._zoneDrawStart = null;
        var zx = Math.min(a.x, Math.floor(gp.x));
        var zy = Math.min(a.y, Math.floor(gp.y));
        var zw = Math.min(14, Math.abs(Math.floor(gp.x) - a.x) + 1);
        var zh = Math.min(14, Math.abs(Math.floor(gp.y) - a.y) + 1);
        var self2 = this;
        Network.socket.emit('add-furniture', { type: this.editSelectedType, x: zx, y: zy, width: zw, height: zh }, function(r) {
          if (r && r.success) {
            Board.furniture.push(r.item);
            Board.buildCollisionMap();
            UI.showNotification('Espace de ' + zw + '×' + zh + ' dessiné — tout le monde s\'y entendra');
          }
        });
        return;
      }
      this.placeFurnitureAt(this.editSelectedType, gp.x, gp.y);
      return;
    }

    if (this.editTool === 'delete') {
      var item = this.editFurnitureAt(gp.x, gp.y);
      if (item && item.id) {
        Network.socket.emit('remove-furniture', { furnitureId: item.id }, function(r) {
          if (r && r.success) {
            Board.furniture = Board.furniture.filter(function(f) { return f.id !== item.id; });
            Board.buildCollisionMap();
            UI.showNotification('Mobilier supprimé');
          }
        });
      }
      return;
    }
  },

  onEditWheel: function(e) {
    e.preventDefault();
    var oldZoom = this.editZoom;
    var d = e.deltaY > 0 ? -0.1 : 0.1;
    this.editZoom = Math.max(0.3, Math.min(3, this.editZoom + d));

    // Zoom toward mouse position
    var ratio = this.editZoom / oldZoom;
    this.editCamera.x = e.clientX - (e.clientX - this.editCamera.x) * ratio;
    this.editCamera.y = e.clientY - (e.clientY - this.editCamera.y) * ratio;
  },

  renderEditMode: function(ts) {
    var ctx = this.ctx;
    var w = this.viewW;
    var h = this.viewH;
    // Map logical pixels -> device pixels for this frame (crisp HiDPI rendering).
    ctx.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
    var gs = Board.gridSize;
    var cellSize = this.getEditCellSize() * this.editZoom;

    // Fond thémé + plateau arrondi (cohérent avec le reste du design)
    var bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, this.themeColor('--bg-1', '#eef1fc'));
    bgGrad.addColorStop(1, this.themeColor('--bg-2', '#dfe4f5'));
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.editCamera.x, this.editCamera.y);

    ctx.save();
    ctx.shadowColor = 'rgba(20,24,60,.25)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = this.themeColor('--floor-edge', '#a9c0a6');
    ctx.beginPath();
    ctx.roundRect(-8, -8, gs * cellSize + 16, gs * cellSize + 16, 14);
    ctx.fill();
    ctx.restore();

    // Draw floor tiles
    for (var y = 0; y < gs; y++) {
      for (var x = 0; x < gs; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? Board.floorColor1 : Board.floorColor2;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }

    // Draw grid lines
    ctx.strokeStyle = '#ced4da';
    ctx.lineWidth = 0.5;
    for (var gx = 0; gx <= gs; gx++) {
      ctx.beginPath();
      ctx.moveTo(gx * cellSize, 0);
      ctx.lineTo(gx * cellSize, gs * cellSize);
      ctx.stroke();
    }
    for (var gy = 0; gy <= gs; gy++) {
      ctx.beginPath();
      ctx.moveTo(0, gy * cellSize);
      ctx.lineTo(gs * cellSize, gy * cellSize);
      ctx.stroke();
    }

    // Draw walls as thick lines on top and left edges
    ctx.strokeStyle = '#5a6268';
    ctx.lineWidth = Math.max(3, cellSize * 0.12);
    // Top wall
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(gs * cellSize, 0);
    ctx.stroke();
    // Left wall
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, gs * cellSize);
    ctx.stroke();
    // Bottom and right (thinner)
    ctx.lineWidth = Math.max(2, cellSize * 0.06);
    ctx.strokeStyle = '#adb5bd';
    ctx.beginPath();
    ctx.moveTo(gs * cellSize, 0);
    ctx.lineTo(gs * cellSize, gs * cellSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, gs * cellSize);
    ctx.lineTo(gs * cellSize, gs * cellSize);
    ctx.stroke();

    // Draw furniture
    for (var fi = 0; fi < Board.furniture.length; fi++) {
      var item = Board.furniture[fi];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      var fw = (item.width || def.width || 1) * cellSize;
      var fh = (item.height || def.height || 1) * cellSize;
      var fx = item.x * cellSize;
      var fy = item.y * cellSize;

      // Tuile arrondie avec ombre douce (design)
      var rr = Math.min(8, cellSize * 0.3);
      ctx.save();
      ctx.shadowColor = 'rgba(20,24,60,.18)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = def.color || '#ccc';
      ctx.beginPath();
      ctx.roundRect(fx + 1.5, fy + 1.5, Math.max(3, fw - 3), Math.max(3, fh - 3), rr);
      ctx.fill();
      ctx.restore();

      // Surbrillance selon l'outil actif
      var isHovered = (this.editHovered === item);
      if (isHovered) {
        ctx.strokeStyle = this.editTool === 'delete' ? '#e0564e'
          : this.editTool === 'move' ? this.themeColor('--accent', '#5b6cff')
          : this.themeColor('--accent-2', '#ff9d7a');
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(fx + 1.5, fy + 1.5, Math.max(3, fw - 3), Math.max(3, fh - 3), rr);
        ctx.stroke();
      }

      // Nom centré, lisible
      if (cellSize > 14 && (def.width || 1) * (def.height || 1) >= 2) {
        var fontSize = Math.max(8, Math.min(12, cellSize * 0.32));
        ctx.font = '700 ' + fontSize + 'px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var label = def.name;
        if (label.length > 12 && cellSize < 25) label = label.substring(0, 10) + '…';
        ctx.fillText(label, fx + fw / 2, fy + fh / 2);
      }
    }

    // Draw players as colored circles
    var self = this;
    // Local player
    var playerR = Math.max(4, cellSize * 0.3);
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(this.player.x * cellSize, this.player.y * cellSize, playerR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Remote players
    Network.remotePlayers.forEach(function(p) {
      if (p.opacity <= 0) return;
      ctx.fillStyle = p.disconnected ? '#aaa' : '#2ecc71';
      ctx.beginPath();
      ctx.arc(p.renderX * cellSize, p.renderY * cellSize, playerR * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Ghost preview if in place mode with selected type
    if (this.editTool === 'place' && this.editSelectedType) {
      var gdef = Environments.furnitureTypes[this.editSelectedType];
      if (gdef) {
        var gmx = this.editMouseGrid.x;
        var gmy = this.editMouseGrid.y;
        var gw = (gdef.width || 1) * cellSize;
        var gh = (gdef.height || 1) * cellSize;
        var outOfBounds = gmx < 0 || gmy < 0 || gmx + (gdef.width || 1) > gs || gmy + (gdef.height || 1) > gs;

        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = outOfBounds ? '#e74c3c' : (gdef.color || '#ccc');
        ctx.fillRect(gmx * cellSize, gmy * cellSize, gw, gh);
        ctx.strokeStyle = outOfBounds ? '#c0392b' : '#2980b9';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(gmx * cellSize, gmy * cellSize, gw, gh);
        ctx.setLineDash([]);

        var gFontSize = Math.max(7, Math.min(11, cellSize * 0.3));
        ctx.font = 'bold ' + gFontSize + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(gdef.name, gmx * cellSize + gw / 2, gmy * cellSize + gh / 2);
        ctx.restore();
      }
    }

    // Coordinate labels on edges
    if (cellSize > 15) {
      var coordFontSize = Math.max(6, Math.min(10, cellSize * 0.25));
      ctx.font = coordFontSize + 'px "Segoe UI", sans-serif';
      ctx.fillStyle = '#999';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (var cx = 0; cx < gs; cx += Math.ceil(gs / 20)) {
        ctx.fillText(cx, cx * cellSize + cellSize / 2, -2);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var cy = 0; cy < gs; cy += Math.ceil(gs / 20)) {
        ctx.fillText(cy, -4, cy * cellSize + cellSize / 2);
      }
    }

    // #32 Show grid coordinates on hover in edit mode
    if (this.editMouseGrid.x >= 0 && this.editMouseGrid.x < gs && this.editMouseGrid.y >= 0 && this.editMouseGrid.y < gs) {
      var coordX = this.editMouseGrid.x * cellSize + cellSize / 2;
      var coordY = this.editMouseGrid.y * cellSize - 8;
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('(' + this.editMouseGrid.x + ', ' + this.editMouseGrid.y + ')', coordX, coordY);
      // #33 Highlight hovered cell with visual feedback
      ctx.strokeStyle = 'rgba(74,111,165,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.editMouseGrid.x * cellSize, this.editMouseGrid.y * cellSize, cellSize, cellSize);
    }

    ctx.restore();
  },

  darkenColor: function(hex, amount) {
    if (!hex || hex.indexOf('#') !== 0) return '#666';
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    r = Math.max(0, Math.floor(r * (1 - amount)));
    g = Math.max(0, Math.floor(g * (1 - amount)));
    b = Math.max(0, Math.floor(b * (1 - amount)));
    return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  },
};

window.addEventListener('DOMContentLoaded', function() { Engine.init(); });
