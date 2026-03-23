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

      onEnter({ pseudo, colors: { ...this.currentColors } });
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
    };

    var html = '';
    for (var type in Environments.furnitureTypes) {
      var def = Environments.furnitureTypes[type];
      if (def.isZone || def.isCarpet || def.isStage) continue;
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

  updateAdminSettings() {
    const gridInput = document.getElementById('admin-grid-size');
    if (gridInput) gridInput.value = Engine.roomConfig.gridSize;

    const envSelect = document.getElementById('admin-environment');
    if (envSelect) envSelect.value = Engine.roomConfig.environment;
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

  // ===== POST-IT BOARD POP-IN =====

  openPostItBoard: function(boardId, furnitureItem) {
    var self = this;
    var overlay = document.getElementById('postit-overlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    var board = document.getElementById('postit-board-bg');
    board.innerHTML = '';

    var currentColor = '#FFE066';
    var postits = [];
    var dragState = null;

    function createPostItEl(postit) {
      var el = document.createElement('div');
      el.className = 'postit-note';
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
          postitData: { id: postit.id, text: textarea.value, x: postit.x, y: postit.y, color: postit.color, pseudo: Engine.player.pseudo },
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

      el.appendChild(deleteBtn);
      el.appendChild(textarea);
      el.appendChild(author);

      // Drag to move
      el.addEventListener('mousedown', function(e) {
        if (e.target === textarea || e.target === deleteBtn) return;
        dragState = { el: el, postit: postit, startX: e.clientX, startY: e.clientY, origX: postit.x, origY: postit.y };
        e.preventDefault();
      });

      board.appendChild(el);
      return el;
    }

    function onMouseMove(e) {
      if (!dragState) return;
      var dx = e.clientX - dragState.startX;
      var dy = e.clientY - dragState.startY;
      dragState.postit.x = Math.max(0, dragState.origX + dx);
      dragState.postit.y = Math.max(0, dragState.origY + dy);
      dragState.el.style.left = dragState.postit.x + 'px';
      dragState.el.style.top = dragState.postit.y + 'px';
    }

    function onMouseUp() {
      if (dragState) {
        // Send position update
        Network.socket.emit('wb-postit', {
          whiteboardId: boardId,
          postitData: { id: dragState.postit.id, text: dragState.postit.text, x: dragState.postit.x, y: dragState.postit.y, color: dragState.postit.color, pseudo: dragState.postit.pseudo },
        });
        dragState = null;
      }
    }

    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);

    // Load existing postits
    Network.socket.emit('wb-open', { whiteboardId: boardId }, function(resp) {
      if (resp && resp.success && resp.postits) {
        for (var i = 0; i < resp.postits.length; i++) {
          postits.push(resp.postits[i]);
          createPostItEl(resp.postits[i]);
        }
      }
    });

    // Listen for remote post-its
    function onRemotePostit(data) {
      if (data.whiteboardId !== boardId) return;
      var pd = data.postitData;
      // Update existing or add new
      var existing = postits.find(function(p) { return p.id === pd.id; });
      if (existing) {
        existing.text = pd.text;
        existing.x = pd.x;
        existing.y = pd.y;
        // Update DOM
        var els = board.querySelectorAll('.postit-note');
        for (var i = 0; i < els.length; i++) {
          if (parseInt(els[i].style.left) === existing.x || els[i].querySelector('textarea').value === existing.text) {
            els[i].style.left = pd.x + 'px';
            els[i].style.top = pd.y + 'px';
            els[i].querySelector('textarea').value = pd.text;
          }
        }
      } else {
        postits.push(pd);
        createPostItEl(pd);
      }
    }
    Network.socket.on('wb-postit', onRemotePostit);

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
      };
      postits.push(postit);
      createPostItEl(postit);
      Network.socket.emit('wb-postit', { whiteboardId: boardId, postitData: postit });
    };

    // Close
    function cleanup() {
      overlay.style.display = 'none';
      overlay.removeEventListener('mousemove', onMouseMove);
      overlay.removeEventListener('mouseup', onMouseUp);
      Network.socket.off('wb-postit', onRemotePostit);
      Network.socket.emit('wb-close', { whiteboardId: boardId });
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

  // ===== TIMER DISPLAY =====

  showTimer(timer) {
    const el = document.getElementById('timer-display');
    if (!el) return;
    el.style.display = 'block';
    this.activeTimer = timer;
    this.updateTimerDisplay();
  },

  updateTimerDisplay() {
    const el = document.getElementById('timer-display');
    if (!el || !this.activeTimer) return;

    const t = this.activeTimer;
    if (!t.running) {
      el.innerHTML = '<span class="timer-text">Terminé !</span>';
      setTimeout(() => { el.style.display = 'none'; }, 5000);
      return;
    }

    const elapsed = t.paused ? 0 : (Date.now() - t.startedAt) / 1000;
    const remaining = Math.max(0, t.duration - elapsed);
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);

    el.innerHTML = `<span class="timer-text">${t.paused ? 'EN PAUSE — ' : ''}${mins}:${secs.toString().padStart(2, '0')}</span>`;

    if (remaining <= 0) {
      t.running = false;
      el.innerHTML = '<span class="timer-text timer-ended">Terminé !</span>';
    }
  },
};
