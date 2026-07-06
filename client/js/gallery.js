// Gallery + screen-share dock: a Google-Meet / Zoom-style grid view of every
// participant (webcam or avatar tile), plus a floating dock that shows what is
// being shared (your own screen while sharing, or someone else's), with
// enlarge / fullscreen controls. All video rides the streams already set up by
// Audio (webcam) and ScreenShare (screens).

const Gallery = {
  open: false,
  _tiles: null,
  _tick: null,

  init() {
    var self = this;
    var btn = document.getElementById('btn-view-gallery');
    if (btn && !btn._wired) { btn._wired = true; btn.addEventListener('click', function () { self.toggle(); }); }
    // Keep the dock fresh even when the gallery is closed.
    if (!this._dockTick) this._dockTick = setInterval(function () { self.updateDock(); }, 700);
  },

  toggle() { this.open ? this.hide() : this.show(); },

  show() {
    this.open = true;
    var ov = this._ensureGallery();
    ov.style.display = 'flex';
    document.body.classList.add('gallery-open');
    var btn = document.getElementById('btn-view-gallery');
    if (btn) { btn.classList.add('active'); btn.title = 'Revenir à la salle'; }
    var self = this;
    this.render();
    if (!this._tick) this._tick = setInterval(function () { self.render(); }, 600);
  },

  hide() {
    this.open = false;
    var ov = document.getElementById('gallery-overlay');
    if (ov) ov.style.display = 'none';
    document.body.classList.remove('gallery-open');
    var btn = document.getElementById('btn-view-gallery');
    if (btn) { btn.classList.remove('active'); btn.title = 'Vue galerie (comme Meet / Zoom)'; }
    if (this._tick) { clearInterval(this._tick); this._tick = null; }
  },

  _ensureGallery() {
    var ov = document.getElementById('gallery-overlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'gallery-overlay';
    ov.innerHTML = '<div class="gal-top"><span class="gal-title">Galerie</span>' +
      '<button class="gal-close" id="gal-close" aria-label="Fermer la galerie">&times;</button></div>' +
      '<div class="gal-stage" id="gal-stage"></div>' +
      '<div class="gal-grid" id="gal-grid"></div>';
    document.body.appendChild(ov);
    var self = this;
    document.getElementById('gal-close').addEventListener('click', function () { self.hide(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && self.open) self.hide(); });
    return ov;
  },

  // ---- Data collection ----
  _participants() {
    var out = [];
    if (Engine && Engine.player) {
      out.push({
        key: 'me', pseudo: (Engine.player.pseudo || 'Moi') + ' (vous)',
        videoEl: (Engine.player.videoMode && typeof Video !== 'undefined') ? Video.ensureLocalVideo() : null,
        mirror: true, speaking: Audio.isSpeaking && Audio.isSpeaking() && !Engine.player.isMuted,
        muted: Engine.player.isMuted, isAdmin: Engine.player.isAdmin, colors: Engine.player.colors,
      });
    }
    if (Network && Network.remotePlayers) {
      Network.remotePlayers.forEach(function (p, sid) {
        if (p.leaving) return;
        var peer = (Audio.peers && Audio.peers.get(sid)) || null;
        out.push({
          key: sid, pseudo: p.pseudo || 'Participant',
          videoEl: p.videoMode ? (peer && peer.videoEl) : null,
          mirror: false, speaking: p.isSpeaking && !p.isMuted, muted: p.isMuted,
          isAdmin: p.isAdmin, colors: p.colors,
        });
      });
    }
    return out;
  },

  // The currently featured screen share (mine takes priority, else the global one)
  _activeShare() {
    if (typeof ScreenShare === 'undefined') return null;
    if (ScreenShare.isSharing && ScreenShare.localStream) {
      return { key: 'me', pseudo: 'Votre écran', stream: ScreenShare.localStream, mine: true };
    }
    if (ScreenShare.activeGlobalShare) {
      var s = ScreenShare.incomingShares.get(ScreenShare.activeGlobalShare.socketId);
      if (s && s.videoElement) return { key: ScreenShare.activeGlobalShare.socketId, pseudo: 'Écran de ' + ScreenShare.activeGlobalShare.pseudo, stream: s.videoElement.srcObject, mine: false };
    }
    return null;
  },

  // ---- Rendering ----
  render() {
    if (!this.open) return;
    var stage = document.getElementById('gal-stage');
    var grid = document.getElementById('gal-grid');
    if (!stage || !grid) return;

    // Featured screen share (if any) goes on the big stage.
    var share = this._activeShare();
    if (share && share.stream) {
      stage.style.display = 'flex';
      var sv = document.getElementById('gal-share-video');
      if (!sv) {
        stage.innerHTML = '<div class="gal-share-wrap"><video id="gal-share-video" autoplay muted playsinline></video>' +
          '<div class="gal-share-name" id="gal-share-name"></div>' +
          '<button class="gal-fs" id="gal-share-fs" title="Plein écran">⛶</button></div>';
        sv = document.getElementById('gal-share-video');
        var self1 = this;
        document.getElementById('gal-share-fs').addEventListener('click', function () { self1.fullscreen(document.getElementById('gal-share-video')); });
      }
      if (sv.srcObject !== share.stream) { sv.srcObject = share.stream; var pp = sv.play(); if (pp && pp.catch) pp.catch(function () {}); }
      document.getElementById('gal-share-name').textContent = share.pseudo;
    } else {
      stage.style.display = 'none';
      stage.innerHTML = '';
    }

    // Participant tiles
    var people = this._participants();
    grid.className = 'gal-grid n' + Math.min(people.length, 12) + (share ? ' with-stage' : '');
    var seen = {};
    var self = this;
    people.forEach(function (p) {
      seen[p.key] = true;
      var tile = document.getElementById('gal-tile-' + p.key);
      if (!tile) {
        tile = document.createElement('div');
        tile.id = 'gal-tile-' + p.key;
        tile.className = 'gal-tile';
        tile.innerHTML = '<video autoplay muted playsinline></video><div class="gal-ph"></div>' +
          '<div class="gal-name"></div><button class="gal-fs" title="Plein écran">⛶</button>';
        grid.appendChild(tile);
        tile.querySelector('.gal-fs').addEventListener('click', function (e) {
          e.stopPropagation();
          var v = tile.querySelector('video');
          if (v.srcObject) self.fullscreen(v);
        });
      }
      var vid = tile.querySelector('video');
      var ph = tile.querySelector('.gal-ph');
      if (p.videoEl && p.videoEl.srcObject) {
        if (vid.srcObject !== p.videoEl.srcObject) { vid.srcObject = p.videoEl.srcObject; var q = vid.play(); if (q && q.catch) q.catch(function () {}); }
        vid.style.display = 'block';
        vid.style.transform = p.mirror ? 'scaleX(-1)' : '';
        ph.style.display = 'none';
      } else {
        vid.style.display = 'none';
        ph.style.display = 'flex';
        var base = (p.colors && p.colors.shirt) || '#6b6cff';
        ph.style.background = 'linear-gradient(135deg,' + base + ',' + (Board && Board.darken ? Board.darken(base, 0.28) : base) + ')';
        ph.textContent = (p.pseudo || '?').trim().charAt(0).toUpperCase();
      }
      tile.classList.toggle('speaking', !!p.speaking);
      tile.querySelector('.gal-name').innerHTML = (p.isAdmin ? '👑 ' : '') + this._esc(p.pseudo) + (p.muted ? ' <span class="gal-mut">🔇</span>' : '');
    }, this);

    // Remove stale tiles
    Array.prototype.slice.call(grid.querySelectorAll('.gal-tile')).forEach(function (t) {
      var k = t.id.replace('gal-tile-', '');
      if (!seen[k]) t.remove();
    });
  },

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); },

  fullscreen(videoEl) {
    if (!videoEl) return;
    var el = videoEl;
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen;
    if (req) { try { req.call(el); } catch (e) {} }
    else { this._enlargeFallback(videoEl); }
  },

  _enlargeFallback(videoEl) {
    var ov = document.getElementById('gallery-fs-fallback');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'gallery-fs-fallback';
      ov.innerHTML = '<video autoplay muted playsinline></video><button class="gal-fs-close">&times;</button>';
      document.body.appendChild(ov);
      ov.querySelector('.gal-fs-close').addEventListener('click', function () { ov.style.display = 'none'; ov.querySelector('video').srcObject = null; });
    }
    var v = ov.querySelector('video'); v.srcObject = videoEl.srcObject; v.play().catch(function () {});
    ov.style.display = 'flex';
  },

  // ---- Screen-share dock (visible in the iso view) ----
  updateDock() {
    var dock = document.getElementById('share-dock');
    var share = this._activeShare();
    if (!share || !share.stream) {
      if (dock) dock.style.display = 'none';
      return;
    }
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'share-dock';
      dock.innerHTML = '<div class="sd-head"><span class="sd-dot"></span><span id="sd-label"></span></div>' +
        '<video id="sd-video" autoplay muted playsinline></video>' +
        '<div class="sd-actions"><button id="sd-fs" title="Plein écran">⛶ Agrandir</button>' +
        '<button id="sd-stop" title="Arrêter le partage">⏹ Arrêter</button></div>';
      document.body.appendChild(dock);
      var self = this;
      document.getElementById('sd-fs').addEventListener('click', function () { self.fullscreen(document.getElementById('sd-video')); });
      document.getElementById('sd-stop').addEventListener('click', function () {
        if (typeof ScreenShare !== 'undefined' && ScreenShare.isSharing) ScreenShare.stopShare();
      });
    }
    dock.style.display = 'block';
    var v = document.getElementById('sd-video');
    if (v.srcObject !== share.stream) { v.srcObject = share.stream; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    document.getElementById('sd-label').textContent = share.mine ? 'Vous partagez votre écran' : share.pseudo;
    document.getElementById('sd-stop').style.display = share.mine ? '' : 'none';
    dock.classList.toggle('is-mine', share.mine);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Gallery;
