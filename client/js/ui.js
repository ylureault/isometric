// UI: Complete HUD, admin panel, context menu, notifications, toolbar, reactions, shortcuts

const UI = {
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
      input.addEventListener('input', () => { this.currentColors[key] = input.value; });
    }

    let animTime = 0;
    const animatePreview = () => {
      animTime += 0.016;
      Character.drawPreview(this.previewCtx, this.previewCanvas.width, this.previewCanvas.height, this.currentColors, animTime);
      this.previewAnimId = requestAnimationFrame(animatePreview);
    };
    animatePreview();

    document.getElementById('btn-enter').addEventListener('click', () => {
      const pseudo = document.getElementById('pseudo-input').value.trim();
      const errorEl = document.getElementById('error-pseudo');
      if (!pseudo) { errorEl.style.display = 'block'; return; }
      errorEl.style.display = 'none';

      if (this.previewAnimId) cancelAnimationFrame(this.previewAnimId);
      this.avatarConfig.style.display = 'none';
      document.getElementById('hud').style.display = 'flex';
      document.getElementById('minimap-container').style.display = 'block';
      document.getElementById('toolbar').style.display = 'flex';

      var accessorySelect = document.getElementById('accessory-select');
      var accessory = accessorySelect ? accessorySelect.value : 'none';
      onEnter({ pseudo, colors: { ...this.currentColors }, accessory: accessory });
    });
  },

  showRoomInfo(info) {
    const el = document.getElementById('room-info-display');
    if (el) {
      el.textContent = `${info.name} — ${info.participantCount}/${info.maxParticipants} participants`;
      el.style.display = 'block';
    }
  },

  showError(message) {
    const overlay = document.getElementById('avatar-config');
    if (overlay) {
      overlay.innerHTML = `
        <div class="avatar-config-panel" style="flex-direction: column; align-items: center; text-align: center;">
          <h2 style="color: #e74c3c;">Erreur</h2>
          <p style="color: #aaa; margin: 16px 0;">${message}</p>
          <a href="/client/index.html" class="btn btn-secondary" style="text-decoration: none;">Retour à l'accueil</a>
        </div>`;
    }
  },

  showCopyLink(roomId) {
    const container = document.getElementById('copy-link-container');
    if (container) {
      container.style.display = 'flex';
      const urlDisplay = document.getElementById('room-url-display');
      if (urlDisplay) urlDisplay.textContent = `${window.location.origin}/client/room.html?room=${roomId}`;
    }
  },

  // ===== HUD =====

  updateHUD(roomName, playerX, playerY, participantCount, zoom) {
    const el1 = document.getElementById('hud-room-name');
    const el2 = document.getElementById('hud-coords');
    const el3 = document.getElementById('hud-participants');
    if (el1) el1.textContent = roomName || 'Room';
    if (el2) el2.textContent = `${Math.floor(playerX)}, ${Math.floor(playerY)}  ·  x${(zoom || 1).toFixed(1)}`;
    if (el3) el3.textContent = `${participantCount} participant${participantCount > 1 ? 's' : ''}`;
  },

  // ===== TOOLBAR =====

  initToolbar() {
    // Mute button
    document.getElementById('btn-mute')?.addEventListener('click', () => {
      const muted = Audio.toggleMute();
      this.updateMuteButton(muted);
    });

    // Volume slider
    document.getElementById('volume-slider')?.addEventListener('input', (e) => {
      Audio.setMasterVolume(parseFloat(e.target.value) / 100);
    });

    // Radius slider
    document.getElementById('radius-slider')?.addEventListener('input', (e) => {
      Engine.player.audioRadius = parseInt(e.target.value);
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

    // View toggle button
    document.getElementById('btn-view-toggle')?.addEventListener('click', () => {
      Engine.viewMode = Engine.viewMode === 'iso' ? 'topdown' : 'iso';
      this.showNotification('Vue: ' + (Engine.viewMode === 'iso' ? 'Isométrique' : 'Vue de dessus'));
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
      if (confirm('Quitter la room ?')) {
        Network.leaveRoom();
        Audio.destroy();
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

  // ===== NOTIFICATIONS =====

  showNotification(text) {
    const container = document.getElementById('notifications-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'notification';
    el.textContent = text;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('notification-show'));
    setTimeout(() => {
      el.classList.remove('notification-show');
      el.classList.add('notification-hide');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, CONSTANTS.NOTIFICATION_DURATION);
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

    let html = `<div class="ctx-menu-header">${targetData.pseudo}</div>`;

    if (isLocalAdmin && !targetIsCreator && targetSocketId !== Network.mySocketId) {
      if (!targetIsAdmin) {
        html += `<div class="ctx-menu-item" data-action="promote">Promouvoir admin</div>`;
      } else if (isLocalCreator) {
        html += `<div class="ctx-menu-item" data-action="demote">Retirer le rôle admin</div>`;
      }
      html += `<div class="ctx-menu-item ctx-menu-danger" data-action="kick">Exclure</div>`;
    }

    if (isLocalAdmin) {
      html += `<div class="ctx-menu-item" data-action="spotlight">Spotlight</div>`;
    }

    html += `<div class="ctx-menu-item" data-action="profile">Voir le profil</div>`;

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
    html += '<div class="ctx-menu-item" data-action="move-here">Déplacer devant moi</div>';
    html += '<div class="ctx-menu-item" data-action="duplicate">Dupliquer</div>';
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

  hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.style.display = 'none';
    this.contextMenuOpen = false;
  },

  handleContextAction(action, targetSocketId, targetData) {
    switch (action) {
      case 'promote':
        Network.socket.emit('promote-admin', { targetSocketId }, (resp) => {
          if (resp.success) this.showNotification(`${targetData.pseudo} est maintenant administrateur`);
        });
        break;
      case 'demote':
        Network.socket.emit('demote-admin', { targetSocketId }, (resp) => {
          if (resp.success) this.showNotification(`Rôle admin retiré à ${targetData.pseudo}`);
        });
        break;
      case 'kick':
        if (confirm(`Exclure ${targetData.pseudo} de la room ?`)) {
          Network.socket.emit('kick-participant', { targetSocketId }, (resp) => {
            if (resp.success) this.showNotification(`${targetData.pseudo} a été exclu`);
          });
        }
        break;
      case 'spotlight':
        Network.socket.emit('spotlight', { targetSocketId, active: true });
        break;
      case 'profile':
        this.showNotification(`${targetData.pseudo} — ${targetData.role}`);
        break;
    }
  },

  // ===== ADMIN PANEL =====

  toggleAdminPanel() {
    this.adminPanelOpen = !this.adminPanelOpen;
    const panel = document.getElementById('admin-panel');
    if (panel) panel.classList.toggle('open', this.adminPanelOpen);
    if (this.adminPanelOpen) this.refreshAdminPanel();
  },

  refreshAdminPanel() {
    this.refreshParticipantsList();
    this.updateAdminSettings();
    this.initMobilierTab();
    this.refreshFurnitureList();
    this.refreshTablesList();
    this.refreshSubRoomsList();
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
          if (p && confirm(`Exclure ${p.pseudo} ?`)) {
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
    const name = isMe ? `${p.pseudo} (vous)` : p.pseudo;
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

    return `<div class="participant-row">${badge}${name} ${muteBadge}${handBadge}${dc}<div class="participant-actions">${actions}</div></div>`;
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
            self.showNotification(Environments.furnitureTypes[type].name + ' ajouté');
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
          self.showNotification('Table "' + name + '" créée');
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

    var html = '';
    Engine.tables.forEach(function(t, id) {
      html += '<div class="placed-item">';
      html += '<span style="font-size:0.8rem;">📐 ' + (t.name || 'Table') + '</span>';
      html += '<button class="admin-action-btn danger" data-action="delete-table" data-id="' + id + '" title="Supprimer">✕</button>';
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
            UI.showNotification('Table supprimée');
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
    if (!html) html = '<p style="font-size:0.75rem;color:#999;">Aucune sous-salle</p>';
    list.innerHTML = html;

    list.querySelectorAll('[data-action="delete-subroom"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var srid = btn.dataset.id;
        if (confirm('Supprimer cette sous-salle ?')) {
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
          self.showNotification('Taille invalide (' + CONSTANTS.GRID_MIN + '-' + CONSTANTS.GRID_MAX + ')');
          return;
        }
        gridBtn.disabled = true;
        gridBtn.textContent = 'Application...';
        Network.socket.emit('resize-grid', { size: s }, function(r) {
          gridBtn.disabled = false;
          gridBtn.textContent = 'Appliquer';
          if (r && r.success) {
            self.showNotification('Grille redimensionnée : ' + s + 'x' + s);
            var status = document.getElementById('grid-apply-status');
            if (status) { status.style.display = 'inline'; setTimeout(function() { status.style.display = 'none'; }, 2000); }
            self.updateAdminSettings();
          } else {
            self.showNotification('Erreur : ' + (r && r.error || 'inconnu'));
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
        if (!confirm('Le mobilier actuel sera remplacé. Continuer ?')) return;
        envBtn.disabled = true;
        envBtn.textContent = 'Changement...';
        Network.socket.emit('change-environment', { environment: env }, function(r) {
          envBtn.disabled = false;
          envBtn.textContent = 'Changer';
          if (r && r.success) {
            self.showNotification('Environnement changé : ' + env);
            self.updateAdminSettings();
            self.refreshFurnitureList();
          } else {
            self.showNotification('Erreur : ' + (r && r.error || 'inconnu'));
          }
        });
      });
    }
  },

  // ===== SHORTCUTS MODAL =====

  toggleShortcutsModal() {
    this.shortcutsModalOpen = !this.shortcutsModalOpen;
    const modal = document.getElementById('shortcuts-modal');
    if (modal) modal.style.display = this.shortcutsModalOpen ? 'flex' : 'none';
  },

  // ===== VOTE POPUP =====

  showVotePopup(vote) {
    const container = document.getElementById('vote-popup');
    if (!container) return;

    let optionsHtml = vote.options.map((opt, i) =>
      `<button class="vote-option-btn" data-index="${i}">${opt.text} <span class="vote-count">(${opt.votes})</span></button>`
    ).join('');

    container.innerHTML = `
      <div class="vote-popup-inner">
        <h3>${vote.question}</h3>
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
        container.querySelectorAll('.vote-option-btn').forEach(b => b.disabled = true);
      });
    });

    const closeBtn = document.getElementById('vote-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => { this.hideVotePopup(); });
  },

  updateVotePopup(vote) {
    const container = document.getElementById('vote-popup');
    if (!container || container.style.display === 'none') return;
    const counts = container.querySelectorAll('.vote-count');
    vote.options.forEach((opt, i) => {
      if (counts[i]) counts[i].textContent = `(${opt.votes})`;
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
    var board = document.getElementById('postit-board-bg');
    board.innerHTML = '';

    var circlesCanvas = document.getElementById('darkboard-circles-canvas');
    var circlesCtx = circlesCanvas.getContext('2d');
    var footer = document.getElementById('darkboard-footer');

    var currentColor = '#FFE066';
    var postits = [];
    var circles = []; // { id, cx, cy, rx, ry, color }
    var votes = {}; // postitId -> { count, voters: Set }
    var myVotes = 0;
    var maxVotes = 3;
    var dotVotingMode = false;
    var circleMode = false;
    var dragState = null;
    var circleDrawState = null;

    function resizeCirclesCanvas() {
      var rect = board.parentElement.getBoundingClientRect();
      circlesCanvas.width = rect.width;
      circlesCanvas.height = rect.height;
      redrawCircles();
    }
    setTimeout(resizeCirclesCanvas, 50);

    function redrawCircles() {
      circlesCtx.clearRect(0, 0, circlesCanvas.width, circlesCanvas.height);
      for (var i = 0; i < circles.length; i++) {
        var c = circles[i];
        circlesCtx.beginPath();
        circlesCtx.ellipse(c.cx, c.cy, Math.abs(c.rx), Math.abs(c.ry), 0, 0, Math.PI * 2);
        circlesCtx.strokeStyle = c.color || 'rgba(255,255,255,0.6)';
        circlesCtx.lineWidth = 2.5;
        circlesCtx.setLineDash([8, 4]);
        circlesCtx.stroke();
        circlesCtx.setLineDash([]);
        if (c.label) {
          circlesCtx.font = 'bold 13px "Segoe UI", sans-serif';
          circlesCtx.fillStyle = c.color || 'rgba(255,255,255,0.7)';
          circlesCtx.textAlign = 'center';
          circlesCtx.fillText(c.label, c.cx, c.cy - Math.abs(c.ry) - 6);
        }
      }
      // Draw in-progress circle
      if (circleDrawState) {
        var dx = circleDrawState.endX - circleDrawState.startX;
        var dy = circleDrawState.endY - circleDrawState.startY;
        circlesCtx.beginPath();
        circlesCtx.ellipse(
          circleDrawState.startX + dx / 2,
          circleDrawState.startY + dy / 2,
          Math.abs(dx / 2), Math.abs(dy / 2), 0, 0, Math.PI * 2
        );
        circlesCtx.strokeStyle = 'rgba(255,255,255,0.5)';
        circlesCtx.lineWidth = 2;
        circlesCtx.setLineDash([6, 3]);
        circlesCtx.stroke();
        circlesCtx.setLineDash([]);
      }
    }

    function createPostItEl(postit) {
      var el = document.createElement('div');
      el.className = 'postit-note';
      el.dataset.postitId = postit.id;
      el.style.background = postit.color || currentColor;
      el.style.left = postit.x + 'px';
      el.style.top = postit.y + 'px';

      var textarea = document.createElement('textarea');
      textarea.value = postit.text || '';
      textarea.placeholder = 'Écrire ici...';
      textarea.addEventListener('input', function() {
        postit.text = textarea.value;
        Network.socket.emit('wb-postit', {
          whiteboardId: boardId,
          postitData: { id: postit.id, text: textarea.value, x: postit.x, y: postit.y, color: postit.color, pseudo: postit.pseudo || Engine.player.pseudo, votes: postit.votes || 0 },
        });
      });
      textarea.addEventListener('keydown', function(e) { e.stopPropagation(); });

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'postit-delete';
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        el.remove();
        postits = postits.filter(function(p) { return p.id !== postit.id; });
      });

      var author = document.createElement('div');
      author.className = 'postit-author';
      author.textContent = postit.pseudo || Engine.player.pseudo;

      // Vote badge
      var voteBadge = document.createElement('div');
      voteBadge.className = 'postit-vote-badge';
      voteBadge.textContent = postit.votes || 0;
      voteBadge.style.display = (postit.votes > 0) ? 'flex' : 'none';

      el.appendChild(deleteBtn);
      el.appendChild(textarea);
      el.appendChild(author);
      el.appendChild(voteBadge);

      // Drag to move (unless in vote mode)
      el.addEventListener('mousedown', function(e) {
        if (dotVotingMode) return;
        if (circleMode) return;
        if (e.target === textarea || e.target === deleteBtn) return;
        dragState = { el: el, postit: postit, startX: e.clientX, startY: e.clientY, origX: postit.x, origY: postit.y };
        e.preventDefault();
      });

      // Dot voting click
      el.addEventListener('click', function(e) {
        if (!dotVotingMode) return;
        if (e.target === deleteBtn) return;
        e.stopPropagation();
        if (myVotes >= maxVotes) {
          self.showNotification('Vous avez utilisé vos ' + maxVotes + ' votes !');
          return;
        }
        myVotes++;
        postit.votes = (postit.votes || 0) + 1;
        voteBadge.textContent = postit.votes;
        voteBadge.style.display = 'flex';
        // Animate
        el.classList.add('postit-voted');
        setTimeout(function() { el.classList.remove('postit-voted'); }, 300);
        // Broadcast
        Network.socket.emit('wb-postit', {
          whiteboardId: boardId,
          postitData: { id: postit.id, text: postit.text, x: postit.x, y: postit.y, color: postit.color, pseudo: postit.pseudo, votes: postit.votes },
        });
        updateVotesInfo();
      });

      board.appendChild(el);
      return el;
    }

    function updateVotesInfo() {
      var info = document.getElementById('darkboard-votes-info');
      if (info) info.textContent = 'Dot Voting — ' + myVotes + '/' + maxVotes + ' votes utilisés';
    }

    function findPostitEl(postitId) {
      return board.querySelector('[data-postit-id="' + postitId + '"]');
    }

    function onMouseMove(e) {
      if (dragState) {
        var dx = e.clientX - dragState.startX;
        var dy = e.clientY - dragState.startY;
        dragState.postit.x = Math.max(0, dragState.origX + dx);
        dragState.postit.y = Math.max(0, dragState.origY + dy);
        dragState.el.style.left = dragState.postit.x + 'px';
        dragState.el.style.top = dragState.postit.y + 'px';
      }
      if (circleDrawState) {
        circleDrawState.endX = e.offsetX || (e.clientX - circlesCanvas.getBoundingClientRect().left);
        circleDrawState.endY = e.offsetY || (e.clientY - circlesCanvas.getBoundingClientRect().top);
        redrawCircles();
      }
    }

    function onMouseUp(e) {
      if (dragState) {
        Network.socket.emit('wb-postit', {
          whiteboardId: boardId,
          postitData: { id: dragState.postit.id, text: dragState.postit.text, x: dragState.postit.x, y: dragState.postit.y, color: dragState.postit.color, pseudo: dragState.postit.pseudo, votes: dragState.postit.votes || 0 },
        });
        dragState = null;
      }
      if (circleDrawState) {
        var dx = circleDrawState.endX - circleDrawState.startX;
        var dy = circleDrawState.endY - circleDrawState.startY;
        if (Math.abs(dx) > 20 && Math.abs(dy) > 20) {
          var label = prompt('Nom du groupe (optionnel):') || '';
          var circle = {
            id: 'circle_' + Date.now(),
            cx: circleDrawState.startX + dx / 2,
            cy: circleDrawState.startY + dy / 2,
            rx: Math.abs(dx / 2),
            ry: Math.abs(dy / 2),
            color: 'rgba(255,255,255,0.5)',
            label: label,
          };
          circles.push(circle);
          // Broadcast circle via wb-stroke (reuse channel)
          Network.socket.emit('wb-stroke', {
            whiteboardId: boardId,
            strokeData: { type: 'circle', circle: circle },
          });
        }
        circleDrawState = null;
        redrawCircles();
      }
    }

    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);

    // Circle drawing on the canvas
    circlesCanvas.addEventListener('mousedown', function(e) {
      if (!circleMode) return;
      var rect = circlesCanvas.getBoundingClientRect();
      circleDrawState = {
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        endX: e.clientX - rect.left,
        endY: e.clientY - rect.top,
      };
      e.preventDefault();
      e.stopPropagation();
    });

    // Load existing
    Network.socket.emit('wb-open', { whiteboardId: boardId }, function(resp) {
      if (resp && resp.success) {
        if (resp.postits) {
          for (var i = 0; i < resp.postits.length; i++) {
            postits.push(resp.postits[i]);
            createPostItEl(resp.postits[i]);
          }
        }
        if (resp.strokes) {
          for (var j = 0; j < resp.strokes.length; j++) {
            if (resp.strokes[j].type === 'circle' && resp.strokes[j].circle) {
              circles.push(resp.strokes[j].circle);
            }
          }
          redrawCircles();
        }
      }
    });

    // Listen for remote post-its
    function onRemotePostit(data) {
      if (data.whiteboardId !== boardId) return;
      var pd = data.postitData;
      var existing = postits.find(function(p) { return p.id === pd.id; });
      if (existing) {
        existing.text = pd.text;
        existing.x = pd.x;
        existing.y = pd.y;
        existing.votes = pd.votes || 0;
        var el = findPostitEl(pd.id);
        if (el) {
          el.style.left = pd.x + 'px';
          el.style.top = pd.y + 'px';
          var ta = el.querySelector('textarea');
          if (ta && ta !== document.activeElement) ta.value = pd.text;
          var badge = el.querySelector('.postit-vote-badge');
          if (badge) {
            badge.textContent = existing.votes;
            badge.style.display = existing.votes > 0 ? 'flex' : 'none';
          }
        }
      } else {
        postits.push(pd);
        createPostItEl(pd);
      }
    }
    Network.socket.on('wb-postit', onRemotePostit);

    // Listen for remote circles
    function onRemoteStroke(data) {
      if (data.whiteboardId !== boardId) return;
      if (data.strokeData && data.strokeData.type === 'circle' && data.strokeData.circle) {
        circles.push(data.strokeData.circle);
        redrawCircles();
      }
    }
    Network.socket.on('wb-stroke', onRemoteStroke);

    // Color buttons
    var colorBtns = overlay.querySelectorAll('.postit-color-btn');
    colorBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        currentColor = btn.dataset.color;
        colorBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    // Add post-it button
    var addBtn = document.getElementById('postit-add');
    if (addBtn) addBtn.onclick = function() {
      var id = 'postit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      var postit = {
        id: id,
        text: '',
        x: 30 + Math.random() * 400,
        y: 30 + Math.random() * 300,
        color: currentColor,
        pseudo: Engine.player.pseudo,
        votes: 0,
      };
      postits.push(postit);
      createPostItEl(postit);
      Network.socket.emit('wb-postit', { whiteboardId: boardId, postitData: postit });
    };

    // Circle tool toggle
    var circleBtn = document.getElementById('postit-circle-tool');
    if (circleBtn) circleBtn.onclick = function() {
      circleMode = !circleMode;
      circleBtn.classList.toggle('active', circleMode);
      if (circleMode) {
        circlesCanvas.style.pointerEvents = 'auto';
        dotVotingMode = false;
        var voteBtn = document.getElementById('postit-vote-toggle');
        if (voteBtn) voteBtn.classList.remove('active');
        footer.style.display = 'none';
      } else {
        circlesCanvas.style.pointerEvents = 'none';
      }
    };
    circlesCanvas.style.pointerEvents = 'none';

    // Dot voting toggle
    var voteToggle = document.getElementById('postit-vote-toggle');
    if (voteToggle) voteToggle.onclick = function() {
      dotVotingMode = !dotVotingMode;
      voteToggle.classList.toggle('active', dotVotingMode);
      footer.style.display = dotVotingMode ? 'block' : 'none';
      if (dotVotingMode) {
        circleMode = false;
        if (circleBtn) circleBtn.classList.remove('active');
        circlesCanvas.style.pointerEvents = 'none';
        board.classList.add('vote-mode');
        updateVotesInfo();
      } else {
        board.classList.remove('vote-mode');
      }
    };

    // Close
    function cleanup() {
      overlay.style.display = 'none';
      overlay.removeEventListener('mousemove', onMouseMove);
      overlay.removeEventListener('mouseup', onMouseUp);
      Network.socket.off('wb-postit', onRemotePostit);
      Network.socket.off('wb-stroke', onRemoteStroke);
      Network.socket.emit('wb-close', { whiteboardId: boardId });
      footer.style.display = 'none';
      board.classList.remove('vote-mode');
    }

    var closeBtn = document.getElementById('postit-close');
    if (closeBtn) closeBtn.onclick = cleanup;

    function onEsc(e) {
      if (e.code === 'Escape') { cleanup(); window.removeEventListener('keydown', onEsc); }
    }
    window.addEventListener('keydown', onEsc);
  },

  // ===== WHITEBOARD POP-IN =====

  openWhiteboard: function(whiteboardId, furnitureItem) {
    var self = this;
    var overlay = document.getElementById('whiteboard-overlay');
    if (!overlay) return;

    this.activeWhiteboardId = whiteboardId;
    overlay.style.display = 'flex';

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
      btn.addEventListener('click', function() {
        currentColor = btn.dataset.color;
        colorBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    // Width buttons
    var widthBtns = overlay.querySelectorAll('.wb-width-btn');
    widthBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        currentWidth = parseInt(btn.dataset.width);
        widthBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    // Undo
    var undoBtn = document.getElementById('wb-undo');
    if (undoBtn) undoBtn.onclick = function() {
      Network.socket.emit('wb-undo', { whiteboardId: whiteboardId });
    };

    // Clear
    var clearBtn = document.getElementById('wb-clear');
    if (clearBtn) clearBtn.onclick = function() {
      if (confirm('Effacer tout le tableau ?')) {
        Network.socket.emit('wb-clear', { whiteboardId: whiteboardId }, function() {});
      }
    };

    // Close
    var closeBtn = document.getElementById('wb-close');
    function cleanup() {
      overlay.style.display = 'none';
      self.activeWhiteboardId = null;
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onUp);
      Network.socket.off('wb-stroke', onRemoteStroke);
      Network.socket.off('wb-undo', onRemoteUndo);
      Network.socket.off('wb-cleared', onRemoteClear);
      Network.socket.emit('wb-close', { whiteboardId: whiteboardId });
    }
    if (closeBtn) closeBtn.onclick = cleanup;

    // ESC closes
    function onEsc(e) {
      if (e.code === 'Escape') { cleanup(); window.removeEventListener('keydown', onEsc); }
    }
    window.addEventListener('keydown', onEsc);

    clearCanvas();
  },

  // ===== COLLABORATION SPACE =====

  activeCollabSpace: null,
  collabConnections: new Map(), // socketId -> { connection, videoElement }
  collabLocalStream: null,

  openCollabSpace: function(spaceId) {
    var self = this;
    var overlay = document.getElementById('collab-space-overlay');
    if (!overlay) return;
    this.activeCollabSpace = spaceId;
    overlay.style.display = 'flex';

    var grid = document.getElementById('collab-space-grid');
    grid.innerHTML = '<div class="collab-screen-tile collab-screen-empty"><p>Aucun partage d\'écran</p><p style="font-size:0.75rem;color:#666;">Cliquez sur "Partager mon écran"</p></div>';

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
    if (closeBtn) closeBtn.onclick = function() { self.closeCollabSpace(spaceId); };

    function onEsc(e) {
      if (e.code === 'Escape') { self.closeCollabSpace(spaceId); window.removeEventListener('keydown', onEsc); }
    }
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
    label.textContent = pseudo || 'Anonyme';

    tile.appendChild(video);
    tile.appendChild(label);
    grid.appendChild(tile);
    return video;
  },

  checkEmptyCollabGrid: function() {
    var grid = document.getElementById('collab-space-grid');
    if (!grid) return;
    if (grid.querySelectorAll('.collab-screen-tile:not(.collab-screen-empty)').length === 0) {
      grid.innerHTML = '<div class="collab-screen-tile collab-screen-empty"><p>Aucun partage d\'écran</p><p style="font-size:0.75rem;color:#666;">Cliquez sur "Partager mon écran"</p></div>';
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
    if (el) el.textContent = data.users.length + ' utilisateur(s)';
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

  openSubRoomDialog: function() {
    var name = prompt('Nom de la sous-salle:');
    if (!name) return;
    var px = Math.floor(Engine.player.x) + 2;
    var py = Math.floor(Engine.player.y);
    Network.socket.emit('create-sub-room', { name: name, x: px, y: py, width: 3, height: 3 }, function(r) {
      if (r && r.success) {
        Engine.subRooms.set(r.subRoom.id, r.subRoom);
        UI.showNotification('Sous-salle "' + name + '" créée');
      }
    });
  },

  // ===== EDIT MODE TOOLBAR =====

  showEditToolbar(show) {
    var toolbar = document.getElementById('edit-toolbar');
    if (!toolbar) return;
    toolbar.style.display = show ? 'flex' : 'none';

    if (show) {
      this.buildEditCatalog();
      this.updateEditToolButtons();
      var gridInfo = document.getElementById('edit-grid-info');
      if (gridInfo) gridInfo.textContent = Board.gridSize + 'x' + Board.gridSize;
    }

    // Hide/show normal toolbar
    var normalToolbar = document.getElementById('toolbar');
    if (normalToolbar) normalToolbar.style.display = show ? 'none' : 'flex';
  },

  buildEditCatalog() {
    var select = document.getElementById('edit-catalog-select');
    if (!select) return;

    var html = '<option value="">-- Choisir un mobilier --</option>';
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

    const elapsed = t.paused ? 0 : (Date.now() - t.startedAt) / 1000;
    const remaining = Math.max(0, t.duration - elapsed);
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    const timeStr = mins + ':' + secs.toString().padStart(2, '0');

    if (el) {
      el.innerHTML = '<span class="timer-text">' + (t.paused ? 'EN PAUSE — ' : '') + timeStr + '</span>';
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

    if (remaining <= 0) {
      t.running = false;
      if (el) el.innerHTML = '<span class="timer-text timer-ended">Terminé !</span>';
      if (globalTime) globalTime.textContent = 'Terminé !';
    }
  },
};
