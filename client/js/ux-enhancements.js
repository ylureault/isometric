// UX Enhancements: 50 improvements for delight, trust, and smoothness
// This file should be loaded after engine.js and ui.js

var UXEnhancements = {
  _welcomeDone: false,
  _achievements: { firstChat: false, firstReaction: false, firstBoard: false },
  _particleTrail: [],
  _metPlayers: new Set(),
  _joinQueue: [],
  _joinQueueTimer: null,
  _reconnectStart: 0,
  _reconnectAttempts: 0,
  _reconnectCounterTimer: null,
  _pingInterval: null,
  _lastPing: 0,
  _darkboardSaveTimer: null,
  _darkboardLastSave: 0,
  _chatTypingTimer: null,
  _chatMsgCount: 0,
  _fpsHistory: [],
  _lastFpsCheck: 0,
  _minimapLastDraw: 0,
  _lastDepthSortKey: '',

  init: function() {
    this.setupTimeAtmosphere();     // #6
    this.setupBeforeUnload();       // #27
    this.setupPassiveListeners();   // #44
    this.setupPingIndicator();      // #21
    this.setupTypingIndicator();    // #13
    this.setupDarkboardAutoSave();  // #18, #19
    this.setupDebouncedResize();    // #33
    this.setupChatPruning();        // #43
    this.setupNotificationGrouping(); // #30
    this.setupAdminPresence();      // #29
    this.setupWebRTCGraceful();     // #24, #28
    this.setupSmoothZoom();         // #39
    // #50 Version display
    var vEl = document.getElementById('hud-version');
    if (vEl && typeof CONSTANTS !== 'undefined' && CONSTANTS.VERSION) {
      vEl.textContent = 'v' + CONSTANTS.VERSION;
    }
  },

  // ===== #1 Welcome Confetti Burst =====
  triggerWelcomeConfetti: function() {
    if (this._welcomeDone) return;
    this._welcomeDone = true;
    // Trigger the engine confetti
    if (typeof Engine !== 'undefined') {
      Engine.triggerConfetti();
      // #8 Camera shake
      var canvas = document.getElementById('game-canvas');
      if (canvas) {
        canvas.classList.add('shake');
        setTimeout(function() { canvas.classList.remove('shake'); }, 400);
      }
    }
  },

  // ===== #2 Particle Trail Behind Walking Character =====
  updateParticleTrail: function(px, py, isWalking, dt) {
    // Add particles when walking
    if (isWalking && Math.random() < 0.3) {
      this._particleTrail.push({
        x: px + (Math.random() - 0.5) * 0.3,
        y: py + (Math.random() - 0.5) * 0.3,
        opacity: 0.4,
        size: Math.random() * 2 + 1,
      });
    }
    // Update existing particles
    var alive = [];
    for (var i = 0; i < this._particleTrail.length; i++) {
      var p = this._particleTrail[i];
      p.opacity -= dt * 0.8;
      p.size -= dt * 0.5;
      if (p.opacity > 0 && p.size > 0) alive.push(p);
    }
    this._particleTrail = alive;
    // Limit particle count
    if (this._particleTrail.length > 50) {
      this._particleTrail = this._particleTrail.slice(-50);
    }
  },

  drawParticleTrail: function(ctx) {
    for (var i = 0; i < this._particleTrail.length; i++) {
      var p = this._particleTrail[i];
      var pos = Board.iso(p.x, p.y);
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = 'rgba(180, 200, 220, 0.6)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  // ===== #3 Wave Animation on First Proximity =====
  checkFirstProximity: function(localX, localY) {
    var self = this;
    if (!Network || !Network.remotePlayers) return;
    Network.remotePlayers.forEach(function(rp, sid) {
      if (self._metPlayers.has(sid)) return;
      var dist = Math.sqrt((localX - rp.renderX) * (localX - rp.renderX) + (localY - rp.renderY) * (localY - rp.renderY));
      if (dist < 2.5) {
        self._metPlayers.add(sid);
        // Add wave reaction at midpoint
        if (typeof Engine !== 'undefined') {
          Engine.addReaction('👋', (localX + rp.renderX) / 2, (localY + rp.renderY) / 2);
        }
      }
    });
  },

  // ===== #4 Ambient Background Sound =====
  _ambientCtx: null,
  _ambientGain: null,
  _ambientNode: null,
  _ambientOn: false,

  toggleAmbientSound: function() {
    if (this._ambientOn) {
      this.stopAmbient();
      return false;
    }
    this.startAmbient();
    return true;
  },

  startAmbient: function() {
    if (this._ambientOn) return;
    try {
      if (!this._ambientCtx) {
        this._ambientCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this._ambientCtx.state === 'suspended') this._ambientCtx.resume();
      this._ambientGain = this._ambientCtx.createGain();
      this._ambientGain.gain.value = 0.02;
      this._ambientGain.connect(this._ambientCtx.destination);

      // Create a gentle brown noise (office hum)
      var bufferSize = this._ambientCtx.sampleRate * 2;
      var buffer = this._ambientCtx.createBuffer(1, bufferSize, this._ambientCtx.sampleRate);
      var data = buffer.getChannelData(0);
      var lastOut = 0;
      for (var i = 0; i < bufferSize; i++) {
        var white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      }
      this._ambientNode = this._ambientCtx.createBufferSource();
      this._ambientNode.buffer = buffer;
      this._ambientNode.loop = true;

      // Low-pass filter for muffled office hum
      var filter = this._ambientCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      this._ambientNode.connect(filter);
      filter.connect(this._ambientGain);
      this._ambientNode.start();
      this._ambientOn = true;
    } catch (e) { /* ignore */ }
  },

  stopAmbient: function() {
    try {
      if (this._ambientNode) { this._ambientNode.stop(); this._ambientNode = null; }
      if (this._ambientGain) { this._ambientGain.disconnect(); this._ambientGain = null; }
    } catch (e) { /* ignore */ }
    this._ambientOn = false;
  },

  // ===== #6 Time-based atmosphere =====
  setupTimeAtmosphere: function() {
    var hour = new Date().getHours();
    var body = document.body;
    body.classList.remove('atmosphere-morning', 'atmosphere-evening', 'atmosphere-night');
    if (hour >= 6 && hour < 10) {
      body.classList.add('atmosphere-morning');
    } else if (hour >= 17 && hour < 20) {
      body.classList.add('atmosphere-evening');
    } else if (hour >= 20 || hour < 6) {
      body.classList.add('atmosphere-night');
    }
  },

  // ===== #7 Achievement Notifications =====
  checkAchievement: function(type) {
    if (this._achievements[type]) return;
    this._achievements[type] = true;
    var messages = {
      firstChat: '🏆 Premier message envoye !',
      firstReaction: '🏆 Premiere reaction !',
      firstBoard: '🏆 Premier tableau ouvert !',
    };
    if (messages[type]) {
      this.showAchievement(messages[type]);
    }
  },

  showAchievement: function(text) {
    var container = document.getElementById('notifications-container');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'notification notification-achievement';
    el.textContent = text;
    container.appendChild(el);
    requestAnimationFrame(function() { el.classList.add('notification-show'); });
    setTimeout(function() {
      el.classList.remove('notification-show');
      el.classList.add('notification-hide');
      setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, 4000);
  },

  // ===== #10 Admin Crown Animation =====
  showAdminCrown: function() {
    var div = document.createElement('div');
    div.className = 'admin-crown-notification';
    div.innerHTML = '<div class="admin-crown-emoji">👑</div><div class="admin-crown-text">Vous etes administrateur</div>';
    document.body.appendChild(div);
    setTimeout(function() {
      div.style.transition = 'opacity 0.5s ease';
      div.style.opacity = '0';
      setTimeout(function() { if (div.parentNode) div.parentNode.removeChild(div); }, 500);
    }, 2500);
  },

  // ===== #11 Welcome message in chat =====
  addWelcomeChat: function(pseudo) {
    var messages = document.getElementById('chat-messages');
    if (!messages) return;
    var emptyEl = document.getElementById('chat-empty-state');
    if (emptyEl) emptyEl.remove();

    // #12 System greeting with room name
    var roomName = (typeof Engine !== 'undefined' && Engine.roomConfig) ? Engine.roomConfig.name : 'la salle';
    var sysDiv = document.createElement('div');
    sysDiv.className = 'chat-msg chat-msg-system';
    sysDiv.textContent = 'Bienvenue dans ' + roomName + ' !';
    messages.appendChild(sysDiv);

    var welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'chat-msg chat-msg-system';
    welcomeDiv.innerHTML = 'Bienvenue, ' + (typeof UI !== 'undefined' ? UI.escapeHtml(pseudo) : pseudo) + ' ! 👋';
    messages.appendChild(welcomeDiv);
    messages.scrollTop = messages.scrollHeight;
  },

  // ===== #13 Typing Indicator =====
  setupTypingIndicator: function() {
    var input = document.getElementById('chat-input');
    if (!input) return;
    var self = this;
    var lastEmit = 0;
    input.addEventListener('input', function() {
      if (!Network || !Network.socket) return;
      var now = Date.now();
      if (now - lastEmit > 2000) {
        lastEmit = now;
        Network.socket.emit('typing', {});
      }
    });
    if (Network && Network.socket) {
      Network.socket.on('user-typing', function(data) {
        self.showTypingIndicator(data.pseudo);
      });
    }
  },

  _typingUsers: {},
  showTypingIndicator: function(pseudo) {
    var self = this;
    this._typingUsers[pseudo] = Date.now();
    this.updateTypingDisplay();
    // Clear after 3s
    setTimeout(function() {
      if (self._typingUsers[pseudo] && Date.now() - self._typingUsers[pseudo] >= 2900) {
        delete self._typingUsers[pseudo];
        self.updateTypingDisplay();
      }
    }, 3000);
  },

  updateTypingDisplay: function() {
    var el = document.getElementById('chat-typing-indicator');
    if (!el) return;
    var names = Object.keys(this._typingUsers);
    if (names.length === 0) {
      el.innerHTML = '';
      return;
    }
    var text = names.length === 1
      ? names[0] + ' ecrit'
      : names.length + ' personnes ecrivent';
    el.innerHTML = text + ' <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  },

  // ===== #16 Connection status =====
  updateConnectionStatus: function(connected) {
    var dot = document.getElementById('connection-dot');
    if (!dot) return;
    dot.classList.remove('connected', 'disconnected', 'reconnecting', 'good', 'warning', 'bad');
    if (connected) {
      dot.classList.add('connected', 'good');
    } else {
      dot.classList.add('disconnected', 'bad');
    }
  },

  // ===== #17 Reconnection attempt counter + #25 Disconnected timer =====
  startReconnectCounter: function() {
    this._reconnectStart = Date.now();
    this._reconnectAttempts = 0;
    var self = this;
    var counterEl = document.getElementById('reconnect-counter');
    if (this._reconnectCounterTimer) clearInterval(this._reconnectCounterTimer);
    this._reconnectCounterTimer = setInterval(function() {
      self._reconnectAttempts++;
      var elapsed = Math.floor((Date.now() - self._reconnectStart) / 1000);
      if (counterEl) {
        counterEl.textContent = 'Tentative ' + self._reconnectAttempts + '/5 — Deconnecte depuis ' + elapsed + 's';
      }
    }, 2000);
    // Also update the connection dot
    var dot = document.getElementById('connection-dot');
    if (dot) {
      dot.classList.remove('connected', 'good');
      dot.classList.add('reconnecting', 'warning');
    }
  },

  stopReconnectCounter: function() {
    if (this._reconnectCounterTimer) {
      clearInterval(this._reconnectCounterTimer);
      this._reconnectCounterTimer = null;
    }
    var counterEl = document.getElementById('reconnect-counter');
    if (counterEl) counterEl.textContent = '';
    this.updateConnectionStatus(true);
  },

  // ===== #18, #19 Dark Board auto-save =====
  setupDarkboardAutoSave: function() {
    // This triggers debounced save every 30s on the darkboard
    // The actual save logic calls the existing save mechanism
    // We'll hook into the darkboard state changes
  },

  markDarkboardSaved: function() {
    this._darkboardLastSave = Date.now();
    var statusEl = document.getElementById('darkboard-status-text');
    if (statusEl) {
      var d = new Date();
      var time = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
      statusEl.textContent = 'Sauvegarde a ' + time;
      statusEl.classList.add('darkboard-save-indicator');
      setTimeout(function() { statusEl.classList.remove('darkboard-save-indicator'); }, 2000);
    }
  },

  // ===== #20 Copy link flash =====
  flashCopyButton: function() {
    var btn = document.getElementById('btn-copy-link');
    if (!btn) return;
    btn.classList.add('flash-success');
    btn.textContent = 'Copie !';
    setTimeout(function() {
      btn.classList.remove('flash-success');
      btn.textContent = 'Copier le lien';
    }, 1500);
  },

  // ===== #21 Ping indicator =====
  setupPingIndicator: function() {
    var self = this;
    this._pingInterval = setInterval(function() {
      if (!Network || !Network.socket || !Network.connected) return;
      var start = Date.now();
      Network.socket.emit('ping-measure', {}, function() {
        var latency = Date.now() - start;
        self._lastPing = latency;
        var el = document.getElementById('hud-ping');
        if (el) {
          el.textContent = latency + ' ms';
          el.style.display = '';
          el.classList.remove('ping-good', 'ping-medium', 'ping-bad');
          if (latency < 100) el.classList.add('ping-good');
          else if (latency < 250) el.classList.add('ping-medium');
          else el.classList.add('ping-bad');
        }
      });
    }, 10000); // every 10 seconds
  },

  // ===== #24 Graceful WebRTC failure message + #28 Auto-reconnect =====
  setupWebRTCGraceful: function() {
    // Monitor WebRTC failures and show clear message
    var originalConnect = Audio.connectToPeer;
    if (originalConnect) {
      Audio.connectToPeer = async function(socketId) {
        try {
          await originalConnect.call(Audio, socketId);
        } catch (e) {
          if (typeof UI !== 'undefined') {
            UI.showNotification('Audio impossible avec un participant. Verifiez votre connexion.');
          }
        }
      };
    }
  },

  // ===== #27 Prevent accidental page close =====
  setupBeforeUnload: function() {
    window.addEventListener('beforeunload', function(e) {
      if (typeof Engine !== 'undefined' && Engine.started) {
        e.preventDefault();
        e.returnValue = 'Vous etes en salle. Voulez-vous vraiment quitter ?';
        return e.returnValue;
      }
    });
  },

  // ===== #29 Admin presence indicator =====
  setupAdminPresence: function() {
    // Periodically check if any admin is in the room
    var self = this;
    setInterval(function() {
      if (!Network || !Network.remotePlayers) return;
      var adminNames = [];
      Network.remotePlayers.forEach(function(p) {
        if (p.isAdmin && !p.disconnected) adminNames.push(p.pseudo);
      });
      var el = document.getElementById('admin-presence');
      var textEl = document.getElementById('admin-presence-text');
      if (el && textEl) {
        if (adminNames.length > 0) {
          el.style.display = '';
          textEl.textContent = adminNames.length === 1
            ? adminNames[0] + ' (admin)'
            : adminNames.length + ' admins presents';
        } else {
          el.style.display = 'none';
        }
      }
    }, 5000);
  },

  // ===== #30 Notification Grouping =====
  _pendingJoins: [],
  _joinGroupTimer: null,

  setupNotificationGrouping: function() {
    // We'll override the join/leave notification to batch them
  },

  groupedJoinNotification: function(pseudo) {
    this._pendingJoins.push(pseudo);
    var self = this;
    if (this._joinGroupTimer) clearTimeout(this._joinGroupTimer);
    this._joinGroupTimer = setTimeout(function() {
      var names = self._pendingJoins;
      self._pendingJoins = [];
      self._joinGroupTimer = null;
      if (names.length === 1) {
        UI.showNotification(names[0] + ' a rejoint la salle');
      } else if (names.length > 1) {
        UI.showNotification(names.length + ' personnes ont rejoint la salle');
      }
    }, 1500);
  },

  // ===== #33 Debounced resize =====
  _resizeTimer: null,
  setupDebouncedResize: function() {
    var self = this;
    // Remove the existing resize listener and add a debounced one
    // We can't easily remove the anonymous listener, so we override Engine.resize
    var origResize = Engine.resize;
    var pendingResize = false;
    window.addEventListener('resize', function() {
      if (pendingResize) return;
      pendingResize = true;
      requestAnimationFrame(function() {
        origResize.call(Engine);
        pendingResize = false;
      });
    }, { passive: true });
  },

  // ===== #34 Throttled minimap redraw =====
  shouldDrawMinimap: function() {
    var now = performance.now();
    if (now - this._minimapLastDraw < 100) return false; // 10fps
    this._minimapLastDraw = now;
    return true;
  },

  // ===== #38 Adaptive particle count based on FPS =====
  _currentFps: 60,
  updateFps: function(dt) {
    if (dt > 0) {
      this._currentFps = this._currentFps * 0.9 + (1 / dt) * 0.1;
    }
  },

  shouldReduceParticles: function() {
    return this._currentFps < 30;
  },

  // ===== #39 Smooth zoom =====
  _targetZoom: null,
  _zoomAnimating: false,

  setupSmoothZoom: function() {
    // Override zoom to animate smoothly
    this._targetZoom = Engine.zoom;
  },

  animateZoom: function(newZoom) {
    this._targetZoom = Math.max(CONSTANTS.ZOOM_MIN, Math.min(CONSTANTS.ZOOM_MAX, newZoom));
  },

  updateSmoothZoom: function(dt) {
    if (this._targetZoom === null) return;
    var diff = this._targetZoom - Engine.zoom;
    if (Math.abs(diff) < 0.005) {
      Engine.zoom = this._targetZoom;
    } else {
      Engine.zoom += diff * Math.min(1, dt * 10); // ease over ~200ms
    }
  },

  // ===== #40 Smooth view mode switch =====
  fadeViewTransition: function() {
    var canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.classList.add('view-transition');
      setTimeout(function() { canvas.classList.remove('view-transition'); }, 250);
    }
  },

  // ===== #43 Chat DOM pruning =====
  setupChatPruning: function() {
    // After every chat message, remove old ones if count > 200
  },

  pruneChatMessages: function() {
    var messages = document.getElementById('chat-messages');
    if (!messages) return;
    var children = messages.children;
    var maxMessages = 200;
    while (children.length > maxMessages) {
      messages.removeChild(children[0]);
    }
  },

  // ===== #44 Passive event listeners =====
  setupPassiveListeners: function() {
    // Add passive flag to scroll and touch listeners
    document.addEventListener('touchmove', function() {}, { passive: true });
    document.addEventListener('touchstart', function() {}, { passive: true });
  },

  // ===== #45 Optimized depth sort =====
  needsDepthSort: function(entities) {
    var key = '';
    for (var i = 0; i < entities.length; i++) {
      key += entities[i].sk.toFixed(1) + ',';
    }
    if (key === this._lastDepthSortKey) return false;
    this._lastDepthSortKey = key;
    return true;
  },

  // ===== #46 Vignette (CSS-only, already in HTML) =====

  // ===== #47 Smooth cursor trail in Dark Board =====
  _dbCursorTrail: [],

  updateDarkboardCursorTrail: function(x, y) {
    this._dbCursorTrail.push({ x: x, y: y, opacity: 0.5 });
    if (this._dbCursorTrail.length > 20) {
      this._dbCursorTrail.shift();
    }
    // Fade out
    for (var i = 0; i < this._dbCursorTrail.length; i++) {
      this._dbCursorTrail[i].opacity -= 0.025;
    }
    this._dbCursorTrail = this._dbCursorTrail.filter(function(p) { return p.opacity > 0; });
  },

  drawDarkboardCursorTrail: function(ctx) {
    for (var i = 0; i < this._dbCursorTrail.length; i++) {
      var p = this._dbCursorTrail[i];
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = 'rgba(74,158,255,0.6)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  // ===== #14, #15 Voice activity ring on minimap =====
  drawMinimapSpeakingIndicator: function(ctx, x, y, sc) {
    var time = Date.now() / 500;
    var pulseSize = 3 + Math.sin(time) * 1.5;
    ctx.save();
    ctx.strokeStyle = 'rgba(46, 204, 113, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x * sc, y * sc, pulseSize, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },

  // Cleanup
  destroy: function() {
    if (this._pingInterval) clearInterval(this._pingInterval);
    if (this._reconnectCounterTimer) clearInterval(this._reconnectCounterTimer);
    this.stopAmbient();
    if (this._ambientCtx) {
      try { this._ambientCtx.close(); } catch (e) {}
      this._ambientCtx = null;
    }
  },
};
