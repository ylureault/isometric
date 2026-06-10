// UI: Complete HUD, admin panel, context menu, notifications, toolbar, reactions, shortcuts

const UI = {
  escapeHtml: function(str) { var d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; },
  avatarConfig: null,
  previewCanvas: null,
  previewCtx: null,
  previewAnimId: null,
  currentColors: { ...CONSTANTS.DEFAULT_COLORS },
  adminPanelOpen: false,
  contextMenuOpen: false,
  shortcutsModalOpen: false,
  activeWhiteboardId: null,

  // ===== AVATAR CONFIG =====

  initAvatarConfig(onEnter) {
    this.avatarConfig = document.getElementById('avatar-config');
    this.previewCanvas = document.getElementById('avatar-preview-canvas');
    this.previewCtx = this.previewCanvas.getContext('2d');

    const colorInputs = {
      skin: document.getElementById('color-skin'),
      hair: document.getElementById('color-hair'),
      shirt: document.getElementById('color-shirt'),
      pants: document.getElementById('color-pants'),
      shoes: document.getElementById('color-shoes'),
    };

    for (const [key, input] of Object.entries(colorInputs)) {
      input.value = this.currentColors[key];
      // #4 Animate color pickers with smooth transition + #49 hover preview swatch
      input.addEventListener('input', () => {
        this.currentColors[key] = input.value;
        input.style.borderColor = input.value;
        input.style.boxShadow = '0 0 8px ' + input.value + '44';
      });
      // #49 Add color swatch preview on hover
      var swatch = document.createElement('div');
      swatch.className = 'color-swatch-preview';
      swatch.style.background = input.value;
      input.parentElement.style.position = 'relative';
      input.parentElement.appendChild(swatch);
      input.addEventListener('input', (function(sw) { return function() { sw.style.background = input.value; }; })(swatch));
    }

    let animTime = 0;
    const accessorySelectEl = document.getElementById('accessory-select');
    const animatePreview = () => {
      animTime += 0.016;
      Character.drawPreview(this.previewCtx, this.previewCanvas.width, this.previewCanvas.height, this.currentColors, animTime,
        accessorySelectEl ? accessorySelectEl.value : 'none');
      this.previewAnimId = requestAnimationFrame(animatePreview);
    };
    animatePreview();

    // #1 Auto-focus pseudo input
    var pseudoInput = document.getElementById('pseudo-input');
    setTimeout(function() { pseudoInput.focus(); }, 300);

    // #8 Auto-select all text on focus
    pseudoInput.addEventListener('focus', function() { pseudoInput.select(); });

    // #2 Character count remaining + #10 Real-time validation
    var charCount = document.getElementById('pseudo-char-count');
    var validIndicator = document.getElementById('pseudo-valid-indicator');
    var enterBtn = document.getElementById('btn-enter');

    pseudoInput.addEventListener('input', function() {
      var len = pseudoInput.value.length;
      var max = 20;
      if (charCount) {
        charCount.textContent = len + '/' + max;
        charCount.classList.toggle('near-limit', len >= 15 && len < 20);
        charCount.classList.toggle('at-limit', len >= 20);
      }
      // #10 Green check when valid (2+ chars)
      var isValid = pseudoInput.value.trim().length >= 2;
      if (validIndicator) {
        validIndicator.classList.toggle('visible', isValid);
        validIndicator.style.color = isValid ? '#2ecc71' : 'transparent';
      }
      // #7 Pulse animation on enter button when valid
      enterBtn.classList.toggle('btn-enter-valid', isValid);
    });

    enterBtn.addEventListener('click', () => {
      const pseudo = pseudoInput.value.trim();
      const errorEl = document.getElementById('error-pseudo');
      if (!pseudo) {
        errorEl.style.display = 'block';
        pseudoInput.focus();
        // #37 Error shake
        pseudoInput.classList.add('shake-error');
        setTimeout(() => pseudoInput.classList.remove('shake-error'), 400);
        return;
      }
      errorEl.style.display = 'none';

      // Show loading state on button
      enterBtn.classList.add('btn-loading');
      enterBtn.classList.remove('btn-enter-valid');
      enterBtn.disabled = true;

      // #41 Show loading indicator
      var loadingBar = document.getElementById('room-loading-indicator');
      if (loadingBar) loadingBar.style.display = 'block';

      if (this.previewAnimId) cancelAnimationFrame(this.previewAnimId);
      this.avatarConfig.style.display = 'none';
      document.getElementById('hud').style.display = 'flex';
      document.getElementById('minimap-container').style.display = 'block';
      document.getElementById('toolbar').style.display = 'flex';

      var accessorySelect = document.getElementById('accessory-select');
      var accessory = accessorySelect ? accessorySelect.value : 'none';
      onEnter({ pseudo, colors: { ...this.currentColors }, accessory: accessory });

      // #17 Show keyboard hint overlay on first join
      this.showKeyboardHintOnce();
    });

    // Allow Enter key to submit pseudo
    pseudoInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') enterBtn.click();
    });
  },

  // #17 Keyboard shortcut hint overlay (shown once)
  showKeyboardHintOnce() {
    try {
      if (localStorage.getItem('insuffle_hint_shown')) return;
    } catch(e) {}
    var hint = document.getElementById('keyboard-hint-overlay');
    if (!hint) return;
    hint.style.display = 'block';
    var dismiss = document.getElementById('keyboard-hint-dismiss');
    if (dismiss) {
      dismiss.addEventListener('click', function() {
        hint.style.display = 'none';
        try { localStorage.setItem('insuffle_hint_shown', '1'); } catch(e) {}
      });
    }
    // Auto-dismiss after 15 seconds
    setTimeout(function() { if (hint) hint.style.display = 'none'; }, 15000);
  },

  showRoomInfo(info) {
    const el = document.getElementById('room-info-display');
    if (el) {
      // #5 Show participant count with badge
      el.innerHTML = `${this.escapeHtml(info.name)} \u2014 <span class="room-participant-badge">${info.participantCount}/${info.maxParticipants} participants</span>`;
      el.style.display = 'block';
    }
  },

  showError(message) {
    const overlay = document.getElementById('avatar-config');
    if (overlay) {
      overlay.innerHTML = `
        <div class="avatar-config-panel" style="flex-direction: column; align-items: center; text-align: center;">
          <h2 style="color: #e74c3c;">Erreur</h2>
          <p style="color: #aaa; margin: 16px 0;">${this.escapeHtml(message)}</p>
          <a href="/client/index.html" class="btn btn-secondary" style="text-decoration: none;">Retour à l'accueil</a>
        </div>`;
    }
  },

  // Build the share/invite experience: prominent button + popover with
  // copy / WhatsApp / e-mail / native share / QR code.
  shareUrl: '',

  showCopyLink(roomId) {
    const container = document.getElementById('copy-link-container');
    if (!container) return;
    container.style.display = 'flex';
    this.shareUrl = `${window.location.origin}/client/room.html?room=${roomId}`;
    this.initShare();
  },

  initShare() {
    if (this._shareWired) { this._refreshShareLinks(); return; }
    this._shareWired = true;

    const url = this.shareUrl;
    const btn = document.getElementById('btn-share');
    const popover = document.getElementById('share-popover');
    const closeBtn = document.getElementById('share-close');
    const input = document.getElementById('share-link-input');
    const copyBtn = document.getElementById('share-copy-btn');
    const nativeBtn = document.getElementById('share-native');
    if (input) input.value = url;
    this._refreshShareLinks();

    const open = () => {
      popover.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      // Render QR lazily (only when first opened)
      if (!this._qrRendered && typeof QRCode !== 'undefined') {
        const ok = QRCode.renderToElement(document.getElementById('share-qr-canvas'), this.shareUrl, { ecc: 'MEDIUM' });
        this._qrRendered = ok;
        if (!ok) { const q = document.getElementById('share-qr'); if (q) q.style.display = 'none'; }
      }
      setTimeout(() => { if (input) { input.focus(); input.select(); } }, 30);
    };
    const close = () => { popover.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    const toggle = () => (popover.hidden ? open() : close());

    if (btn) btn.addEventListener('click', toggle);
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Close on outside click / Escape
    document.addEventListener('click', (e) => {
      if (popover.hidden) return;
      if (!popover.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !popover.hidden) close(); });

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        this.copyShareUrl(copyBtn);
      });
    }

    // Native share sheet (mobile / supported browsers)
    if (nativeBtn && navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener('click', () => {
        navigator.share({
          title: 'Rejoignez ma salle',
          text: 'Rejoignez-moi dans cet espace collaboratif :',
          url: this.shareUrl,
        }).catch(() => {});
      });
    }
  },

  _refreshShareLinks() {
    const url = this.shareUrl;
    const msg = 'Rejoignez-moi dans cet espace collaboratif : ' + url;
    const wa = document.getElementById('share-whatsapp');
    const em = document.getElementById('share-email');
    if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent(msg);
    if (em) em.href = 'mailto:?subject=' + encodeURIComponent('Invitation — espace collaboratif') +
      '&body=' + encodeURIComponent(msg);
    const input = document.getElementById('share-link-input');
    if (input) input.value = url;
  },

  copyShareUrl(copyBtn) {
    const done = () => {
      if (!copyBtn) return;
      const orig = copyBtn.textContent;
      copyBtn.textContent = 'Copié !';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = orig; copyBtn.classList.remove('copied'); }, 2000);
    };
    const fallback = () => {
      const input = document.getElementById('share-link-input');
      if (input) { input.focus(); input.select(); try { document.execCommand('copy'); done(); } catch (e) {} }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(this.shareUrl).then(done).catch(fallback);
    } else {
      fallback();
    }
  },

  // ===== HUD =====

  _lastZoomShow: 0,
  _prevZoom: 1,

  updateHUD(roomName, playerX, playerY, participantCount, zoom) {
    const el1 = document.getElementById('hud-room-name');
    const el2 = document.getElementById('hud-coords');
    const el3 = document.getElementById('hud-participants-text');
    // #11 Show coordinates as "Zone X, Y" + #15 breadcrumb
    if (el1) el1.textContent = roomName || 'Salle';
    // #15 Determine area name based on position
    var areaName = '';
    var gridSize = Engine.roomConfig ? Engine.roomConfig.gridSize : 20;
    var relX = Math.floor(playerX) / gridSize, relY = Math.floor(playerY) / gridSize;
    if (relX < 0.3 && relY < 0.3) areaName = 'Coin nord-ouest';
    else if (relX > 0.7 && relY < 0.3) areaName = 'Coin nord-est';
    else if (relX < 0.3 && relY > 0.7) areaName = 'Coin sud-ouest';
    else if (relX > 0.7 && relY > 0.7) areaName = 'Coin sud-est';
    else if (relY < 0.25) areaName = 'Zone nord';
    else if (relY > 0.75) areaName = 'Zone sud';
    else if (relX < 0.25) areaName = 'Zone ouest';
    else if (relX > 0.75) areaName = 'Zone est';
    else areaName = 'Centre';
    if (el2) el2.textContent = `${areaName} (${Math.floor(playerX)}, ${Math.floor(playerY)})  \u00b7  x${(zoom || 1).toFixed(1)}`;
    // #31 Smooth number counting for participant count
    if (el3) {
      var prevCount = this._lastParticipantCount || 0;
      if (prevCount !== participantCount) {
        this._lastParticipantCount = participantCount;
        el3.style.transition = 'transform 0.2s ease';
        el3.style.transform = 'scale(1.05)';
        setTimeout(function() { el3.style.transform = 'scale(1)'; }, 200);
      }
      el3.textContent = `${participantCount} participant${participantCount > 1 ? 's' : ''}`;
    }

    // #14 Minimap badge with player count
    var minimapBadge = document.getElementById('minimap-badge');
    if (minimapBadge) minimapBadge.textContent = participantCount;

    // #19 Zoom level indicator (show briefly on zoom change)
    var zoomIndicator = document.getElementById('zoom-indicator');
    if (zoomIndicator) {
      zoomIndicator.textContent = 'x' + (zoom || 1).toFixed(1);
      if (Math.abs((zoom || 1) - this._prevZoom) > 0.01) {
        zoomIndicator.classList.add('visible');
        this._lastZoomShow = Date.now();
        var self = this;
        setTimeout(function() {
          if (Date.now() - self._lastZoomShow >= 1400) zoomIndicator.classList.remove('visible');
        }, 1500);
      }
      this._prevZoom = zoom || 1;
    }

    // #43 Admin badge
    var adminBadge = document.getElementById('hud-admin-badge');
    if (adminBadge) adminBadge.style.display = Engine.player.isAdmin ? 'block' : 'none';
  },

  // ===== TOOLBAR =====

  initToolbar() {
    // Click sound for all toolbar buttons
    document.querySelectorAll('.toolbar-btn, .reaction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Engine.initSfx();
        Engine.playSfx('click');
      });
    });

    // Mute button
    document.getElementById('btn-mute')?.addEventListener('click', () => {
      const muted = Audio.toggleMute();
      this.updateMuteButton(muted);
    });

    // Voice volume slider
    document.getElementById('volume-slider')?.addEventListener('input', (e) => {
      Audio.setMasterVolume(parseFloat(e.target.value) / 100);
    });

    // SFX volume slider
    document.getElementById('sfx-volume-slider')?.addEventListener('input', (e) => {
      Engine.initSfx();
      Engine.setSfxVolume(parseFloat(e.target.value) / 100);
    });

    // Radius slider (préférence locale) — le cercle s'agrandit en douceur
    document.getElementById('radius-slider')?.addEventListener('input', (e) => {
      Engine.player.audioRadius = parseFloat(e.target.value);
      Engine._radiusChangedAt = performance.now();
    });

    // Screen share button
    document.getElementById('btn-screen-share')?.addEventListener('click', () => {
      if (ScreenShare.isSharing) {
        ScreenShare.stopShare();
      } else {
        ScreenShare.startShare('global');
      }
      this.updateScreenShareButton();
    });

    // View toggle button (#13 smooth transition)
    document.getElementById('btn-view-toggle')?.addEventListener('click', () => {
      Engine.viewMode = Engine.viewMode === 'iso' ? 'topdown' : 'iso';
      try { localStorage.setItem('insuffle_view', Engine.viewMode); } catch (e) {}
      this.showNotification('Vue : ' + (Engine.viewMode === 'iso' ? 'Isométrique' : 'Plan de salle'));
      // #40 Smooth view mode transition
      if (typeof UXEnhancements !== 'undefined') UXEnhancements.fadeViewTransition();
      // #12 Update compass rotation for view mode
      var compass = document.getElementById('compass-indicator');
      if (compass) compass.style.transform = Engine.viewMode === 'topdown' ? 'rotate(0deg)' : 'rotate(45deg)';
    });

    // Edit mode button (admin only)
    document.getElementById('btn-edit-mode')?.addEventListener('click', () => {
      Engine.toggleEditMode();
    });

    // Admin panel button
    document.getElementById('btn-admin')?.addEventListener('click', () => {
      this.toggleAdminPanel();
    });

    // Leave button
    document.getElementById('btn-leave')?.addEventListener('click', () => {
      if (confirm('Voulez-vous vraiment quitter cette salle ?')) {
        try { localStorage.removeItem('insuffle_session'); } catch (e) {}
        Network.leaveRoom();
        Audio.destroy();
        if (Engine.sfxCtx) { try { Engine.sfxCtx.close(); } catch(e) {} Engine.sfxCtx = null; }
        ScreenShare.destroy();
        window.location.href = '/client/index.html';
      }
    });

    // Reaction buttons — use mousedown to avoid click bubbling issues
    document.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const emoji = btn.dataset.emoji;
        if (emoji) {
          Engine.sendReaction(emoji);
          btn.style.transform = 'scale(1.4)';
          setTimeout(() => { btn.style.transform = ''; }, 150);
        }
      });
    });

    // Hand raise button
    document.getElementById('btn-hand')?.addEventListener('click', () => {
      Network.socket.emit('toggle-hand', {});
    });

    // Edit mode toolbar
    this.initEditToolbar();

    // #42 Notification sound toggle
    var soundToggle = document.getElementById('btn-sound-toggle');
    if (soundToggle) {
      soundToggle.addEventListener('click', function() {
        Engine.sfxMuted = !Engine.sfxMuted;
        soundToggle.classList.toggle('sound-muted', Engine.sfxMuted);
        soundToggle.textContent = Engine.sfxMuted ? '\uD83D\uDD07' : '\uD83D\uDD08';
        UI.showNotification(Engine.sfxMuted ? 'Sons d\u00e9sactiv\u00e9s' : 'Sons activ\u00e9s');
      });
    }

    // #4 Ambient background sound toggle
    var ambientBtn = document.getElementById('btn-ambient');
    if (ambientBtn) {
      ambientBtn.addEventListener('click', function() {
        if (typeof UXEnhancements !== 'undefined') {
          var on = UXEnhancements.toggleAmbientSound();
          ambientBtn.classList.toggle('sharing', on);
          ambientBtn.title = on ? 'Bruit ambiant de bureau (on)' : 'Bruit ambiant de bureau (off)';
          UI.showNotification(on ? 'Ambiance bureau activee' : 'Ambiance bureau desactivee');
        }
      });
    }

    // #50 Bascule jour/nuit : alterne entre le th\u00e8me Nuit et le dernier th\u00e8me clair
    var darkModeToggle = document.getElementById('btn-dark-mode');
    if (darkModeToggle && typeof Themes !== 'undefined') {
      darkModeToggle.textContent = Themes.current === 'nuit' ? '\u2600' : '\u263D';
      darkModeToggle.addEventListener('click', function() {
        var isDark = Themes.current === 'nuit';
        if (isDark) {
          var prev = 'jour';
          try { prev = localStorage.getItem('insuffle_theme_light') || 'jour'; } catch (e) {}
          Themes.apply(prev);
        } else {
          try { localStorage.setItem('insuffle_theme_light', Themes.current); } catch (e) {}
          Themes.apply('nuit');
        }
        darkModeToggle.textContent = Themes.current === 'nuit' ? '\u2600' : '\u263D';
        UI.showNotification(Themes.current === 'nuit' ? 'Th\u00e8me Nuit activ\u00e9' : 'Th\u00e8me clair activ\u00e9');
      });
    }

    // #47 Export config button
    this.initExportConfig();

    // #40 Consistent tooltip system for toolbar buttons
    this.initTooltipSystem();
  },

  // #40 Unified tooltip system
  initTooltipSystem() {
    var tooltip = null;
    function showTooltip(btn) {
      if (tooltip) tooltip.remove();
      var title = btn.getAttribute('data-tooltip') || btn.getAttribute('title');
      if (!title) return;
      tooltip = document.createElement('div');
      tooltip.className = 'ux-tooltip';
      tooltip.textContent = title;
      document.body.appendChild(tooltip);
      var rect = btn.getBoundingClientRect();
      tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
      tooltip.style.top = (rect.top - tooltip.offsetHeight - 6) + 'px';
    }
    function hideTooltip() {
      if (tooltip) { tooltip.remove(); tooltip = null; }
    }
    document.querySelectorAll('.toolbar-btn').forEach(function(btn) {
      btn.addEventListener('mouseenter', function() { showTooltip(btn); });
      btn.addEventListener('mouseleave', hideTooltip);
      btn.addEventListener('mousedown', hideTooltip);
    });
  },

  updateMuteButton(muted) {
    const btn = document.getElementById('btn-mute');
    if (!btn) return;
    btn.classList.toggle('muted', muted);
    btn.title = muted ? 'Activer le micro (M)' : 'Couper le micro (M)';
    btn.innerHTML = muted
      ? '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M1.5 4.5l2.1-2.1L21 19.9l-2.1 2.1-4.4-4.4c-.6.3-1.3.5-2 .6V22h-1.5v-3.8C7.7 17.7 5 15 5 11.5h1.5c0 3 2.5 5.5 5.5 5.5.6 0 1.1-.1 1.6-.3L12 15.1c-.2 0-.3 0-.5 0-1.9 0-3.5-1.6-3.5-3.5v-.6L1.5 4.5zM12 1c1.9 0 3.5 1.6 3.5 3.5v7c0 .3 0 .5-.1.8l5.1 5.1c.3-.9.5-1.8.5-2.9h1.5c0 1.4-.3 2.8-.8 4L15.5 12.3V4.5C15.5 2.6 13.9 1 12 1z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 1c1.9 0 3.5 1.6 3.5 3.5v7c0 1.9-1.6 3.5-3.5 3.5s-3.5-1.6-3.5-3.5v-7C8.5 2.6 10.1 1 12 1zm5.5 10.5c0 3-2.5 5.5-5.5 5.5s-5.5-2.5-5.5-5.5H5c0 3.5 2.7 6.2 6.2 6.7V22h1.5v-3.8c3.5-.5 6.2-3.2 6.2-6.7h-1.5z"/></svg>';
  },

  updateScreenShareButton() {
    const btn = document.getElementById('btn-screen-share');
    if (!btn) return;
    btn.classList.toggle('sharing', ScreenShare.isSharing);
    btn.title = ScreenShare.isSharing ? 'Arrêter le partage' : 'Partager mon écran';
  },

  // Show/hide admin-only buttons
  updateAdminUI(isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
  },

  // ===== MICROPHONE PERMISSION =====

  showMicPermissionHint() {
    var hint = document.getElementById('mic-permission-hint');
    if (hint) hint.style.display = 'flex';
  },

  hideMicPermissionHint() {
    var hint = document.getElementById('mic-permission-hint');
    if (hint) hint.style.display = 'none';
  },

  // ===== NOTIFICATIONS =====

  showNotification(text, type) {
    const container = document.getElementById('notifications-container');
    if (!container) return;
    // Limit max visible notifications to 5
    while (container.children.length >= 5) container.removeChild(container.firstChild);
    const el = document.createElement('div');
    el.className = 'notification';
    // #36 Success / #37 Error type notifications
    if (type === 'success') {
      el.classList.add('notification-success');
      el.innerHTML = text + ' <span class="success-flash"></span>';
    } else if (type === 'error') {
      el.classList.add('notification-error');
      el.innerHTML = text;
    } else {
      el.textContent = text;
    }
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('notification-show'));
    setTimeout(() => {
      el.classList.remove('notification-show');
      el.classList.add('notification-hide');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, CONSTANTS.NOTIFICATION_DURATION);

    // #41 Hide loading indicator after first notification
    var loadingBar = document.getElementById('room-loading-indicator');
    if (loadingBar) loadingBar.style.display = 'none';
  },

  showReconnecting(show) {
    const el = document.getElementById('reconnecting-indicator');
    if (el) el.style.display = show ? 'flex' : 'none';
  },

  // ===== CONTEXT MENU =====

  showContextMenu(x, y, targetSocketId, targetData) {
    this.hideContextMenu();
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    const isLocalAdmin = Engine.player.isAdmin;
    const isLocalCreator = Engine.player.role === 'creator';
    const targetIsAdmin = targetData.isAdmin;
    const targetIsCreator = targetData.role === 'creator';

    let html = `<div class="ctx-menu-header">${this.escapeHtml(targetData.pseudo)}</div>`;

    if (isLocalAdmin && !targetIsCreator && targetSocketId !== Network.mySocketId) {
      if (!targetIsAdmin) {
        html += `<div class="ctx-menu-item" data-action="promote">Promouvoir administrateur</div>`;
      } else if (isLocalCreator) {
        html += `<div class="ctx-menu-item" data-action="demote">Retirer le rôle d'administrateur</div>`;
      }
      html += `<div class="ctx-menu-item ctx-menu-danger" data-action="kick">Exclure</div>`;
    }

    if (isLocalAdmin) {
      html += `<div class="ctx-menu-item" data-action="spotlight">Spotlight</div>`;
    }

    html += `<div class="ctx-menu-item" data-action="profile">Voir les informations</div>`;

    menu.innerHTML = html;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
    this.contextMenuOpen = true;

    // Event handlers
    menu.querySelectorAll('.ctx-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        this.handleContextAction(action, targetSocketId, targetData);
        this.hideContextMenu();
      });
    });
  },

  showFurnitureMenu(x, y, item, def) {
    this.hideContextMenu();
    var menu = document.getElementById('context-menu');
    if (!menu) return;

    var html = '<div class="ctx-menu-header">' + def.name + ' (' + item.x + ',' + item.y + ')</div>';
    html += '<div class="ctx-menu-item" data-action="move-here">Déplacer devant mon avatar</div>';
    html += '<div class="ctx-menu-item" data-action="duplicate">Dupliquer cet élément</div>';
    html += '<div class="ctx-menu-item ctx-menu-danger" data-action="delete">Supprimer</div>';

    menu.innerHTML = html;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.display = 'block';
    this.contextMenuOpen = true;

    var self = this;
    menu.querySelectorAll('.ctx-menu-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var action = el.dataset.action;
        if (action === 'delete' && item.id) {
          Network.socket.emit('remove-furniture', { furnitureId: item.id }, function(r) {
            if (r && r.success) {
              Board.furniture = Board.furniture.filter(function(f) { return f.id !== item.id; });
              Board.buildCollisionMap();
              self.showNotification('Mobilier supprimé');
              self.refreshFurnitureList();
            }
          });
        } else if (action === 'move-here' && item.id) {
          var nx = Math.floor(Engine.player.x) + 2;
          var ny = Math.floor(Engine.player.y);
          item.x = nx;
          item.y = ny;
          Board.buildCollisionMap();
          // Sync move to server and other clients
          Network.socket.emit('move-furniture', { furnitureId: item.id, x: nx, y: ny });
          self.showNotification('Mobilier déplacé');
        } else if (action === 'duplicate') {
          Network.socket.emit('add-furniture', { type: item.type, x: item.x + 1, y: item.y + 1 }, function(r) {
            if (r && r.success) {
              Board.furniture.push(r.item);
              Board.buildCollisionMap();
              self.showNotification('Mobilier dupliqué');
              self.refreshFurnitureList();
            }
          });
        }
        self.hideContextMenu();
      });
    });
  },

  // #20 Right-click empty space: return to player
  showReturnToPlayerMenu(x, y) {
    this.hideContextMenu();
    var menu = document.getElementById('context-menu');
    if (!menu) return;
    menu.innerHTML = '<div class="ctx-menu-item ctx-menu-return" data-action="return-to-player">\u2302 Recentrer sur mon avatar</div>';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.display = 'block';
    this.contextMenuOpen = true;
    var self = this;
    menu.querySelector('[data-action="return-to-player"]').addEventListener('click', function() {
      Engine._cameraCenterTarget = null; // Reset any pending center
      var ps = Board.iso(Engine.player.x, Engine.player.y);
      Engine.camera.x = Engine.viewW / 2 - ps.x * Engine.zoom;
      Engine.camera.y = Engine.viewH / 2 - ps.y * Engine.zoom;
      self.hideContextMenu();
    });
  },

  hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.style.display = 'none';
    this.contextMenuOpen = false;
  },

  handleContextAction(action, targetSocketId, targetData) {
    switch (action) {
      case 'promote':
        Network.socket.emit('promote-admin', { targetSocketId }, (resp) => {
          if (resp.success) this.showNotification(`${targetData.pseudo} est désormais administrateur`);
        });
        break;
      case 'demote':
        Network.socket.emit('demote-admin', { targetSocketId }, (resp) => {
          if (resp.success) this.showNotification(`Le rôle d'administrateur a été retiré à ${targetData.pseudo}`);
        });
        break;
      case 'kick':
        if (confirm(`Voulez-vous vraiment exclure ${targetData.pseudo} de la salle ?`)) {
          Network.socket.emit('kick-participant', { targetSocketId }, (resp) => {
            if (resp.success) this.showNotification(`${targetData.pseudo} a été exclu(e) de la salle`);
          });
        }
        break;
      case 'spotlight':
        Network.socket.emit('spotlight', { targetSocketId, active: true });
        break;
      case 'profile':
        this.showNotification(`${targetData.pseudo} — Rôle : ${targetData.role === 'creator' ? 'Créateur' : targetData.role === 'admin' ? 'Administrateur' : 'Participant'}`);
        break;
    }
  },

  // ===== ADMIN PANEL =====

  toggleAdminPanel() {
    this.adminPanelOpen = !this.adminPanelOpen;
    const panel = document.getElementById('admin-panel');
    if (panel) panel.classList.toggle('open', this.adminPanelOpen);
    if (this.adminPanelOpen) {
      this.refreshAdminPanel();
      // #31 Wire up drag handle for resizing
      this.initAdminPanelResize();
    }
  },

  // #31 Admin panel resize via drag handle
  _adminResizeWired: false,
  initAdminPanelResize() {
    if (this._adminResizeWired) return;
    this._adminResizeWired = true;
    var handle = document.getElementById('admin-panel-resize');
    var panel = document.getElementById('admin-panel');
    if (!handle || !panel) return;
    var dragging = false;
    handle.addEventListener('mousedown', function(e) {
      dragging = true;
      e.preventDefault();
    });
    window.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var newWidth = Math.max(280, Math.min(600, window.innerWidth - e.clientX));
      panel.style.width = newWidth + 'px';
    });
    window.addEventListener('mouseup', function() { dragging = false; });
  },

  refreshAdminPanel() {
    this.refreshParticipantsList();
    this.updateAdminSettings();
    this.initMobilierTab();
    this.refreshFurnitureList();
    this.refreshTablesList();
    this.refreshSubRoomsList();
    // #46 Room uptime
    this.updateRoomUptime();
  },

  // #46 Room uptime display
  updateRoomUptime() {
    var el = document.getElementById('room-uptime');
    if (!el) return;
    if (!this._roomJoinTime) this._roomJoinTime = Date.now();
    var elapsed = Math.floor((Date.now() - this._roomJoinTime) / 1000);
    var hours = Math.floor(elapsed / 3600);
    var mins = Math.floor((elapsed % 3600) / 60);
    var secs = elapsed % 60;
    var uptimeStr = '';
    if (hours > 0) uptimeStr += hours + 'h ';
    uptimeStr += mins + 'min ' + secs + 's';
    el.textContent = '\u23F1 Session active depuis : ' + uptimeStr;
  },

  refreshParticipantsList() {
    const list = document.getElementById('admin-participants-list');
    if (!list) return;

    let html = '';
    // Local player
    html += this.renderParticipantRow(Network.mySocketId, Engine.player);

    // Remote players
    for (const [sid, p] of Network.remotePlayers) {
      html += this.renderParticipantRow(sid, p);
    }
    list.innerHTML = html;

    // Attach event handlers
    list.querySelectorAll('.admin-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const sid = btn.dataset.socketid;
        if (action === 'kick') {
          const p = Network.remotePlayers.get(sid);
          if (p && confirm(`Voulez-vous vraiment exclure ${p.pseudo} de la salle ?`)) {
            Network.socket.emit('kick-participant', { targetSocketId: sid }, () => {});
          }
        } else if (action === 'promote') {
          Network.socket.emit('promote-admin', { targetSocketId: sid }, () => {});
        } else if (action === 'demote') {
          Network.socket.emit('demote-admin', { targetSocketId: sid }, () => {});
        }
      });
    });
  },

  renderParticipantRow(socketId, p) {
    const isMe = socketId === Network.mySocketId;
    const name = isMe ? `${this.escapeHtml(p.pseudo)} (vous)` : this.escapeHtml(p.pseudo);
    const badge = p.isAdmin ? '<span class="badge-admin">★</span>' : '';
    const muteBadge = p.isMuted ? '<span class="badge-muted">🔇</span>' : '';
    const handBadge = p.handRaised ? '<span class="badge-hand">✋</span>' : '';
    const dc = p.disconnected ? '<span class="badge-dc">(déconnecté)</span>' : '';

    let actions = '';
    if (!isMe && Engine.player.isAdmin) {
      const isCreator = Engine.player.role === 'creator';
      if (!p.isAdmin) {
        actions += `<button class="admin-action-btn" data-action="promote" data-socketid="${socketId}">Promouvoir</button>`;
      } else if (isCreator && p.role !== 'creator') {
        actions += `<button class="admin-action-btn" data-action="demote" data-socketid="${socketId}">Rétrograder</button>`;
      }
      if (p.role !== 'creator') {
        actions += `<button class="admin-action-btn danger" data-action="kick" data-socketid="${socketId}">Exclure</button>`;
      }
    }

    // #45 Last activity timestamp
    var activity = '';
    if (!isMe && p.lastSeen) {
      var ago = Math.floor((Date.now() - p.lastSeen) / 1000);
      if (ago < 10) activity = '<span class="participant-activity">actif maintenant</span>';
      else if (ago < 60) activity = '<span class="participant-activity">actif il y a ' + ago + 's</span>';
      else activity = '<span class="participant-activity">actif il y a ' + Math.floor(ago / 60) + 'min</span>';
    } else if (isMe) {
      activity = '<span class="participant-activity">vous</span>';
    }

    return `<div class="participant-row">${badge}${name} ${muteBadge}${handBadge}${dc} ${activity}<div class="participant-actions">${actions}</div></div>`;
  },

  initMobilierTab() {
    var self = this;
    // Build furniture catalog from Environments.furnitureTypes
    var catalog = document.getElementById('furniture-catalog');
    if (!catalog) return;

    var icons = {
      desk: '🪑', chair: '💺', plant: '🌿', palmTree: '🌴', partition: '🔲',
      largeTable: '📐', roundTable: '⭕', screen: '🖥️', couch: '🛋️',
      coffeeTable: '☕', bookshelf: '📚', whiteboard: '📋', postItBoard: '📌',
      stage: '🎭', smallStage: '🎭', podium: '🎤', projector: '📽️', waterCooler: '🚰',
      filingCabinet: '🗄️', standingDesk: '🖥️', lamp: '💡',
      collabSpace: '🤝', carpet: '🟫', largeCarpet: '🟫',
      door: '🚪', conferencePhone: '📞', trashBin: '🗑️', clock: '🕐',
    };

    var html = '';
    for (var type in Environments.furnitureTypes) {
      var def = Environments.furnitureTypes[type];
      if (def.isZone) continue;
      var icon = icons[type] || '📦';
      html += '<button class="catalog-item" data-type="' + type + '">' + icon + ' ' + def.name + '</button>';
    }
    catalog.innerHTML = html;

    catalog.querySelectorAll('.catalog-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var type = btn.dataset.type;
        var px = Math.floor(Engine.player.x) + 2;
        var py = Math.floor(Engine.player.y);
        Network.socket.emit('add-furniture', { type: type, x: px, y: py }, function(r) {
          if (r && r.success) {
            Board.furniture.push(r.item);
            Board.buildCollisionMap();
            self.showNotification(Environments.furnitureTypes[type].name + ' ajout\u00e9 avec succ\u00e8s', 'success');
            self.refreshFurnitureList();
          }
        });
      });
    });

    // Add table button
    var addTableBtn = document.getElementById('btn-add-table');
    if (addTableBtn) addTableBtn.addEventListener('click', function() {
      var name = document.getElementById('new-table-name').value || 'Table';
      Network.socket.emit('create-table', {
        name: name,
        x: Math.floor(Engine.player.x) + 2,
        y: Math.floor(Engine.player.y) + 2,
        width: 3, height: 3,
      }, function(r) {
        if (r && r.success) {
          Engine.tables.set(r.table.id, r.table);
          self.showNotification('Table de travail « ' + name + ' » créée');
          self.refreshTablesList();
        }
      });
    });
  },

  refreshFurnitureList() {
    var list = document.getElementById('placed-furniture-list');
    var countEl = document.getElementById('furniture-count');
    if (!list) return;
    if (countEl) countEl.textContent = '(' + Board.furniture.length + ')';

    if (Board.furniture.length === 0) {
      list.innerHTML = '<div class="empty-state"><span class="empty-state-icon">🪑</span><span class="empty-state-text">Aucun mobilier placé. Utilisez le catalogue ci-dessus pour en ajouter.</span></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < Board.furniture.length; i++) {
      var item = Board.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      html += '<div class="placed-item" data-index="' + i + '">';
      html += '<span style="font-size:0.8rem;">' + def.name + ' (' + item.x + ',' + item.y + ')</span>';
      if (item.id) {
        html += '<button class="admin-action-btn danger" data-action="remove" data-id="' + item.id + '" title="Supprimer">✕</button>';
      }
      html += '</div>';
    }
    list.innerHTML = html;

    list.querySelectorAll('[data-action="remove"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var fid = btn.dataset.id;
        Network.socket.emit('remove-furniture', { furnitureId: fid }, function(r) {
          if (r && r.success) {
            Board.furniture = Board.furniture.filter(function(f) { return f.id !== fid; });
            Board.buildCollisionMap();
            UI.refreshFurnitureList();
            UI.showNotification('Mobilier supprimé');
          }
        });
      });
    });
  },

  refreshTablesList() {
    var list = document.getElementById('tables-list');
    if (!list) return;

    if (Engine.tables.size === 0) {
      list.innerHTML = '<div class="empty-state"><span class="empty-state-text">Aucune table de travail.</span></div>';
      return;
    }

    var html = '';
    Engine.tables.forEach(function(t, id) {
      html += '<div class="placed-item">';
      html += '<span style="font-size:0.8rem;">📐 ' + (t.name || 'Table') + '</span>';
      html += '<button class="admin-action-btn danger" data-action="delete-table" data-id="' + id + '" title="Supprimer" aria-label="Supprimer la table">✕</button>';
      html += '</div>';
    });
    list.innerHTML = html;

    list.querySelectorAll('[data-action="delete-table"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tid = btn.dataset.id;
        Network.socket.emit('delete-table', { tableId: tid }, function(r) {
          if (r && r.success) {
            Engine.tables.delete(tid);
            UI.refreshTablesList();
            UI.showNotification('Table de travail supprimée');
          }
        });
      });
    });
  },

  refreshSubRoomsList() {
    var list = document.getElementById('sub-rooms-list');
    if (!list) return;
    var html = '';
    Engine.subRooms.forEach(function(sr, id) {
      var count = sr.participants ? sr.participants.length : 0;
      html += '<div class="placed-item">';
      html += '<span style="font-size:0.8rem;">🚪 ' + (sr.name || 'Sous-salle') + ' <span style="color:#999;">(' + count + ' pers.)</span></span>';
      html += '<button class="admin-action-btn danger" data-action="delete-subroom" data-id="' + id + '" title="Supprimer">✕</button>';
      html += '</div>';
    });
    if (!html) html = '<p style="font-size:0.75rem;color:#999;">Aucune sous-salle créée pour le moment</p>';
    list.innerHTML = html;

    list.querySelectorAll('[data-action="delete-subroom"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var srid = btn.dataset.id;
        if (confirm('Voulez-vous vraiment supprimer cette sous-salle ?')) {
          Network.socket.emit('delete-sub-room', { subRoomId: srid }, function(r) {
            if (r && r.success) {
              Engine.subRooms.delete(srid);
              UI.refreshSubRoomsList();
              UI.showNotification('Sous-salle supprimée');
            }
          });
        }
      });
    });
  },

  updateAdminSettings() {
    const gridInput = document.getElementById('admin-grid-size');
    if (gridInput) gridInput.value = Engine.roomConfig.gridSize;

    const envSelect = document.getElementById('admin-environment');
    if (envSelect) envSelect.value = Engine.roomConfig.environment;

    // Wire up apply grid button
    var self = this;
    var gridBtn = document.getElementById('btn-apply-grid');
    if (gridBtn && !gridBtn._wired) {
      gridBtn._wired = true;
      gridBtn.addEventListener('click', function() {
        var s = parseInt(document.getElementById('admin-grid-size').value);
        if (isNaN(s) || s < CONSTANTS.GRID_MIN || s > CONSTANTS.GRID_MAX) {
          self.showNotification('Taille invalide. Choisissez entre ' + CONSTANTS.GRID_MIN + ' et ' + CONSTANTS.GRID_MAX + '.');
          return;
        }
        gridBtn.disabled = true;
        gridBtn.innerHTML = 'En cours<span class="loading-dots"></span>';
        Network.socket.emit('resize-grid', { size: s }, function(r) {
          gridBtn.disabled = false;
          gridBtn.textContent = 'Appliquer';
          if (r && r.success) {
            self.showNotification('Grille redimensionn\u00e9e : ' + s + 'x' + s, 'success');
            var status = document.getElementById('grid-apply-status');
            if (status) { status.style.display = 'inline'; setTimeout(function() { status.style.display = 'none'; }, 2000); }
            self.updateAdminSettings();
          } else {
            self.showNotification('Une erreur est survenue : ' + (r && r.error || 'cause inconnue'), 'error');
          }
        });
      });
    }

    // Wire up environment change button
    var envBtn = document.getElementById('btn-apply-env');
    if (envBtn && !envBtn._wired) {
      envBtn._wired = true;
      envBtn.addEventListener('click', function() {
        var env = document.getElementById('admin-environment').value;
        if (!confirm('Attention : le mobilier actuel sera remplacé par celui du nouvel environnement. Voulez-vous continuer ?')) return;
        envBtn.disabled = true;
        envBtn.innerHTML = 'En cours<span class="loading-dots"></span>';
        Network.socket.emit('change-environment', { environment: env }, function(r) {
          envBtn.disabled = false;
          envBtn.textContent = 'Changer';
          if (r && r.success) {
            self.showNotification('Environnement modifi\u00e9 avec succ\u00e8s', 'success');
            self.updateAdminSettings();
            self.refreshFurnitureList();
          } else {
            self.showNotification('Une erreur est survenue : ' + (r && r.error || 'cause inconnue'), 'error');
          }
        });
      });
    }
  },

  // #47 Export room config as JSON
  initExportConfig() {
    var btn = document.getElementById('btn-export-config');
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', function() {
      var config = {
        roomId: Engine.roomConfig.roomId,
        name: Engine.roomConfig.name,
        environment: Engine.roomConfig.environment,
        gridSize: Engine.roomConfig.gridSize,
        furniture: Board.furniture.map(function(f) { return { type: f.type, x: f.x, y: f.y, id: f.id }; }),
        tables: [],
        participantCount: Network.getParticipantCount(),
        exportedAt: new Date().toISOString(),
      };
      Engine.tables.forEach(function(t, id) { config.tables.push({ id: id, name: t.name, x: t.x, y: t.y }); });
      var blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'room-config-' + (Engine.roomConfig.roomId || 'export') + '.json';
      a.click();
      URL.revokeObjectURL(url);
      UI.showNotification('Configuration export\u00e9e avec succ\u00e8s');
    });
  },

  // ===== SHORTCUTS MODAL =====

  toggleShortcutsModal() {
    this.shortcutsModalOpen = !this.shortcutsModalOpen;
    const modal = document.getElementById('shortcuts-modal');
    if (!modal) return;
    modal.style.display = this.shortcutsModalOpen ? 'flex' : 'none';

    if (this.shortcutsModalOpen) {
      // Focus first focusable element inside modal
      var firstBtn = modal.querySelector('button');
      if (firstBtn) setTimeout(function() { firstBtn.focus(); }, 50);

      // Close on overlay click (click on the backdrop, not inner)
      modal._overlayClick = function(e) {
        if (e.target === modal) UI.toggleShortcutsModal();
      };
      modal.addEventListener('click', modal._overlayClick);
    } else {
      if (modal._overlayClick) modal.removeEventListener('click', modal._overlayClick);
    }
  },

  // ===== VOTE POPUP =====

  showVotePopup(vote) {
    const container = document.getElementById('vote-popup');
    if (!container) return;

    var totalVotes = vote.options.reduce(function(sum, o) { return sum + o.votes; }, 0);
    let optionsHtml = vote.options.map((opt, i) => {
      var pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
      return `<div style="margin-bottom:6px;">
        <button class="vote-option-btn" data-index="${i}">${this.escapeHtml(opt.text)} <span class="vote-count">(${opt.votes})</span></button>
        <div class="vote-bar-container">
          <div class="vote-bar"><div class="vote-bar-fill" style="width:${pct}%;" data-bar-index="${i}"></div></div>
          <span class="vote-bar-label">${pct}%</span>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="vote-popup-inner">
        <h3>${this.escapeHtml(vote.question)}</h3>
        <div class="vote-options">${optionsHtml}</div>
        <p class="vote-info">${vote.totalVoters} vote(s)</p>
        <button class="vote-close-btn" id="vote-close-btn">Fermer</button>
      </div>`;
    container.style.display = 'flex';

    container.querySelectorAll('.vote-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Network.socket.emit('cast-vote', {
          voteId: vote.id,
          optionIndex: parseInt(btn.dataset.index),
        }, () => {});
        btn.classList.add('voted');
        container.querySelectorAll('.vote-option-btn').forEach(b => b.disabled = true);
      });
    });

    const closeBtn = document.getElementById('vote-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => { this.hideVotePopup(); });
  },

  updateVotePopup(vote) {
    const container = document.getElementById('vote-popup');
    if (!container || container.style.display === 'none') return;
    var totalVotes = vote.options.reduce(function(sum, o) { return sum + o.votes; }, 0);
    const counts = container.querySelectorAll('.vote-count');
    vote.options.forEach((opt, i) => {
      if (counts[i]) counts[i].textContent = `(${opt.votes})`;
      // #30 Update bar chart
      var bar = container.querySelector('[data-bar-index="' + i + '"]');
      if (bar) {
        var pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
        bar.style.width = pct + '%';
        var label = bar.parentElement.parentElement.querySelector('.vote-bar-label');
        if (label) label.textContent = pct + '%';
      }
    });
    const info = container.querySelector('.vote-info');
    if (info) info.textContent = `${vote.totalVoters} vote(s)`;
  },

  hideVotePopup() {
    const container = document.getElementById('vote-popup');
    if (container) container.style.display = 'none';
  },




  // ===== POST-IT DARK BOARD POP-IN =====

  openPostItBoard: function(boardId, furnitureItem) {
    var self = this;
    var overlay = document.getElementById('postit-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    var board = document.getElementById('darkboard-postit-layer');
    var drawCanvas = document.getElementById('darkboard-canvas');
    var viewport = document.getElementById('darkboard-viewport');
    var wrapper = document.getElementById('darkboard-transform-wrapper');
    var templateLayer = document.getElementById('darkboard-template-layer');
    var statusText = document.getElementById('darkboard-status-text');
    var votesInfo = document.getElementById('darkboard-votes-info');
    var minimapCanvas = document.getElementById('darkboard-minimap-canvas');
    var minimapVP = document.getElementById('darkboard-minimap-vp');

    if (!board || !drawCanvas || !viewport) { overlay.style.display = 'none'; return; }
    board.innerHTML = '';
    if (templateLayer) templateLayer.innerHTML = '';
    var drawCtx = drawCanvas.getContext('2d');
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    var minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

    // === STATE ===
    var currentColor = '#FFE066', penColor = '#FFFFFF', penWidth = 2;
    var currentTool = 'select', shapeType = 'rect';
    var postits = [], strokes = [], circles = [], textLabels = [];
    var dotVotingMode = false, isoloirMode = false, myVotes = 0, maxVotes = 3;
    var dragState = null, drawState = null, resizeState = null;
    var panX = -1500, panY = -1500, zoom = 1;
    var isPanning = false, panStart = {x:0,y:0}, panOrig = {x:0,y:0};
    var myPseudo = (typeof Engine !== 'undefined' && Engine.player) ? Engine.player.pseudo : 'Moi';

    // === PAN & ZOOM ===
    function applyTransform() {
      if (wrapper) wrapper.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
      var zl = document.getElementById('darkboard-zoom-label');
      if (zl) zl.textContent = Math.round(zoom * 100) + '%';
      updateMinimap();
    }
    applyTransform();

    // === MINIMAP ===
    function updateMinimap() {
      if (!minimapCtx || !minimapCanvas || !minimapVP || !viewport) return;
      var cw = drawCanvas.width, ch = drawCanvas.height;
      var mw = minimapCanvas.width, mh = minimapCanvas.height;
      var sx = mw / cw, sy = mh / ch;
      minimapCtx.clearRect(0, 0, mw, mh);
      minimapCtx.fillStyle = '#1a1a2e';
      minimapCtx.fillRect(0, 0, mw, mh);
      // Draw postits as colored dots
      for (var pi = 0; pi < postits.length; pi++) {
        minimapCtx.fillStyle = postits[pi].color || '#FFE066';
        minimapCtx.fillRect(postits[pi].x * sx, postits[pi].y * sy, 4, 3);
      }
      // Draw strokes as thin lines
      minimapCtx.strokeStyle = 'rgba(255,255,255,0.3)';
      minimapCtx.lineWidth = 0.5;
      for (var si = 0; si < strokes.length; si++) {
        var s = strokes[si];
        if (s.type === 'pen' && s.points && s.points.length > 1) {
          minimapCtx.beginPath();
          minimapCtx.moveTo(s.points[0].x * sx, s.points[0].y * sy);
          for (var j = 1; j < s.points.length; j++) minimapCtx.lineTo(s.points[j].x * sx, s.points[j].y * sy);
          minimapCtx.stroke();
        }
      }
      // Viewport indicator
      var vpRect = viewport.getBoundingClientRect();
      var vpW = vpRect.width / zoom, vpH = vpRect.height / zoom;
      var vpX = -panX / zoom, vpY = -panY / zoom;
      minimapVP.style.left = (vpX * sx) + 'px';
      minimapVP.style.top = (vpY * sy) + 'px';
      minimapVP.style.width = (vpW * sx) + 'px';
      minimapVP.style.height = (vpH * sy) + 'px';
    }

    // === CANVAS COORDINATES (accounts for pan + zoom) ===
    function canvasPos(e) {
      var rect = viewport.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - panX) / zoom,
        y: (e.clientY - rect.top - panY) / zoom
      };
    }

    // === REDRAW CANVAS ===
    function redrawCanvas() {
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      // Strokes
      for (var i = 0; i < strokes.length; i++) {
        var s = strokes[i];
        drawCtx.strokeStyle = s.color || '#fff';
        drawCtx.lineWidth = s.width || 2;
        drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
        if (s.type === 'pen' && s.points && s.points.length > 1) {
          drawCtx.beginPath();
          drawCtx.moveTo(s.points[0].x, s.points[0].y);
          for (var j = 1; j < s.points.length; j++) drawCtx.lineTo(s.points[j].x, s.points[j].y);
          drawCtx.stroke();
        } else if (s.type === 'shape') {
          drawCtx.beginPath();
          if (s.shape === 'rect') drawCtx.rect(s.x, s.y, s.w, s.h);
          else if (s.shape === 'ellipse') drawCtx.ellipse(s.x+s.w/2, s.y+s.h/2, Math.abs(s.w/2)||1, Math.abs(s.h/2)||1, 0, 0, Math.PI*2);
          else if (s.shape === 'arrow') {
            drawCtx.moveTo(s.x, s.y); drawCtx.lineTo(s.x+s.w, s.y+s.h);
            drawCtx.stroke();
            // Arrowhead
            var angle = Math.atan2(s.h, s.w);
            var ax = s.x+s.w, ay = s.y+s.h, alen = 14;
            drawCtx.beginPath();
            drawCtx.moveTo(ax, ay);
            drawCtx.lineTo(ax - alen*Math.cos(angle-0.4), ay - alen*Math.sin(angle-0.4));
            drawCtx.moveTo(ax, ay);
            drawCtx.lineTo(ax - alen*Math.cos(angle+0.4), ay - alen*Math.sin(angle+0.4));
          } else { // line
            drawCtx.moveTo(s.x, s.y); drawCtx.lineTo(s.x+s.w, s.y+s.h);
          }
          drawCtx.stroke();
        }
      }
      // Group circles
      for (var ci = 0; ci < circles.length; ci++) {
        var c = circles[ci];
        drawCtx.beginPath();
        drawCtx.ellipse(c.cx, c.cy, Math.abs(c.rx), Math.abs(c.ry), 0, 0, Math.PI*2);
        drawCtx.strokeStyle = c.color || 'rgba(255,255,255,0.6)';
        drawCtx.lineWidth = 2.5;
        drawCtx.setLineDash([8,4]); drawCtx.stroke(); drawCtx.setLineDash([]);
        if (c.label) {
          drawCtx.font = 'bold 14px "Segoe UI", sans-serif';
          drawCtx.fillStyle = 'rgba(255,255,255,0.7)'; drawCtx.textAlign = 'center';
          drawCtx.fillText(c.label, c.cx, c.cy - Math.abs(c.ry) - 8);
        }
      }
      // In-progress drawing preview
      if (drawState) {
        drawCtx.strokeStyle = drawState.color || penColor;
        drawCtx.lineWidth = drawState.width || penWidth;
        drawCtx.lineCap = 'round';
        if (drawState.type === 'pen' && drawState.points.length > 1) {
          drawCtx.beginPath();
          drawCtx.moveTo(drawState.points[0].x, drawState.points[0].y);
          for (var dp = 1; dp < drawState.points.length; dp++) drawCtx.lineTo(drawState.points[dp].x, drawState.points[dp].y);
          drawCtx.stroke();
        } else if (drawState.type === 'shape' || drawState.type === 'circle') {
          var dw = drawState.endX - drawState.startX, dh = drawState.endY - drawState.startY;
          if (drawState.type === 'circle') { drawCtx.strokeStyle = 'rgba(255,255,255,0.5)'; drawCtx.lineWidth = 2; drawCtx.setLineDash([6,3]); }
          drawCtx.beginPath();
          if (drawState.shape === 'rect') drawCtx.rect(drawState.startX, drawState.startY, dw, dh);
          else if (drawState.shape === 'ellipse' || drawState.type === 'circle') drawCtx.ellipse(drawState.startX+dw/2, drawState.startY+dh/2, Math.abs(dw/2)||1, Math.abs(dh/2)||1, 0, 0, Math.PI*2);
          else { drawCtx.moveTo(drawState.startX, drawState.startY); drawCtx.lineTo(drawState.endX, drawState.endY); }
          drawCtx.stroke(); drawCtx.setLineDash([]);
        }
      }
      // #47 Draw cursor trail in darkboard
      if (typeof UXEnhancements !== 'undefined') {
        UXEnhancements.drawDarkboardCursorTrail(drawCtx);
      }
      updateMinimap();
    }

    // === POST-IT ===
    function broadcastPostit(p) {
      Network.socket.emit('wb-postit', { whiteboardId: boardId,
        postitData: { id: p.id, text: p.text, x: p.x, y: p.y, color: p.color, pseudo: p.pseudo, votes: p.votes || 0 }
      });
      // #18, #19, #22 Save indicator
      if (typeof UXEnhancements !== 'undefined') UXEnhancements.markDarkboardSaved();
    }

    function createPostItEl(postit) {
      var el = document.createElement('div');
      el.className = 'db-postit'; // FIXED: use CSS class name
      el.dataset.postitId = postit.id;
      el.style.background = postit.color || currentColor;
      el.style.left = postit.x + 'px';
      el.style.top = postit.y + 'px';

      // Isoloir: mark own vs other
      if (postit.pseudo === myPseudo) el.classList.add('db-postit-own');
      else el.classList.add('db-postit-other');

      var textarea = document.createElement('textarea');
      textarea.value = postit.text || ''; textarea.placeholder = 'Saisissez votre idée...';
      textarea.addEventListener('input', function() { postit.text = textarea.value; broadcastPostit(postit); });
      textarea.addEventListener('keydown', function(e) { e.stopPropagation(); });

      var delBtn = document.createElement('button'); delBtn.className = 'db-postit-delete'; delBtn.textContent = '✕';
      delBtn.addEventListener('click', function(e) { e.stopPropagation(); el.remove(); postits = postits.filter(function(p){return p.id!==postit.id;}); Network.socket.emit('wb-postit-delete', { whiteboardId: boardId, postitId: postit.id }); });

      var author = document.createElement('div'); author.className = 'db-postit-author';
      author.textContent = postit.pseudo || myPseudo;

      var badge = document.createElement('div'); badge.className = 'db-vote-badge';
      badge.textContent = postit.votes || 0; badge.style.display = (postit.votes > 0) ? 'flex' : 'none';

      // Resize handle
      var resizeHandle = document.createElement('div'); resizeHandle.className = 'db-postit-resize';
      resizeHandle.addEventListener('mousedown', function(e) {
        e.preventDefault(); e.stopPropagation();
        resizeState = { el: el, postit: postit, startX: e.clientX, startY: e.clientY, origW: el.offsetWidth, origH: el.offsetHeight };
      });

      el.appendChild(delBtn); el.appendChild(textarea); el.appendChild(author); el.appendChild(badge); el.appendChild(resizeHandle);

      // Drag
      el.addEventListener('mousedown', function(e) {
        if (dotVotingMode || (currentTool !== 'select' && currentTool !== 'postit')) return;
        if (e.target === textarea || e.target === delBtn || e.target === resizeHandle) return;
        dragState = { el:el, postit:postit, startX:e.clientX, startY:e.clientY, origX:postit.x, origY:postit.y };
        el.classList.add('db-postit-selected');
        e.preventDefault(); e.stopPropagation();
      });

      // Dot vote
      el.addEventListener('click', function(e) {
        if (!dotVotingMode) return; if (e.target === delBtn) return; e.stopPropagation();
        if (myVotes >= maxVotes) { self.showNotification('Vous avez utilisé tous vos votes (' + maxVotes + ' maximum)'); return; }
        myVotes++; postit.votes = (postit.votes||0) + 1;
        badge.textContent = postit.votes; badge.style.display = 'flex';
        el.classList.add('db-postit-voted'); setTimeout(function(){el.classList.remove('db-postit-voted');}, 350);
        broadcastPostit(postit);
        if (votesInfo) votesInfo.textContent = 'Vote par points — ' + myVotes + '/' + maxVotes + ' votes utilisés';
      });

      board.appendChild(el); return el;
    }

    function addNewPostit(atX, atY) {
      var x = atX || ((-panX/zoom) + 200 + Math.random()*400);
      var y = atY || ((-panY/zoom) + 200 + Math.random()*300);
      var postit = { id: 'p_'+Date.now()+'_'+Math.random().toString(36).substr(2,4), text: '',
        x: x, y: y, color: currentColor, pseudo: myPseudo, votes: 0 };
      postits.push(postit); createPostItEl(postit); broadcastPostit(postit);
    }

    // === TEXT LABELS ===
    function addTextLabel(x, y) {
      var el = document.createElement('div');
      el.className = 'db-text-label';
      el.contentEditable = true;
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.textContent = 'Texte';
      el.addEventListener('keydown', function(e) { e.stopPropagation(); });
      el.addEventListener('mousedown', function(e) { e.stopPropagation(); });
      board.appendChild(el);
      textLabels.push({ el: el, x: x, y: y });
      el.focus();
    }

    // === ERASER ===
    function eraseAt(pos) {
      var eraseRadius = 20;
      // Erase strokes near pos
      strokes = strokes.filter(function(s) {
        if (s.type === 'pen' && s.points) {
          for (var i = 0; i < s.points.length; i++) {
            var dx = s.points[i].x - pos.x, dy = s.points[i].y - pos.y;
            if (Math.sqrt(dx*dx + dy*dy) < eraseRadius) return false;
          }
        } else if (s.type === 'shape') {
          var cx = s.x + s.w/2, cy = s.y + s.h/2;
          var dx2 = cx - pos.x, dy2 = cy - pos.y;
          if (Math.sqrt(dx2*dx2 + dy2*dy2) < eraseRadius + Math.max(Math.abs(s.w), Math.abs(s.h))/2) return false;
        }
        return true;
      });
      // Erase circles near pos
      circles = circles.filter(function(c) {
        var dx = c.cx - pos.x, dy = c.cy - pos.y;
        return Math.sqrt(dx*dx + dy*dy) > eraseRadius + Math.max(Math.abs(c.rx), Math.abs(c.ry));
      });
      redrawCanvas();
      Network.socket.emit('wb-erase', { whiteboardId: boardId });
    }

    // === TEMPLATES ===
    function applyTemplate(templateName) {
      if (templateLayer) templateLayer.innerHTML = '';
      postits.forEach(function(p) {
        var el = board.querySelector('[data-postit-id="'+p.id+'"]');
        if (el) el.remove();
      });
      postits = []; strokes = []; circles = [];
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

      var cw = drawCanvas.width, ch = drawCanvas.height;
      if (templateName === 'blank') {
        // Nothing
      } else if (templateName === 'retro') {
        // 3 columns: +, -, Actions
        var labels = ['+  Ce qui a bien marché', '−  Ce qui n\'a pas marché', 'Actions à prendre'];
        var colors = ['#6BCB77', '#FF6B6B', '#4D96FF'];
        for (var i = 0; i < 3; i++) {
          var col = document.createElement('div'); col.className = 'db-template-col';
          col.style.left = (cw/3*i) + 'px'; col.style.top = '0'; col.style.width = (cw/3) + 'px'; col.style.height = ch + 'px';
          var lbl = document.createElement('div'); lbl.className = 'db-template-col-label'; lbl.textContent = labels[i];
          lbl.style.color = colors[i];
          col.appendChild(lbl);
          if (templateLayer) templateLayer.appendChild(col);
        }
      } else if (templateName === 'swot') {
        var quadrants = ['Forces', 'Faiblesses', 'Opportunités', 'Menaces'];
        var qcolors = ['#6BCB77', '#FF6B6B', '#4D96FF', '#FFE066'];
        for (var q = 0; q < 4; q++) {
          var qd = document.createElement('div'); qd.className = 'db-template-quadrant';
          qd.style.left = (q%2 === 0 ? 0 : cw/2) + 'px';
          qd.style.top = (q < 2 ? 0 : ch/2) + 'px';
          qd.style.width = (cw/2) + 'px'; qd.style.height = (ch/2) + 'px';
          var ql = document.createElement('div'); ql.className = 'db-template-quadrant-label';
          ql.textContent = quadrants[q]; ql.style.color = qcolors[q];
          qd.appendChild(ql);
          if (templateLayer) templateLayer.appendChild(qd);
        }
      } else if (templateName === 'brainstorm') {
        var bl = document.createElement('div'); bl.className = 'db-template-col';
        bl.style.left = '0'; bl.style.top = '0'; bl.style.width = cw + 'px'; bl.style.height = ch + 'px';
        var blbl = document.createElement('div'); blbl.className = 'db-template-col-label';
        blbl.textContent = 'BRAINSTORMING — Toutes les idées sont bonnes !';
        bl.appendChild(blbl);
        if (templateLayer) templateLayer.appendChild(bl);
      }
      redrawCanvas();
      if (statusText) statusText.textContent = 'Modèle appliqué : ' + templateName;
    }

    // === MOUSE EVENTS ===
    function onDown(e) {
      if (e.target.closest && e.target.closest('.db-postit')) return;
      if (e.target.closest && e.target.closest('.db-text-label')) return;
      var pos = canvasPos(e);
      if (currentTool === 'pen') {
        drawState = { type:'pen', color:penColor, width:penWidth, points:[pos] }; e.preventDefault();
      } else if (currentTool === 'shape') {
        drawState = { type:'shape', shape:shapeType, color:penColor, width:penWidth, startX:pos.x, startY:pos.y, endX:pos.x, endY:pos.y }; e.preventDefault();
      } else if (currentTool === 'circle') {
        drawState = { type:'circle', startX:pos.x, startY:pos.y, endX:pos.x, endY:pos.y }; e.preventDefault();
      } else if (currentTool === 'postit') {
        addNewPostit(pos.x, pos.y); e.preventDefault();
      } else if (currentTool === 'text') {
        addTextLabel(pos.x, pos.y); e.preventDefault();
      } else if (currentTool === 'eraser') {
        drawState = { type:'eraser' }; eraseAt(pos); e.preventDefault();
      } else if (currentTool === 'select') {
        // Pan with any button or shift
        isPanning = true; panStart = {x:e.clientX,y:e.clientY}; panOrig = {x:panX,y:panY}; e.preventDefault();
      }
    }

    function onMove(e) {
      // #47 Smooth cursor trail in Dark Board
      if (typeof UXEnhancements !== 'undefined' && drawState) {
        var trailPos = canvasPos(e);
        UXEnhancements.updateDarkboardCursorTrail(trailPos.x, trailPos.y);
      }
      if (resizeState) {
        var dw = (e.clientX - resizeState.startX) / zoom, dh = (e.clientY - resizeState.startY) / zoom;
        resizeState.el.style.width = Math.max(100, resizeState.origW + dw) + 'px';
        resizeState.el.style.minHeight = Math.max(80, resizeState.origH + dh) + 'px';
        return;
      }
      if (dragState) {
        var dx = (e.clientX-dragState.startX)/zoom, dy = (e.clientY-dragState.startY)/zoom;
        dragState.postit.x = Math.max(0, dragState.origX+dx); dragState.postit.y = Math.max(0, dragState.origY+dy);
        dragState.el.style.left = dragState.postit.x+'px'; dragState.el.style.top = dragState.postit.y+'px'; return;
      }
      if (isPanning) { panX = panOrig.x+(e.clientX-panStart.x); panY = panOrig.y+(e.clientY-panStart.y); applyTransform(); return; }
      if (drawState) {
        var pos = canvasPos(e);
        if (drawState.type === 'pen') drawState.points.push(pos);
        else if (drawState.type === 'eraser') eraseAt(pos);
        else { drawState.endX = pos.x; drawState.endY = pos.y; }
        redrawCanvas();
      }
    }

    function onUp(e) {
      if (resizeState) { resizeState = null; return; }
      if (dragState) {
        dragState.el.classList.remove('db-postit-selected');
        broadcastPostit(dragState.postit); dragState = null; return;
      }
      if (isPanning) { isPanning = false; return; }
      if (drawState) {
        if (drawState.type === 'pen' && drawState.points.length > 1) {
          var stroke = { type:'pen', color:drawState.color, width:drawState.width, points:drawState.points };
          strokes.push(stroke);
          Network.socket.emit('wb-stroke', { whiteboardId:boardId, strokeData:stroke });
        } else if (drawState.type === 'shape') {
          var sw = drawState.endX-drawState.startX, sh = drawState.endY-drawState.startY;
          if (Math.abs(sw)>5 || Math.abs(sh)>5) {
            var shp = { type:'shape', shape:drawState.shape, color:drawState.color, width:drawState.width, x:drawState.startX, y:drawState.startY, w:sw, h:sh };
            strokes.push(shp); Network.socket.emit('wb-stroke', { whiteboardId:boardId, strokeData:shp });
          }
        } else if (drawState.type === 'circle') {
          var cw2 = drawState.endX-drawState.startX, ch2 = drawState.endY-drawState.startY;
          if (Math.abs(cw2)>20 && Math.abs(ch2)>20) {
            var label = prompt('Donnez un nom à ce groupe (facultatif) :') || '';
            var circ = { id:'c_'+Date.now(), cx:drawState.startX+cw2/2, cy:drawState.startY+ch2/2, rx:Math.abs(cw2/2), ry:Math.abs(ch2/2), color:'rgba(255,255,255,0.5)', label:label };
            circles.push(circ); Network.socket.emit('wb-stroke', { whiteboardId:boardId, strokeData:{type:'circle',circle:circ} });
          }
        }
        drawState = null; redrawCanvas();
      }
    }

    function onWheel(e) { e.preventDefault(); zoom = Math.max(0.2, Math.min(3, zoom + (e.deltaY > 0 ? -0.1 : 0.1))); applyTransform(); }

    viewport.addEventListener('mousedown', onDown);
    viewport.addEventListener('mousemove', onMove);
    viewport.addEventListener('mouseup', onUp);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('contextmenu', function(e) { e.preventDefault(); });

    // === KEYBOARD SHORTCUTS ===
    function onKeyDown(e) {
      // Don't trigger when typing in textarea/contenteditable
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
      var key = e.key.toLowerCase();
      var toolMap = { v:'select', n:'postit', p:'pen', s:'shape', t:'text', g:'circle', e:'eraser' };
      if (toolMap[key]) {
        currentTool = toolMap[key];
        overlay.querySelectorAll('.darkboard-tool-icon').forEach(function(b) { b.classList.toggle('active', b.dataset.tool === currentTool); });
        var sp = document.getElementById('darkboard-shape-types');
        var pp = document.getElementById('darkboard-postit-colors');
        if (sp) sp.style.display = currentTool === 'shape' ? 'flex' : 'none';
        if (pp) pp.style.display = currentTool === 'postit' ? 'flex' : 'none';
        if (statusText) { var toolNames = {select:'Sélection',postit:'Post-it',pen:'Stylo',shape:'Forme',text:'Texte',circle:'Cercle de groupe',eraser:'Gomme'}; statusText.textContent = 'Outil : ' + (toolNames[currentTool] || currentTool); }
        e.preventDefault();
      }
      if (e.code === 'Escape') { cleanup(); }
    }
    window.addEventListener('keydown', onKeyDown);

    // === TOOLBAR WIRING ===
    overlay.querySelectorAll('.darkboard-tool-icon').forEach(function(btn) {
      btn.addEventListener('click', function() {
        currentTool = btn.dataset.tool;
        overlay.querySelectorAll('.darkboard-tool-icon').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        var sp = document.getElementById('darkboard-shape-types');
        var pp = document.getElementById('darkboard-postit-colors');
        if (sp) sp.style.display = currentTool === 'shape' ? 'flex' : 'none';
        if (pp) pp.style.display = currentTool === 'postit' ? 'flex' : 'none';
        if (statusText) { var toolNames = {select:'Sélection',postit:'Post-it',pen:'Stylo',shape:'Forme',text:'Texte',circle:'Cercle de groupe',eraser:'Gomme'}; statusText.textContent = 'Outil : ' + (toolNames[currentTool] || currentTool); }
      });
    });
    overlay.querySelectorAll('.darkboard-shape-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { shapeType = btn.dataset.shape;
        overlay.querySelectorAll('.darkboard-shape-btn').forEach(function(b){b.classList.remove('active');}); btn.classList.add('active'); });
    });
    overlay.querySelectorAll('.darkboard-color-dot').forEach(function(btn) {
      btn.onclick = function() { penColor = btn.dataset.color;
        overlay.querySelectorAll('.darkboard-color-dot').forEach(function(b){b.classList.remove('active');}); btn.classList.add('active'); };
    });
    overlay.querySelectorAll('.darkboard-width-btn').forEach(function(btn) {
      btn.onclick = function() { penWidth = parseInt(btn.dataset.width);
        overlay.querySelectorAll('.darkboard-width-btn').forEach(function(b){b.classList.remove('active');}); btn.classList.add('active'); };
    });
    overlay.querySelectorAll('.darkboard-postit-color').forEach(function(btn) {
      btn.onclick = function() { currentColor = btn.dataset.color;
        overlay.querySelectorAll('.darkboard-postit-color').forEach(function(b){b.classList.remove('active');}); btn.classList.add('active'); };
    });

    // === TEMPLATE DROPDOWN ===
    var templateBtn = document.getElementById('darkboard-template-btn');
    var templateMenu = document.getElementById('darkboard-template-menu');
    if (templateBtn && templateMenu) {
      templateBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        templateMenu.style.display = templateMenu.style.display === 'none' ? 'block' : 'none';
      });
      templateMenu.querySelectorAll('.darkboard-dropdown-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          e.stopPropagation();
          applyTemplate(item.dataset.template);
          templateMenu.style.display = 'none';
        });
      });
      overlay.addEventListener('click', function() { templateMenu.style.display = 'none'; });
    }

    // === ISOLOIR MODE ===
    var isoloirBtn = document.getElementById('darkboard-isoloir-btn');
    if (isoloirBtn) isoloirBtn.addEventListener('click', function() {
      isoloirMode = !isoloirMode;
      isoloirBtn.classList.toggle('active', isoloirMode);
      if (isoloirMode) board.classList.add('darkboard-isoloir');
      else board.classList.remove('darkboard-isoloir');
      if (statusText) statusText.textContent = isoloirMode ? 'Mode Isoloir activé — les post-its des autres participants sont masqués' : 'Prêt';
    });

    // === DOT VOTING ===
    var voteBtn = document.getElementById('darkboard-vote-btn');
    if (voteBtn) voteBtn.addEventListener('click', function() {
      dotVotingMode = !dotVotingMode; voteBtn.classList.toggle('active', dotVotingMode);
      if (votesInfo) { votesInfo.style.display = dotVotingMode ? 'inline' : 'none'; votesInfo.textContent = 'Vote par points — ' + myVotes + '/' + maxVotes + ' votes utilisés'; }
      if (dotVotingMode) board.classList.add('darkboard-vote-mode'); else board.classList.remove('darkboard-vote-mode');
    });

    // === EXPORT PNG ===
    var exportBtn = document.getElementById('darkboard-export-btn');
    if (exportBtn) exportBtn.addEventListener('click', function() {
      try { var a = document.createElement('a'); a.download = 'tableau-'+boardId+'.png'; a.href = drawCanvas.toDataURL('image/png'); a.click(); self.showNotification('Tableau exporté en PNG avec succès'); } catch(err) { self.showNotification('Impossible d\'exporter le tableau. Veuillez réessayer.'); }
    });

    // === TIMER ===
    var timerDisp = document.getElementById('darkboard-timer-display');
    var timerSec = 0, timerOn = false, timerInt = null;
    var tsBtn = document.getElementById('darkboard-timer-start');
    var trBtn = document.getElementById('darkboard-timer-reset');
    var tPre = document.getElementById('darkboard-timer-preset');
    function updTimer() {
      if (!timerDisp) return;
      var m = Math.floor(timerSec/60), s = timerSec%60;
      timerDisp.textContent = (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
      // Timer warning/danger states
      timerDisp.classList.remove('timer-warning', 'timer-danger');
      if (timerOn && timerSec <= 10 && timerSec > 0) timerDisp.classList.add('timer-danger');
      else if (timerOn && timerSec <= 30) timerDisp.classList.add('timer-warning');
    }
    if (tsBtn) tsBtn.addEventListener('click', function() {
      if (timerOn) { clearInterval(timerInt); timerOn = false; tsBtn.innerHTML = '&#9654;'; }
      else { if (timerSec<=0 && tPre) timerSec=parseInt(tPre.value)||300; timerOn=true; tsBtn.innerHTML='&#9646;&#9646;';
        timerInt = setInterval(function() { timerSec=Math.max(0,timerSec-1); updTimer();
          if (timerSec<=0) { clearInterval(timerInt); timerOn=false; tsBtn.innerHTML='&#9654;'; self.showNotification('Le minuteur est terminé !'); }
        }, 1000); }
    });
    if (trBtn) trBtn.addEventListener('click', function() { clearInterval(timerInt); timerOn=false; timerSec=parseInt(tPre?tPre.value:300); updTimer(); if(tsBtn)tsBtn.innerHTML='&#9654;'; });
    if (tPre) tPre.addEventListener('change', function() { if(!timerOn){timerSec=parseInt(tPre.value)||0; updTimer();} });
    updTimer();

    // === NETWORK LOAD + SYNC ===
    Network.socket.emit('wb-open', { whiteboardId: boardId }, function(resp) {
      if (resp && resp.success) {
        if (resp.postits) resp.postits.forEach(function(p) { postits.push(p); createPostItEl(p); });
        if (resp.strokes) { resp.strokes.forEach(function(s) {
          if (s.type==='circle'&&s.circle) circles.push(s.circle); else strokes.push(s);
        }); redrawCanvas(); }
      }
    });
    function onRP(data) {
      if (data.whiteboardId !== boardId) return; var pd = data.postitData;
      var ex = postits.find(function(p){return p.id===pd.id;});
      if (ex) { ex.text=pd.text; ex.x=pd.x; ex.y=pd.y; ex.votes=pd.votes||0;
        var el = board.querySelector('[data-postit-id="'+pd.id+'"]');
        if (el) { el.style.left=pd.x+'px'; el.style.top=pd.y+'px';
          var ta=el.querySelector('textarea'); if(ta&&ta!==document.activeElement) ta.value=pd.text;
          var bg=el.querySelector('.db-vote-badge'); if(bg){bg.textContent=ex.votes; bg.style.display=ex.votes>0?'flex':'none';}
        }
      } else { postits.push(pd); createPostItEl(pd); }
    }
    Network.socket.on('wb-postit', onRP);
    function onRS(data) {
      if (data.whiteboardId !== boardId) return;
      if (data.strokeData) { if(data.strokeData.type==='circle'&&data.strokeData.circle) circles.push(data.strokeData.circle); else strokes.push(data.strokeData); redrawCanvas(); }
    }
    Network.socket.on('wb-stroke', onRS);
    function onRPDel(data) {
      if (data.whiteboardId !== boardId) return;
      postits = postits.filter(function(p) { return p.id !== data.postitId; });
      var el = board.querySelector('[data-postit-id="' + data.postitId + '"]');
      if (el) el.remove();
    }
    Network.socket.on('wb-postit-delete', onRPDel);
    function onRErase(data) {
      if (data.whiteboardId !== boardId) return;
      strokes = []; circles = []; redrawCanvas();
    }
    Network.socket.on('wb-erase', onRErase);

    // === CLEANUP (removes ALL listeners) ===
    function cleanup() {
      overlay.style.display = 'none';
      viewport.removeEventListener('mousedown', onDown);
      viewport.removeEventListener('mousemove', onMove);
      viewport.removeEventListener('mouseup', onUp);
      viewport.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      Network.socket.off('wb-postit', onRP);
      Network.socket.off('wb-stroke', onRS);
      Network.socket.off('wb-postit-delete', onRPDel);
      Network.socket.off('wb-erase', onRErase);
      Network.socket.emit('wb-close', { whiteboardId: boardId });
      if (timerInt) clearInterval(timerInt);
      board.classList.remove('darkboard-vote-mode', 'darkboard-isoloir');
    }

    var closeBtn = document.getElementById('postit-close');
    if (closeBtn) closeBtn.onclick = cleanup;
    // #35 Show connected users count in dark board status bar
    var userCount = 1 + Network.remotePlayers.size;
    if (statusText) statusText.textContent = 'Pr\u00eat \u2014 ' + userCount + ' utilisateur' + (userCount > 1 ? 's' : '') + ' connect\u00e9' + (userCount > 1 ? 's' : '') + ' \u2014 Raccourcis : V N P S T G E | \u00c9chap pour fermer';
  },



  // ===== WHITEBOARD POP-IN =====

  openWhiteboard: function(whiteboardId, furnitureItem) {
    var self = this;
    var overlay = document.getElementById('whiteboard-overlay');
    if (!overlay) return;

    this.activeWhiteboardId = whiteboardId;
    overlay.style.display = 'flex';

    // #34 Show "last edited by" in whiteboard header
    var wbHeader = overlay.querySelector('.whiteboard-header h3');
    if (wbHeader) wbHeader.innerHTML = 'Tableau blanc collaboratif <span id="wb-last-edited" style="font-size:0.7rem;color:#999;font-weight:normal;margin-left:8px;"></span>';

    var canvas = document.getElementById('whiteboard-canvas');
    var ctx = canvas.getContext('2d');
    canvas.width = 900;
    canvas.height = 600;

    // Drawing state
    var drawing = false;
    var lastX = 0, lastY = 0;
    var currentColor = '#333333';
    var currentWidth = 3;
    var strokes = [];
    var currentStroke = null;

    // Clear canvas
    function clearCanvas() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Draw grid
      ctx.strokeStyle = '#f0f0f0';
      ctx.lineWidth = 0.5;
      for (var x = 0; x < canvas.width; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (var y = 0; y < canvas.height; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
    }

    function redraw() {
      clearCanvas();
      for (var i = 0; i < strokes.length; i++) {
        drawStroke(strokes[i]);
      }
    }

    function drawStroke(stroke) {
      if (!stroke.points || stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color || '#333';
      ctx.lineWidth = stroke.width || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (var j = 1; j < stroke.points.length; j++) {
        ctx.lineTo(stroke.points[j].x, stroke.points[j].y);
      }
      ctx.stroke();
    }

    // Load existing strokes from server
    Network.socket.emit('wb-open', { whiteboardId: whiteboardId }, function(resp) {
      if (resp.success && resp.strokes) {
        strokes = resp.strokes;
        redraw();
      }
    });

    // Listen for remote strokes
    function onRemoteStroke(data) {
      if (data.whiteboardId !== whiteboardId) return;
      strokes.push(data.strokeData);
      drawStroke(data.strokeData);
      // #34 Update "last edited by"
      var lastEditEl = document.getElementById('wb-last-edited');
      if (lastEditEl && data.pseudo) lastEditEl.textContent = 'Derni\u00e8re modification par ' + data.pseudo;
    }
    Network.socket.on('wb-stroke', onRemoteStroke);

    function onRemoteUndo(data) {
      if (data.whiteboardId !== whiteboardId) return;
      strokes.splice(data.index, 1);
      redraw();
    }
    Network.socket.on('wb-undo', onRemoteUndo);

    function onRemoteClear(data) {
      if (data.whiteboardId !== whiteboardId) return;
      strokes = [];
      redraw();
    }
    Network.socket.on('wb-cleared', onRemoteClear);

    // Mouse events
    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
    }

    function onDown(e) {
      drawing = true;
      var p = getPos(e);
      lastX = p.x; lastY = p.y;
      currentStroke = { color: currentColor, width: currentWidth, points: [{ x: p.x, y: p.y }] };
    }

    function onMove(e) {
      if (!drawing) return;
      var p = getPos(e);
      ctx.beginPath();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentWidth;
      ctx.lineCap = 'round';
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x; lastY = p.y;
      currentStroke.points.push({ x: p.x, y: p.y });
      // Send cursor position
      Network.socket.emit('wb-cursor', { whiteboardId: whiteboardId, x: p.x, y: p.y });
    }

    function onUp() {
      if (!drawing) return;
      drawing = false;
      if (currentStroke && currentStroke.points.length > 1) {
        strokes.push(currentStroke);
        Network.socket.emit('wb-stroke', { whiteboardId: whiteboardId, strokeData: currentStroke });
      }
      currentStroke = null;
    }

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);

    // Color buttons
    var colorBtns = overlay.querySelectorAll('.wb-color-btn');
    colorBtns.forEach(function(btn) {
      btn.onclick = function() {
        currentColor = btn.dataset.color;
        colorBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      };
    });

    // Width buttons
    var widthBtns = overlay.querySelectorAll('.wb-width-btn');
    widthBtns.forEach(function(btn) {
      btn.onclick = function() {
        currentWidth = parseInt(btn.dataset.width);
        widthBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      };
    });

    // Undo
    var undoBtn = document.getElementById('wb-undo');
    if (undoBtn) undoBtn.onclick = function() {
      Network.socket.emit('wb-undo', { whiteboardId: whiteboardId });
    };

    // Clear
    var clearBtn = document.getElementById('wb-clear');
    if (clearBtn) clearBtn.onclick = function() {
      if (confirm('Voulez-vous vraiment effacer tout le tableau ? Cette action est irréversible.')) {
        Network.socket.emit('wb-clear', { whiteboardId: whiteboardId }, function() {});
      }
    };

    // Close
    var closeBtn = document.getElementById('wb-close');
    function onEsc(e) {
      if (e.code === 'Escape') cleanup();
    }
    function cleanup() {
      overlay.style.display = 'none';
      self.activeWhiteboardId = null;
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onUp);
      window.removeEventListener('keydown', onEsc);
      Network.socket.off('wb-stroke', onRemoteStroke);
      Network.socket.off('wb-undo', onRemoteUndo);
      Network.socket.off('wb-cleared', onRemoteClear);
      Network.socket.emit('wb-close', { whiteboardId: whiteboardId });
    }
    if (closeBtn) closeBtn.onclick = cleanup;
    window.addEventListener('keydown', onEsc);

    // Close on overlay backdrop click
    function onOverlayClick(e) { if (e.target === overlay) cleanup(); }
    overlay.addEventListener('click', onOverlayClick);

    clearCanvas();
  },

  // ===== COLLABORATION SPACE =====

  activeCollabSpace: null,
  collabConnections: new Map(), // socketId -> { connection, videoElement }
  collabLocalStream: null,

  openCollabSpace: function(spaceId, title) {
    var self = this;
    var overlay = document.getElementById('collab-space-overlay');
    if (!overlay) return;
    this.activeCollabSpace = spaceId;
    overlay.style.display = 'flex';
    var titleEl = document.getElementById('collab-space-title');
    if (titleEl) titleEl.textContent = title || 'Espace Collaboratif';

    var grid = document.getElementById('collab-space-grid');
    grid.innerHTML = '<div class="collab-screen-tile collab-screen-empty"><p>Aucun partage d\'écran en cours</p><p style="font-size:0.75rem;color:#666;">Cliquez sur \u00ab Partager mon écran \u00bb pour commencer</p></div>';

    Network.socket.emit('join-collab-space', { spaceId: spaceId });

    var shareBtn = document.getElementById('collab-share-screen-btn');
    if (shareBtn) shareBtn.onclick = function() {
      if (self.collabLocalStream) {
        self.stopCollabScreenShare();
      } else {
        self.startCollabScreenShare(spaceId);
      }
    };

    var closeBtn = document.getElementById('collab-space-close');
    function onEsc(e) {
      if (e.code === 'Escape') closeAndCleanup();
    }
    function closeAndCleanup() {
      self.closeCollabSpace(spaceId);
      window.removeEventListener('keydown', onEsc);
    }
    if (closeBtn) closeBtn.onclick = closeAndCleanup;
    window.addEventListener('keydown', onEsc);
  },

  closeCollabSpace: function(spaceId) {
    var overlay = document.getElementById('collab-space-overlay');
    if (overlay) overlay.style.display = 'none';
    this.stopCollabScreenShare();
    // Close all incoming connections
    for (var [sid, conn] of this.collabConnections) {
      if (conn.connection) conn.connection.close();
    }
    this.collabConnections.clear();
    Network.socket.emit('leave-collab-space', { spaceId: spaceId });
    this.activeCollabSpace = null;
  },

  async startCollabScreenShare(spaceId) {
    try {
      this.collabLocalStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
      this.collabLocalStream.getVideoTracks()[0].onended = () => { this.stopCollabScreenShare(); };

      // Add own video tile
      this.addCollabScreenTile(Network.mySocketId, Engine.player.pseudo, this.collabLocalStream);

      Network.socket.emit('collab-screen-share-start', { spaceId: spaceId });

      // Send to all users in the space
      for (var [sid] of Network.remotePlayers) {
        this.sendCollabStream(spaceId, sid);
      }

      var btn = document.getElementById('collab-share-screen-btn');
      if (btn) { btn.textContent = '⏹ Arrêter le partage'; btn.style.background = '#e74c3c'; }
    } catch (e) {
      console.warn('Collab screen share failed:', e.message);
    }
  },

  stopCollabScreenShare: function() {
    if (this.collabLocalStream) {
      this.collabLocalStream.getTracks().forEach(function(t) { t.stop(); });
      this.collabLocalStream = null;
    }
    // Remove own tile
    var ownTile = document.getElementById('collab-tile-' + Network.mySocketId);
    if (ownTile) ownTile.remove();
    this.checkEmptyCollabGrid();

    if (this.activeCollabSpace) {
      Network.socket.emit('collab-screen-share-stop', { spaceId: this.activeCollabSpace });
    }
    var btn = document.getElementById('collab-share-screen-btn');
    if (btn) { btn.textContent = '📺 Partager mon écran'; btn.style.background = ''; }
  },

  addCollabScreenTile: function(socketId, pseudo, stream) {
    var grid = document.getElementById('collab-space-grid');
    if (!grid) return;
    // Remove empty placeholder
    var empty = grid.querySelector('.collab-screen-empty');
    if (empty) empty.remove();

    // Check if tile already exists
    if (document.getElementById('collab-tile-' + socketId)) return;

    var tile = document.createElement('div');
    tile.className = 'collab-screen-tile';
    tile.id = 'collab-tile-' + socketId;

    var video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    if (stream) video.srcObject = stream;

    var label = document.createElement('div');
    label.className = 'screen-label';
    label.textContent = pseudo || 'Participant anonyme';

    tile.appendChild(video);
    tile.appendChild(label);
    grid.appendChild(tile);
    return video;
  },

  checkEmptyCollabGrid: function() {
    var grid = document.getElementById('collab-space-grid');
    if (!grid) return;
    if (grid.querySelectorAll('.collab-screen-tile:not(.collab-screen-empty)').length === 0) {
      grid.innerHTML = '<div class="collab-screen-tile collab-screen-empty"><p>Aucun partage d\'écran en cours</p><p style="font-size:0.75rem;color:#666;">Cliquez sur \u00ab Partager mon écran \u00bb pour commencer</p></div>';
    }
  },

  async sendCollabStream(spaceId, targetSocketId) {
    if (!this.collabLocalStream) return;
    var config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    var connection = new RTCPeerConnection(config);

    this.collabLocalStream.getTracks().forEach(function(track) {
      connection.addTrack(track);
    });

    connection.onicecandidate = function(e) {
      if (e.candidate) {
        Network.socket.emit('collab-rtc-ice', { targetSocketId: targetSocketId, spaceId: spaceId, candidate: e.candidate });
      }
    };

    try {
      var offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      Network.socket.emit('collab-rtc-offer', { targetSocketId: targetSocketId, spaceId: spaceId, offer: connection.localDescription });
      this.collabConnections.set('out_' + targetSocketId, { connection: connection });
    } catch (e) {
      console.error('Collab RTC offer error:', e);
    }
  },

  async handleCollabRtcOffer(data) {
    if (!this.activeCollabSpace || this.activeCollabSpace !== data.spaceId) return;
    var config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    var connection = new RTCPeerConnection(config);
    var self = this;

    connection.ontrack = function(event) {
      var rp = Network.remotePlayers.get(data.fromSocketId);
      var pseudo = rp ? rp.pseudo : 'Anonyme';
      var video = self.addCollabScreenTile(data.fromSocketId, pseudo, null);
      if (video) video.srcObject = event.streams[0];
    };

    connection.onicecandidate = function(e) {
      if (e.candidate) {
        Network.socket.emit('collab-rtc-ice', { targetSocketId: data.fromSocketId, spaceId: data.spaceId, candidate: e.candidate });
      }
    };

    try {
      await connection.setRemoteDescription(new RTCSessionDescription(data.offer));
      var answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      Network.socket.emit('collab-rtc-answer', { targetSocketId: data.fromSocketId, spaceId: data.spaceId, answer: connection.localDescription });
      this.collabConnections.set('in_' + data.fromSocketId, { connection: connection });
    } catch (e) {
      console.error('Collab RTC answer error:', e);
    }
  },

  async handleCollabRtcAnswer(data) {
    var conn = this.collabConnections.get('out_' + data.fromSocketId);
    if (!conn) return;
    try {
      await conn.connection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (e) {
      console.error('Collab RTC answer set error:', e);
    }
  },

  async handleCollabRtcIce(data) {
    var conn = this.collabConnections.get('out_' + data.fromSocketId) || this.collabConnections.get('in_' + data.fromSocketId);
    if (!conn) return;
    try {
      await conn.connection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) { /* ignore */ }
  },

  updateCollabSpaceUsers: function(data) {
    if (!this.activeCollabSpace || this.activeCollabSpace !== data.spaceId) return;
    var el = document.getElementById('collab-space-users');
    if (el) el.textContent = data.users.length + ' participant' + (data.users.length > 1 ? 's' : '');
  },

  onCollabScreenStarted: function(data) {
    if (!this.activeCollabSpace || this.activeCollabSpace !== data.spaceId) return;
    // The sender will send us an RTC offer
  },

  onCollabScreenStopped: function(data) {
    if (!this.activeCollabSpace || this.activeCollabSpace !== data.spaceId) return;
    var tile = document.getElementById('collab-tile-' + data.socketId);
    if (tile) tile.remove();
    var conn = this.collabConnections.get('in_' + data.socketId);
    if (conn && conn.connection) conn.connection.close();
    this.collabConnections.delete('in_' + data.socketId);
    this.checkEmptyCollabGrid();
  },

  // ===== SUB-ROOMS =====

  showSubRoomMenu: function(x, y, subRoomId, sr) {
    this.hideContextMenu();
    var menu = document.getElementById('context-menu');
    if (!menu) return;
    var self = this;

    var html = '<div class="ctx-menu-header">🚪 ' + (sr.name || 'Sous-salle') + '</div>';
    html += '<div class="ctx-menu-item" data-action="enter-subroom">Entrer dans la sous-salle</div>';
    html += '<div class="ctx-menu-item" data-action="move-subroom">Déplacer devant mon avatar</div>';
    html += '<div class="ctx-menu-item" data-action="rename-subroom">Renommer la sous-salle</div>';
    html += '<div class="ctx-menu-item ctx-menu-danger" data-action="delete-subroom">Supprimer</div>';

    menu.innerHTML = html;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.display = 'block';
    this.contextMenuOpen = true;

    menu.querySelectorAll('.ctx-menu-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var action = el.dataset.action;
        if (action === 'enter-subroom') {
          var subUrl = '/client/room.html?room=' + Engine.roomConfig.roomId + '_' + subRoomId + '&name=' + encodeURIComponent(sr.name) + '&env=' + Engine.roomConfig.environment + '&size=15&creator=true';
          Network.socket.emit('join-sub-room', { subRoomId: subRoomId });
          window.open(subUrl, '_blank');
        } else if (action === 'move-subroom') {
          sr.x = Math.floor(Engine.player.x) + 2;
          sr.y = Math.floor(Engine.player.y);
          self.showNotification('Sous-salle déplacée avec succès');
        } else if (action === 'rename-subroom') {
          var newName = prompt('Nouveau nom de la sous-salle :', sr.name);
          if (newName) {
            sr.name = newName;
            self.showNotification('Sous-salle renommée : « ' + newName + ' »');
          }
        } else if (action === 'delete-subroom') {
          if (confirm('Voulez-vous vraiment supprimer la sous-salle « ' + sr.name + ' » ?')) {
            Network.socket.emit('delete-sub-room', { subRoomId: subRoomId }, function(r) {
              if (r && r.success) {
                Engine.subRooms.delete(subRoomId);
                self.showNotification('Sous-salle supprimée');
                self.refreshSubRoomsList();
              }
            });
          }
        }
        self.hideContextMenu();
      });
    });
  },

  openSubRoomDialog: function() {
    var name = prompt('Donnez un nom à la nouvelle sous-salle :');
    if (!name) return;
    var px = Math.floor(Engine.player.x) + 2;
    var py = Math.floor(Engine.player.y);
    Network.socket.emit('create-sub-room', { name: name, x: px, y: py, width: 3, height: 3 }, function(r) {
      if (r && r.success) {
        Engine.subRooms.set(r.subRoom.id, r.subRoom);
        UI.showNotification('Sous-salle « ' + name + ' » créée avec succès');
      }
    });
  },

  // ===== EDIT MODE TOOLBAR =====

  // Icônes du mobilier, partagées entre catalogue admin et palette d'édition
  furnitureIcons: {
    desk: '🪑', chair: '💺', plant: '🌿', palmTree: '🌴', partition: '🔲',
    largeTable: '📐', roundTable: '⭕', screen: '🖥️', couch: '🛋️',
    coffeeTable: '☕', bookshelf: '📚', whiteboard: '📋', postItBoard: '📌',
    stage: '🎭', smallStage: '🎭', podium: '🎤', projector: '📽️', waterCooler: '🚰',
    filingCabinet: '🗄️', standingDesk: '🖥️', lamp: '💡',
    collabSpace: '🤝', carpet: '🟫', largeCarpet: '🟫',
    door: '🚪', conferencePhone: '📞', trashBin: '🗑️', clock: '🕐',
  },

  showEditToolbar(show) {
    var toolbar = document.getElementById('edit-toolbar');
    if (!toolbar) return;
    toolbar.style.display = show ? 'flex' : 'none';

    var palette = document.getElementById('edit-palette');
    if (palette) palette.style.display = show ? 'flex' : 'none';

    if (show) {
      this.buildEditCatalog();
      this.buildEditPalette();
      this.updateEditToolButtons();
      var gridInfo = document.getElementById('edit-grid-info');
      if (gridInfo) gridInfo.textContent = Board.gridSize + 'x' + Board.gridSize;
    }

    // Hide/show normal toolbar
    var normalToolbar = document.getElementById('toolbar');
    if (normalToolbar) normalToolbar.style.display = show ? 'none' : 'flex';
  },

  // Palette visuelle : cliquer sélectionne, glisser-déposer place directement.
  buildEditPalette() {
    var palette = document.getElementById('edit-palette');
    if (!palette || palette.dataset.built) return;
    palette.dataset.built = '1';
    var self = this;

    var title = document.createElement('div');
    title.className = 'edit-palette-title';
    title.textContent = 'Mobilier — cliquez ou glissez dans la salle';
    palette.appendChild(title);

    var grid = document.createElement('div');
    grid.className = 'edit-palette-grid';
    palette.appendChild(grid);

    for (var type in Environments.furnitureTypes) {
      var def = Environments.furnitureTypes[type];
      if (def.isZone) continue;
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'edit-palette-card';
      card.draggable = true;
      card.dataset.type = type;
      card.title = def.name + ' (' + (def.width || 1) + '×' + (def.height || 1) + ')';
      card.innerHTML = '<span class="epc-ic">' + (this.furnitureIcons[type] || '📦') + '</span>' +
        '<span class="epc-name">' + def.name + '</span>' +
        '<span class="epc-size">' + (def.width || 1) + '×' + (def.height || 1) + '</span>';

      card.addEventListener('click', (function(t, c) {
        return function() {
          Engine.editSelectedType = t;
          Engine.editTool = 'place';
          self.updateEditToolButtons();
          grid.querySelectorAll('.edit-palette-card').forEach(function(x) { x.classList.remove('sel'); });
          c.classList.add('sel');
          var sel = document.getElementById('edit-catalog-select');
          if (sel) sel.value = t;
        };
      })(type, card));

      card.addEventListener('dragstart', (function(t, c) {
        return function(e) {
          Engine._dragFurnitureType = t;
          Engine.editSelectedType = t;
          Engine.editTool = 'place';
          c.classList.add('dragging');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', t);
          }
        };
      })(type, card));
      card.addEventListener('dragend', (function(c) {
        return function() { c.classList.remove('dragging'); Engine._dragFurnitureType = null; };
      })(card));

      grid.appendChild(card);
    }
  },

  buildEditCatalog() {
    var select = document.getElementById('edit-catalog-select');
    if (!select) return;

    var html = '<option value="">-- Choisir un type de mobilier --</option>';
    for (var type in Environments.furnitureTypes) {
      var def = Environments.furnitureTypes[type];
      if (def.isZone) continue;
      html += '<option value="' + type + '">' + def.name + ' (' + (def.width || 1) + 'x' + (def.height || 1) + ')</option>';
    }
    select.innerHTML = html;

    if (Engine.editSelectedType) {
      select.value = Engine.editSelectedType;
    }
  },

  updateEditToolButtons() {
    var btns = document.querySelectorAll('.edit-tool-btn');
    btns.forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.tool === Engine.editTool);
    });
  },

  initEditToolbar() {
    var self = this;

    var select = document.getElementById('edit-catalog-select');
    if (select) {
      select.addEventListener('change', function() {
        Engine.editSelectedType = select.value || null;
        if (Engine.editSelectedType) {
          Engine.editTool = 'place';
          self.updateEditToolButtons();
        }
      });
    }

    document.querySelectorAll('.edit-tool-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        Engine.editTool = btn.dataset.tool;
        self.updateEditToolButtons();
        if (btn.dataset.tool !== 'place') {
          Engine.editSelectedType = null;
          if (select) select.value = '';
        }
      });
    });

    var quitBtn = document.getElementById('edit-quit-btn');
    if (quitBtn) {
      quitBtn.addEventListener('click', function() {
        Engine.toggleEditMode();
      });
    }

  },

  // ===== TIMER DISPLAY =====

  showTimer(timer) {
    const el = document.getElementById('timer-display');
    const globalEl = document.getElementById('timer-display-global');
    if (el) el.style.display = 'block';
    if (globalEl) globalEl.style.display = 'block';
    this.activeTimer = timer;
    var cancelBtn = document.getElementById('btn-cancel-timer');
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
    this.updateTimerDisplay();
  },

  updateTimerDisplay() {
    const el = document.getElementById('timer-display');
    const globalEl = document.getElementById('timer-display-global');
    const globalTime = document.getElementById('timer-global-time');
    const globalLabel = document.getElementById('timer-global-label');
    if (!this.activeTimer) return;

    const t = this.activeTimer;
    if (!t.running) {
      if (el) {
        el.innerHTML = '<span class="timer-text">Terminé !</span>';
        setTimeout(() => { el.style.display = 'none'; }, 5000);
      }
      if (globalEl) {
        globalEl.classList.remove('timer-warning', 'timer-critical');
        if (globalTime) globalTime.textContent = 'Terminé !';
        setTimeout(() => { globalEl.style.display = 'none'; }, 5000);
      }
      return;
    }

    const remaining = t.paused ? (t.remaining || t.duration) : Math.max(0, t.duration - (Date.now() - t.startedAt) / 1000);
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    const timeStr = mins + ':' + secs.toString().padStart(2, '0');

    if (el) {
      el.innerHTML = '<span class="timer-text">' + (t.paused ? 'En pause — ' : '') + timeStr + '</span>';
    }

    if (globalEl && globalTime) {
      globalTime.textContent = (t.paused ? '⏸ ' : '') + timeStr;
      globalEl.classList.remove('timer-warning', 'timer-critical');
      if (remaining <= 10) {
        globalEl.classList.add('timer-critical');
      } else if (remaining <= 30) {
        globalEl.classList.add('timer-warning');
      }
    }

    // #29 Audible tick in last 10 seconds
    if (remaining <= 10 && remaining > 0 && !t.paused) {
      Engine.initSfx();
      Engine.playSfx('click');
    }

    if (remaining <= 0) {
      t.running = false;
      if (el) el.innerHTML = '<span class="timer-text timer-ended">Termin\u00e9 !</span>';
      if (globalTime) globalTime.textContent = 'Termin\u00e9 !';
    }

    // Add stop button for admins on the global timer display
    if (globalEl && Engine.player && Engine.player.isAdmin && t.running) {
      var stopBtn = globalEl.querySelector('.timer-stop-btn');
      if (!stopBtn) {
        stopBtn = document.createElement('button');
        stopBtn.className = 'timer-stop-btn';
        stopBtn.title = 'Arrêter le minuteur';
        stopBtn.textContent = '✕';
        stopBtn.style.cssText = 'margin-left:8px;background:#e74c3c;color:#fff;border:none;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:14px;line-height:24px;padding:0;vertical-align:middle;';
        stopBtn.addEventListener('click', function() {
          if (UI.activeTimer) {
            Network.socket.emit('cancel-timer', { timerId: UI.activeTimer.id }, function() {});
          }
        });
        globalEl.appendChild(stopBtn);
      }
    }
  },

  hideTimer() {
    const el = document.getElementById('timer-display');
    const globalEl = document.getElementById('timer-display-global');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    if (globalEl) {
      globalEl.style.display = 'none';
      globalEl.classList.remove('timer-warning', 'timer-critical');
      var stopBtn = globalEl.querySelector('.timer-stop-btn');
      if (stopBtn) stopBtn.remove();
      var globalTime = document.getElementById('timer-global-time');
      if (globalTime) globalTime.textContent = '00:00';
    }
    var cancelBtn = document.getElementById('btn-cancel-timer');
    if (cancelBtn) cancelBtn.style.display = 'none';
  },
};
