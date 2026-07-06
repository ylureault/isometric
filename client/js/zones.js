// Zones panel: a discoverable bottom-right admin widget to CREATE spaces by
// drag-and-drop and to MODIFY them (rename, resize, delete). Works outside the
// full edit mode so it is easy to find and use during a live session.

const Zones = {
  TYPES: [
    { type: 'collabSpace', label: 'Espace collab', ic: '🟢', hint: 'On s\'entend + partage d\'écran' },
    { type: 'zoneMarker', label: 'Zone de discussion', ic: '🔵', hint: 'Tout le monde s\'entend' },
    { type: 'privateRoom', label: 'Salle fermée', ic: '🚪', hint: 'Conversation isolée' },
  ],
  _dragType: null,
  _open: false,

  init() {
    if (this._wired) { this.refresh(); return; }
    this._wired = true;
    var self = this;

    var toggle = document.getElementById('zones-toggle');
    var panel = document.getElementById('zones-panel');
    if (toggle) toggle.addEventListener('click', function () { self.togglePanel(); });
    var closeBtn = document.getElementById('zones-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { self.togglePanel(false); });

    // Draggable type chips
    var chipWrap = document.getElementById('zones-chips');
    if (chipWrap && !chipWrap.dataset.built) {
      chipWrap.dataset.built = '1';
      this.TYPES.forEach(function (t) {
        var chip = document.createElement('div');
        chip.className = 'zone-chip';
        chip.draggable = true;
        chip.dataset.type = t.type;
        chip.innerHTML = '<span class="zc-ic">' + t.ic + '</span><span class="zc-l">' + t.label + '</span><span class="zc-h">' + t.hint + '</span>';
        chip.addEventListener('dragstart', function (e) {
          self._dragType = t.type;
          try { e.dataTransfer.setData('text/plain', t.type); e.dataTransfer.effectAllowed = 'copy'; } catch (err) {}
          document.body.classList.add('zone-dragging');
        });
        chip.addEventListener('dragend', function () { self._dragType = null; document.body.classList.remove('zone-dragging'); });
        // Fallback for touch/no-drag: click a chip then click the scene.
        chip.addEventListener('click', function () {
          self._dragType = t.type;
          UI.showNotification && UI.showNotification('Cliquez dans la salle pour poser « ' + t.label + ' »');
        });
        chipWrap.appendChild(chip);
      });
    }

    // Canvas drop target (works regardless of edit mode)
    var canvas = document.getElementById('game-canvas');
    if (canvas && !canvas.dataset.zoneDrop) {
      canvas.dataset.zoneDrop = '1';
      canvas.addEventListener('dragover', function (e) {
        if (!self._dragType) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
      });
      canvas.addEventListener('drop', function (e) {
        if (!self._dragType) return;
        e.preventDefault();
        self._createAtScreen(self._dragType, e.clientX, e.clientY);
        self._dragType = null; document.body.classList.remove('zone-dragging');
      });
    }
    this.refresh();
  },

  togglePanel(force) {
    this._open = (force === undefined) ? !this._open : !!force;
    var panel = document.getElementById('zones-panel');
    var toggle = document.getElementById('zones-toggle');
    if (panel) panel.style.display = this._open ? 'flex' : 'none';
    if (toggle) toggle.classList.toggle('active', this._open);
    if (this._open) this.refresh();
  },

  // Placement helper: convert a screen point to grid and create a default zone.
  _createAtScreen(type, clientX, clientY) {
    if (!Engine || !Engine.screenToGridView) return;
    var gp = Engine.screenToGridView(clientX, clientY);
    var def = Environments.furnitureTypes[type] || { width: 4, height: 4 };
    var gx = Math.max(0, Math.min(Board.gridSize - (def.width || 4), Math.floor(gp.x - (def.width || 4) / 2)));
    var gy = Math.max(0, Math.min(Board.gridSize - (def.height || 4), Math.floor(gp.y - (def.height || 4) / 2)));
    Network.socket.emit('add-furniture', { type: type, x: gx, y: gy, width: def.width || 4, height: def.height || 4 }, function (r) {
      if (r && r.success) {
        Board.furniture.push(r.item);
        Board.buildCollisionMap();
        Engine._zonesSig = null; // force zone rebuild
        UI.showNotification && UI.showNotification('Espace créé — glissez-en d\'autres, ou redimensionnez ci-dessous');
        Zones.refresh();
      } else {
        UI.showNotification && UI.showNotification('Placement impossible' + (r && r.error ? ' (' + r.error + ')' : ''), 'warning');
      }
    });
  },

  _zoneItems() {
    return (Board.furniture || []).filter(function (f) {
      var d = Environments.furnitureTypes[f.type];
      return d && (d.isZone || d.isCollabSpace);
    });
  },

  refresh() {
    var list = document.getElementById('zones-list');
    if (!list) return;
    var items = this._zoneItems();
    if (!items.length) {
      list.innerHTML = '<div class="zones-empty">Aucun espace. Glissez un type ci-dessus dans la salle.</div>';
      this._updateCount(0);
      return;
    }
    var self = this;
    list.innerHTML = '';
    items.forEach(function (item) {
      var def = Environments.furnitureTypes[item.type];
      var key = Math.floor(item.x) + ',' + Math.floor(item.y);
      var name = (Engine._zoneLabels && Engine._zoneLabels[key]) || item.label || def.name;
      var w = item.width || def.width || 4, h = item.height || def.height || 4;
      var row = document.createElement('div');
      row.className = 'zone-row';
      row.innerHTML =
        '<div class="zr-top"><span class="zr-ic">' + (def.isPrivate ? '🚪' : def.isCollabSpace ? '🟢' : '🔵') + '</span>' +
        '<button class="zr-name" title="Renommer">' + self._esc(name) + '</button>' +
        '<button class="zr-del" title="Supprimer">🗑</button></div>' +
        '<div class="zr-size"><span>Taille</span>' +
        '<button class="zr-b" data-a="wm">L−</button><span class="zr-v">' + w + '</span><button class="zr-b" data-a="wp">L+</button>' +
        '<button class="zr-b" data-a="hm">H−</button><span class="zr-v">' + h + '</span><button class="zr-b" data-a="hp">H+</button></div>';
      row.querySelector('.zr-name').addEventListener('click', function () { self._rename(key, name); });
      row.querySelector('.zr-del').addEventListener('click', function () { self._delete(item); });
      row.querySelectorAll('.zr-b').forEach(function (b) {
        b.addEventListener('click', function () {
          var a = b.dataset.a;
          var nw = w + (a === 'wp' ? 1 : a === 'wm' ? -1 : 0);
          var nh = h + (a === 'hp' ? 1 : a === 'hm' ? -1 : 0);
          self._resize(item, Math.max(1, nw), Math.max(1, nh));
        });
      });
      list.appendChild(row);
    });
    this._updateCount(items.length);
  },

  _updateCount(n) {
    var c = document.getElementById('zones-count');
    if (c) c.textContent = n;
  },

  _rename(key, current) {
    var name = window.prompt('Nom de l\'espace :', current || '');
    if (name === null) return;
    Network.socket.emit('set-zone-label', { key: key, label: name.slice(0, 40) }, function () {});
    Engine._zoneLabels = Engine._zoneLabels || {};
    if (name) Engine._zoneLabels[key] = name.slice(0, 40); else delete Engine._zoneLabels[key];
    Engine._zonesSig = null;
    this.refresh();
  },

  _resize(item, w, h) {
    Network.socket.emit('resize-furniture', { furnitureId: item.id, width: w, height: h });
    item.width = w; item.height = h; // optimistic
    Board.buildCollisionMap && Board.buildCollisionMap();
    Engine._zonesSig = null;
    this.refresh();
  },

  _delete(item) {
    var self = this;
    Network.socket.emit('remove-furniture', { furnitureId: item.id }, function (r) {
      if (r && r.success) {
        Board.furniture = Board.furniture.filter(function (f) { return f.id !== item.id; });
        Board.buildCollisionMap && Board.buildCollisionMap();
        Engine._zonesSig = null;
        self.refresh();
      }
    });
  },

  // Called when the admin state is known — show/hide the whole widget.
  setAdmin(isAdmin) {
    var w = document.getElementById('zones-widget');
    if (w) w.style.display = isAdmin ? 'block' : 'none';
    if (isAdmin) this.refresh();
  },

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Zones;
