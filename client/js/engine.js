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
  roomConfig: { name: 'Room', environment: 'bureau', gridSize: 20, roomId: null, isCreator: false },
  lastTime: 0, started: false,
  reactions: [], confetti: [], spotlight: null,
  tables: new Map(),
  subRooms: new Map(),
  // Camera drag state
  isDragging: false, dragStart: { x: 0, y: 0 }, cameraStart: { x: 0, y: 0 },
  // View mode: 'iso' or 'topdown'
  viewMode: 'iso',
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
    Network.onReconnected = function() {
      UI.showReconnecting(false);
      // Re-join room with same config after reconnection (new socket ID)
      if (self.roomConfig && self.roomConfig.roomId) {
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
            UI.showNotification('Reconnecté !');
          } else {
            UI.showNotification('Erreur de reconnexion');
          }
        });
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
    s.on('environment-changed', function(d) { self.roomConfig.environment = d.environment; Board.init(self.roomConfig.gridSize, d.environment); UI.updateAdminSettings(); UI.refreshFurnitureList(); });
    s.on('grid-resized', function(d) { self.roomConfig.gridSize = d.size; Board.init(d.size, self.roomConfig.environment); self.player.x = Math.min(self.player.x, d.size - 1); self.player.y = Math.min(self.player.y, d.size - 1); UI.updateAdminSettings(); });
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
    s.on('admin-broadcast-start', function(d) { var r = Network.remotePlayers.get(d.socketId); if (r) r.isBroadcasting = true; UI.showNotification(d.pseudo + ' parle à tous'); });
    s.on('admin-broadcast-stop', function(d) { var r = Network.remotePlayers.get(d.socketId); if (r) r.isBroadcasting = false; });
    s.on('participant-speaking-changed', function(d) { var r = Network.remotePlayers.get(d.socketId); if (r) r.isSpeaking = d.speaking; });

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

    // Check for saved session (reconnect on refresh)
    var savedSession = null;
    try {
      var saved = localStorage.getItem('insuffle_session');
      if (saved) savedSession = JSON.parse(saved);
    } catch (e) {}

    // If same room and recent session (<30 min), auto-reconnect
    if (savedSession && savedSession.roomId === this.roomConfig.roomId && (Date.now() - savedSession.time < 1800000)) {
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
      if (r.error) { UI.showError(r.error); return; }
      self.player.x = r.you.x; self.player.y = r.you.y;
      self.player.role = r.you.role; self.player.isAdmin = r.you.isAdmin;
      self.roomConfig.name = r.room.name;
      self.roomConfig.environment = r.room.environment;
      self.roomConfig.gridSize = r.room.gridSize;
      document.getElementById('hud-room-name').textContent = r.room.name;
      if (!self.roomConfig.isCreator) Board.init(r.room.gridSize, r.room.environment);
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
    if (this.editMode) { this.onEditWheel(e); return; }
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
    if (e.code === 'KeyV' && !this.editMode) { this.viewMode = this.viewMode === 'iso' ? 'topdown' : 'iso'; UI.showNotification('Vue: ' + (this.viewMode === 'iso' ? 'Isométrique' : 'Vue de dessus')); }
    if (e.code === 'KeyE' && this.player.isAdmin) this.toggleEditMode();
    if (e.code === 'Escape') { if (this.editMode) { this.toggleEditMode(); return; } UI.hideContextMenu(); if (UI.shortcutsModalOpen) UI.toggleShortcutsModal(); if (UI.adminPanelOpen) UI.toggleAdminPanel(); }
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
    }
  },

  onMouseUp: function(e) {
    if (this.editMode) { this.onEditMouseUp(e); return; }
    if (e.button === 2 || e.button === 1) {
      // If barely moved, it was a right-click (context menu)
      if (this.isDragging) {
        var movedDist = Math.abs(e.clientX - this.dragStart.x) + Math.abs(e.clientY - this.dragStart.y);
        if (movedDist < 5) {
          var gp = Board.screenToGrid(e.clientX, e.clientY, this.camera.x, this.camera.y, this.zoom);
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

          // Otherwise show player context menu
          Network.remotePlayers.forEach(function(rp, sid) {
            var dist = Math.sqrt((gp.x - rp.renderX) * (gp.x - rp.renderX) + (gp.y - rp.renderY) * (gp.y - rp.renderY));
            if (dist < 1.5) UI.showContextMenu(e.clientX, e.clientY, sid, rp);
          });
        }
      }
      this.isDragging = false;
    }
  },

  selectedFurniture: null,

  onClick: function(e) {
    UI.hideContextMenu();
    if (!this.started) return;
    if (this.editMode) { this.onEditClick(e); return; }
    var gp = Board.screenToGrid(e.clientX, e.clientY, this.camera.x, this.camera.y, this.zoom);
    var clickX = Math.floor(gp.x);
    var clickY = Math.floor(gp.y);
    var px = this.player.x;
    var py = this.player.y;

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
              UI.showNotification('Téléporté via ' + (ditem.doorLabel || 'portail'));
            } else {
              UI.showNotification('Porte de destination introuvable');
            }
          } else if (this.player.isAdmin) {
            // Admin links two doors together
            var allDoors = Board.furniture.filter(function(f) {
              var fd = Environments.furnitureTypes[f.type];
              return fd && fd.isDoor && f.id && f.id !== ditem.id;
            });
            if (allDoors.length === 0) {
              UI.showNotification('Placez une 2e porte pour créer un passage');
            } else {
              // Auto-link to first unlinked door, or let admin choose
              var unlinked = allDoors.filter(function(d) { return !d.linkedDoorId; });
              var target;
              if (unlinked.length === 1) {
                target = unlinked[0];
              } else if (unlinked.length > 1) {
                // Ask which door to link to
                var names = unlinked.map(function(d, idx) { return (idx+1) + ': ' + d.type + ' (' + d.x + ',' + d.y + ')'; }).join('\n');
                var choice = prompt('Lier à quelle porte ?\n' + names);
                var idx = parseInt(choice) - 1;
                target = (idx >= 0 && idx < unlinked.length) ? unlinked[idx] : unlinked[0];
              } else {
                target = allDoors[0]; // all linked, relink first
              }
              var label = prompt('Nom de ce passage (optionnel):') || 'Passage';
              ditem.linkedDoorId = target.id;
              target.linkedDoorId = ditem.id;
              ditem.doorLabel = label;
              target.doorLabel = label;
              // Persist door links on server
              Network.socket.emit('link-doors', {
                door1Id: ditem.id, door2Id: target.id, label: label
              });
              UI.showNotification('Portes liées : "' + label + '"');
            }
          } else {
            UI.showNotification('Cette porte n\'est pas encore reliée');
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
        if (def.isPostItBoard) {
          UI.openPostItBoard(wbId, item);
        } else {
          UI.openWhiteboard(wbId, item);
        }
        return;
      }
    }

    // Check other furniture clicks
    for (var j = Board.furniture.length - 1; j >= 0; j--) {
      var fitem = Board.furniture[j];
      var fdef = Environments.furnitureTypes[fitem.type];
      if (!fdef || fdef.isWhiteboard || fdef.isPostItBoard) continue;
      if (clickX >= fitem.x && clickX < fitem.x + (fdef.width || 1) && clickY >= fitem.y && clickY < fitem.y + (fdef.height || 1)) {
        // Admin: select furniture for move/delete
        if (this.player.isAdmin && fitem.id) {
          this.selectedFurniture = fitem;
          UI.showNotification('Sélectionné: ' + fdef.name + ' — Clic droit pour options');
          return;
        }
        return;
      }
    }
    // Click on empty space: deselect
    this.selectedFurniture = null;
  },

  setupChat: function() {
    var self = this;
    var input = document.getElementById('chat-input');
    var sendBtn = document.getElementById('chat-send');
    var container = document.getElementById('chat-container');
    var messages = document.getElementById('chat-messages');
    var badge = document.getElementById('chat-badge');
    var unread = 0;

    function sendMessage() {
      if (!input || !input.value.trim()) return;
      var text = input.value.trim();
      Network.socket.emit('chat-message', { text: text });
      // Show bubble above own character
      self.player.chatBubble = { text: text, time: Date.now() };
      input.value = '';
    }

    if (input) {
      input.addEventListener('keydown', function(e) {
        e.stopPropagation(); // Prevent game key handlers
        if (e.code === 'Enter') sendMessage();
      });
    }
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    Network.socket.on('chat-message', function(msg) {
      if (!messages) return;
      var div = document.createElement('div');
      div.className = 'chat-msg';
      div.innerHTML = '<span class="chat-msg-author">' + self.escapeHtml(msg.pseudo || 'Anonyme') + ':</span> ' + self.escapeHtml(msg.text);
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;

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
  sfxLastStep: 0,
  sfxInitialized: false,

  initSfx: function() {
    if (this.sfxInitialized) return;
    try {
      this.sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.sfxInitialized = true;
    } catch(e) {}
  },

  playSfx: function(type) {
    if (!this.sfxCtx) return;
    try {
      var ctx = this.sfxCtx;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'step') {
        osc.type = 'sine';
        osc.frequency.value = 180 + Math.random() * 40;
        gain.gain.value = 0.03;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === 'bump') {
        osc.type = 'triangle';
        osc.frequency.value = 120;
        gain.gain.value = 0.06;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'proximity') {
        osc.type = 'sine';
        osc.frequency.value = 440;
        gain.gain.value = 0.02;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch(e) {}
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
    if (this.editMode) return; // Skip player update in edit mode
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
    if (this.editMode) { this.renderEditMode(ts); return; }
    if (this.viewMode === 'topdown') { this.renderTopDown(ts); return; }

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
          accessory: this.player.accessory || 'none',
          chatBubble: myChatBubble,
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
          accessory: p.accessory || 'none',
          chatBubble: p.chatBubble,
        });
        ctx.restore();
      }
    }

    // Sub-rooms (portals)
    this.drawSubRooms(ctx);

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

  drawProximityCircle: function(ctx, px, py, radius, color, isLocal) {
    var pos = Board.iso(px, py);
    var rx = radius * (Board.tileWidth / 2);
    var ry = radius * (Board.tileHeight / 2);

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(1, ry / rx);

    // Fill gradient
    var g = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
    g.addColorStop(0, color.replace(')', ',0.06)').replace('rgb', 'rgba'));
    g.addColorStop(0.7, color.replace(')', ',0.02)').replace('rgb', 'rgba'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // Border — dashed for remote, solid for local
    if (isLocal) {
      ctx.strokeStyle = color.replace(')', ',0.25)').replace('rgb', 'rgba');
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = color.replace(')', ',0.15)').replace('rgb', 'rgba');
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
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
      ctx.fillStyle = def.isStage ? '#C8A878' : def.isZone ? 'rgba(100,160,200,0.15)' : def.isCollabSpace ? 'rgba(46,204,113,0.15)' : def.isDoor ? 'rgba(155,89,182,0.4)' : def.color;
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

  // ===== TOP-DOWN NAVIGATION VIEW =====

  renderTopDown: function(ts) {
    var ctx = this.ctx;
    var w = this.canvas.width;
    var h = this.canvas.height;
    var gs = Board.gridSize;

    // Calculate cell size to fit the screen nicely
    var cellSize = Math.min((w - 40) / gs, (h - 100) / gs) * this.zoom;
    var gridW = gs * cellSize;
    var gridH = gs * cellSize;

    // Center with camera offset
    var ox = this.camera.x + (w - gridW) / 2;
    var oy = this.camera.y + (h - gridH) / 2;

    // Background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, w, h);

    // Floor tiles
    for (var y = 0; y < gs; y++) {
      for (var x = 0; x < gs; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? Board.floorColor1 : Board.floorColor2;
        ctx.fillRect(ox + x * cellSize, oy + y * cellSize, cellSize, cellSize);
      }
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.5;
    for (var i = 0; i <= gs; i++) {
      ctx.beginPath();
      ctx.moveTo(ox + i * cellSize, oy);
      ctx.lineTo(ox + i * cellSize, oy + gridH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox, oy + i * cellSize);
      ctx.lineTo(ox + gridW, oy + i * cellSize);
      ctx.stroke();
    }

    // Walls
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + gridW, oy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox, oy + gridH);
    ctx.stroke();

    // Furniture
    var furnitureColors = {};
    for (var type in Environments.furnitureTypes) {
      furnitureColors[type] = Environments.furnitureTypes[type].color;
    }

    for (var fi = 0; fi < Board.furniture.length; fi++) {
      var item = Board.furniture[fi];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      var fw = (def.width || 1) * cellSize;
      var fh = (def.height || 1) * cellSize;
      var fx = ox + item.x * cellSize;
      var fy = oy + item.y * cellSize;

      ctx.fillStyle = def.color || '#999';
      ctx.fillRect(fx + 1, fy + 1, fw - 2, fh - 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(fx + 1, fy + 1, fw - 2, fh - 2);

      // Type label
      if (cellSize > 15) {
        ctx.font = Math.max(8, Math.min(11, cellSize * 0.35)) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.name, fx + fw / 2, fy + fh / 2);
      }
    }

    // Tables
    var self = this;
    this.tables.forEach(function(t) {
      var tx = ox + t.x * cellSize;
      var ty = oy + t.y * cellSize;
      var tw = t.width * cellSize;
      var th = t.height * cellSize;
      ctx.strokeStyle = '#e67e22';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(tx, ty, tw, th);
      ctx.setLineDash([]);
      if (t.name && cellSize > 12) {
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.fillStyle = '#e67e22';
        ctx.textAlign = 'center';
        ctx.fillText(t.name, tx + tw / 2, ty + th / 2);
      }
    });

    // Remote players
    Network.remotePlayers.forEach(function(p) {
      if (p.opacity <= 0) return;
      var rpx = ox + p.renderX * cellSize;
      var rpy = oy + p.renderY * cellSize;
      // Proximity circle
      ctx.beginPath();
      ctx.arc(rpx, rpy, CONSTANTS.AUDIO_RADIUS * cellSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(46,204,113,0.05)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(46,204,113,0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Player dot
      ctx.beginPath();
      ctx.arc(rpx, rpy, Math.max(4, cellSize * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = p.colors ? p.colors.shirt : '#2ecc71';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Name
      if (cellSize > 12) {
        ctx.font = '9px "Segoe UI", sans-serif';
        ctx.fillStyle = '#555';
        ctx.textAlign = 'center';
        ctx.fillText(p.pseudo || '', rpx, rpy - Math.max(6, cellSize * 0.4));
      }
    });

    // Local player
    var lpx = ox + this.player.x * cellSize;
    var lpy = oy + this.player.y * cellSize;
    // Proximity circle
    ctx.beginPath();
    ctx.arc(lpx, lpy, this.player.audioRadius * cellSize, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(52,152,219,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(52,152,219,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Player dot
    ctx.beginPath();
    ctx.arc(lpx, lpy, Math.max(5, cellSize * 0.35), 0, Math.PI * 2);
    ctx.fillStyle = this.player.colors ? this.player.colors.shirt : '#3498db';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Direction arrow
    var dx = this.player.direction.dx || 0;
    var dy = this.player.direction.dy || 0;
    if (dx !== 0 || dy !== 0) {
      var len = Math.sqrt(dx * dx + dy * dy);
      ctx.beginPath();
      ctx.moveTo(lpx, lpy);
      ctx.lineTo(lpx + (dx / len) * cellSize * 0.6, lpy + (dy / len) * cellSize * 0.6);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Name
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.fillStyle = '#3498db';
    ctx.textAlign = 'center';
    ctx.fillText(this.player.pseudo || 'Vous', lpx, lpy - Math.max(8, cellSize * 0.45));

    // HUD info
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = '#999';
    ctx.textAlign = 'left';
    ctx.fillText('Vue de dessus — V pour basculer', 16, h - 70);

    // Minimap not needed in topdown
  },

  // ===== EDIT MODE =====

  toggleEditMode: function() {
    if (!this.player.isAdmin) return;
    this.editMode = !this.editMode;
    if (this.editMode) {
      // Center camera on grid
      var cellSize = this.getEditCellSize();
      this.editZoom = 1;
      this.editCamera.x = this.canvas.width / 2 - (Board.gridSize * cellSize) / 2;
      this.editCamera.y = this.canvas.height / 2 - (Board.gridSize * cellSize) / 2;
      this.editTool = 'place';
      this.editSelectedType = null;
      this.editDragging = null;
      this.editHovered = null;
      UI.showEditToolbar(true);
      UI.showNotification('Mode edition active - Vue du dessus');
    } else {
      Board.buildCollisionMap();
      UI.showEditToolbar(false);
      UI.showNotification('Mode edition desactive');
    }
  },

  getEditCellSize: function() {
    var maxDim = Math.min(this.canvas.width, this.canvas.height) * 0.85;
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
      this.editDragging = null;
      Board.buildCollisionMap();
      // Sync position to server (preserves all item properties including door links)
      if (item.id) {
        Network.socket.emit('move-furniture', { furnitureId: item.id, x: item.x, y: item.y });
      }
      return;
    }
  },

  onEditClick: function(e) {
    if (this.editIsPanning) return;
    var gp = this.editScreenToGrid(e.clientX, e.clientY);

    if (this.editTool === 'place' && this.editSelectedType) {
      var def = Environments.furnitureTypes[this.editSelectedType];
      if (!def) return;
      if (gp.x < 0 || gp.y < 0 || gp.x + (def.width || 1) > Board.gridSize || gp.y + (def.height || 1) > Board.gridSize) return;

      var self = this;
      Network.socket.emit('add-furniture', { type: this.editSelectedType, x: gp.x, y: gp.y }, function(r) {
        if (r && r.success) {
          Board.furniture.push(r.item);
          Board.buildCollisionMap();
          UI.showNotification(def.name + ' place');
        }
      });
      return;
    }

    if (this.editTool === 'delete') {
      var item = this.editFurnitureAt(gp.x, gp.y);
      if (item && item.id) {
        Network.socket.emit('remove-furniture', { furnitureId: item.id }, function(r) {
          if (r && r.success) {
            Board.furniture = Board.furniture.filter(function(f) { return f.id !== item.id; });
            Board.buildCollisionMap();
            UI.showNotification('Mobilier supprime');
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
    var w = this.canvas.width;
    var h = this.canvas.height;
    var gs = Board.gridSize;
    var cellSize = this.getEditCellSize() * this.editZoom;

    // White background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.editCamera.x, this.editCamera.y);

    // Draw floor tiles
    for (var y = 0; y < gs; y++) {
      for (var x = 0; x < gs; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#e8ecf0' : '#dee2e6';
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
      var fw = (def.width || 1) * cellSize;
      var fh = (def.height || 1) * cellSize;
      var fx = item.x * cellSize;
      var fy = item.y * cellSize;

      // Fill
      ctx.fillStyle = def.color || '#ccc';
      ctx.fillRect(fx + 1, fy + 1, fw - 2, fh - 2);

      // Border
      var isHovered = (this.editHovered === item);
      if (isHovered && this.editTool === 'delete') {
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 3;
      } else if (isHovered && this.editTool === 'move') {
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = this.darkenColor(def.color || '#ccc', 0.3);
        ctx.lineWidth = 1.5;
      }
      ctx.strokeRect(fx + 1, fy + 1, fw - 2, fh - 2);

      // Type name centered
      var fontSize = Math.max(7, Math.min(12, cellSize * 0.35));
      ctx.font = 'bold ' + fontSize + 'px "Segoe UI", sans-serif';
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var label = def.name;
      if (label.length > 12 && cellSize < 25) label = label.substring(0, 10) + '..';
      ctx.fillText(label, fx + fw / 2, fy + fh / 2);
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
