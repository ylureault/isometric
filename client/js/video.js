// Video: camera-bubble mode. A participant can appear as a round webcam bubble
// (green ring when speaking) instead of an avatar. Video rides the audio mesh
// (the camera track is part of Audio.localStream), so there is no separate
// signaling here — this module only handles capture prefs, rendering and the
// enlarged view.

const Video = {
  enabled: false,          // local player's mode (mirrors Engine.player.videoMode)
  _localVideoEl: null,     // hidden <video> bound to our own camera
  _switching: false,
  enlargedSocketId: null,  // socketId whose bubble is shown enlarged (or 'me')

  // Bind a hidden <video> to our own camera stream for self-rendering.
  ensureLocalVideo() {
    if (!Audio.hasLocalVideo()) return null;
    if (!this._localVideoEl) {
      const v = document.createElement('video');
      v.autoplay = true; v.muted = true; v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
      document.body.appendChild(v);
      this._localVideoEl = v;
    }
    if (this._localVideoEl.srcObject !== Audio.localStream) {
      this._localVideoEl.srcObject = Audio.localStream;
      const p = this._localVideoEl.play();
      if (p && p.catch) p.catch(() => {});
    }
    return this._localVideoEl;
  },

  _teardownLocalVideo() {
    if (this._localVideoEl) {
      try { this._localVideoEl.pause(); } catch (e) {}
      this._localVideoEl.srcObject = null;
      if (this._localVideoEl.parentNode) this._localVideoEl.parentNode.removeChild(this._localVideoEl);
      this._localVideoEl = null;
    }
  },

  // Switch camera mode on/off mid-session. Re-acquires media and reconnects
  // peers cleanly (reusing the tested connect path) so the new track set flows.
  async setMode(enabled) {
    if (this._switching || enabled === this.enabled) return this.enabled;
    this._switching = true;
    try {
      if (enabled) {
        const res = await Audio.requestMedia(true);
        if (!res || !Audio.hasLocalVideo()) {
          UI.showNotification && UI.showNotification('Caméra indisponible — accès refusé ?');
          this._switching = false;
          return false;
        }
        this.enabled = true;
        this.ensureLocalVideo();
      } else {
        // Stop only the camera track, keep the mic.
        if (Audio.localStream) {
          Audio.localStream.getVideoTracks().forEach(t => t.stop());
        }
        await Audio.requestMedia(false); // fresh audio-only stream
        this._teardownLocalVideo();
        this.enabled = false;
      }
      if (Engine && Engine.player) Engine.player.videoMode = this.enabled;
      // Rebuild peer connections so the (added/removed) camera track propagates.
      this._reconnectPeers();
      if (Network.socket) Network.socket.emit('set-video-mode', { enabled: this.enabled });
      if (Audio.setupAnalyser) Audio.setupAnalyser();
      UI.updateVideoButton && UI.updateVideoButton(this.enabled);
    } catch (e) {
      console.warn('Video.setMode failed:', e.message);
    }
    this._switching = false;
    return this.enabled;
  },

  toggle() { return this.setMode(!this.enabled); },

  _reconnectPeers() {
    if (!Audio.peers) return;
    for (const sid of [...Audio.peers.keys()]) {
      Audio.disconnectPeer(sid);
    }
    // The proximity loop (Audio.updateProximity) reconnects on the next frames
    // using the current localStream (with or without the camera track).
  },

  // Draw a round webcam bubble at grid (gx,gy). Falls back to a coloured
  // placeholder with the person's initial when no live video is available.
  drawBubble(ctx, gx, gy, opts) {
    opts = opts || {};
    const elevation = Board.getElevationAt(Math.floor(gx), Math.floor(gy));
    const pos = Board.iso(gx, gy, elevation);
    const sx = pos.x;
    const sy = pos.y;
    const r = opts.radius || 20;
    const cy = sy - r - 6; // lift the bubble so it sits above the tile
    const videoEl = opts.videoEl;
    const hasFrame = videoEl && videoEl.videoWidth > 0 && videoEl.readyState >= 2;

    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;

    // Soft drop shadow
    ctx.save();
    ctx.globalAlpha *= 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, r * 0.7, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Clip to circle and draw video (cover-fit) or placeholder
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (hasFrame) {
      const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
      const side = Math.min(vw, vh);
      const cropX = (vw - side) / 2, cropY = (vh - side) / 2;
      if (opts.mirror) {
        ctx.save();
        ctx.translate(sx, cy); ctx.scale(-1, 1); ctx.translate(-sx, -cy);
        ctx.drawImage(videoEl, cropX, cropY, side, side, sx - r, cy - r, r * 2, r * 2);
        ctx.restore();
      } else {
        ctx.drawImage(videoEl, cropX, cropY, side, side, sx - r, cy - r, r * 2, r * 2);
      }
    } else {
      // Placeholder: soft gradient using the avatar's shirt colour + initial
      const base = (opts.colors && opts.colors.shirt) || '#6b6cff';
      const g = ctx.createLinearGradient(sx - r, cy - r, sx + r, cy + r);
      g.addColorStop(0, base);
      g.addColorStop(1, Board.darken ? Board.darken(base, 0.25) : base);
      ctx.fillStyle = g;
      ctx.fillRect(sx - r, cy - r, r * 2, r * 2);
      const initial = (opts.pseudo || '?').trim().charAt(0).toUpperCase();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '600 ' + Math.round(r * 0.95) + 'px "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(initial, sx, cy + 1);
      // small camera glyph
      ctx.font = Math.round(r * 0.5) + 'px sans-serif';
      ctx.fillText('📷', sx, cy + r * 0.62);
    }
    ctx.restore();

    // Speaking ring (green, pulsing) or neutral border
    const ringColor = opts.speaking ? '#2ecc71' : 'rgba(255,255,255,0.85)';
    const ringWidth = opts.speaking ? 3.2 : 2;
    if (opts.speaking) {
      const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 500;
      const pulse = 0.6 + Math.sin(t) * 0.4;
      ctx.strokeStyle = 'rgba(46,204,113,' + (0.35 * pulse) + ')';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(sx, cy, r + 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = ringWidth;
    ctx.beginPath(); ctx.arc(sx, cy, r, 0, Math.PI * 2); ctx.stroke();

    // Admin crown marker
    if (opts.isAdmin) {
      ctx.fillStyle = '#f1c40f';
      ctx.font = Math.round(r * 0.7) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('👑', sx, cy - r - 2);
    }

    // Muted mic badge (bottom-right of the bubble)
    if (opts.muted) {
      const bx = sx + r * 0.72, by = cy + r * 0.72;
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath(); ctx.arc(bx, by, r * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(bx - r * 0.18, by - r * 0.18); ctx.lineTo(bx + r * 0.18, by + r * 0.18); ctx.stroke();
    }

    // Name label
    if (opts.pseudo) {
      ctx.font = 'bold ' + Math.max(9, Math.round(r * 0.52)) + 'px "Segoe UI", sans-serif';
      const tw = ctx.measureText(opts.pseudo).width;
      const py = cy + r + 4;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      const px = sx - tw / 2 - 5, pw = tw + 10, ph = 15, rr = 4;
      ctx.moveTo(px + rr, py); ctx.arcTo(px + pw, py, px + pw, py + ph, rr);
      ctx.arcTo(px + pw, py + ph, px, py + ph, rr); ctx.arcTo(px, py + ph, px, py, rr);
      ctx.arcTo(px, py, px + pw, py, rr); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(opts.pseudo, sx, py + ph / 2);
    }

    ctx.restore();

    // Remember screen bounds (in world space) for click hit-testing.
    return { sx: sx, cy: cy, r: r };
  },

  // ===== Enlarged view (click a bubble) =====
  showEnlarged(socketId) {
    let videoEl, pseudo;
    if (socketId === 'me') {
      videoEl = this._localVideoEl; pseudo = (Engine.player && Engine.player.pseudo) || 'Moi';
    } else {
      const peer = Audio.peers.get(socketId);
      videoEl = peer && peer.videoEl;
      const rp = Network.remotePlayers.get(socketId);
      pseudo = rp ? rp.pseudo : 'Participant';
    }
    if (!videoEl) { UI.showNotification && UI.showNotification('Aucune caméra à afficher (trop loin ?)'); return; }
    this.enlargedSocketId = socketId;

    let overlay = document.getElementById('video-enlarged');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'video-enlarged';
      overlay.innerHTML = '<div class="ve-inner"><video id="ve-video" autoplay muted playsinline></video><div class="ve-name" id="ve-name"></div><button class="ve-close" id="ve-close" aria-label="Fermer">&times;</button></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) this.hideEnlarged(); });
      document.getElementById('ve-close').addEventListener('click', () => this.hideEnlarged());
    }
    const veVideo = document.getElementById('ve-video');
    veVideo.srcObject = videoEl.srcObject;
    if (socketId === 'me') veVideo.style.transform = 'scaleX(-1)'; else veVideo.style.transform = '';
    const p = veVideo.play(); if (p && p.catch) p.catch(() => {});
    document.getElementById('ve-name').textContent = pseudo;
    overlay.style.display = 'flex';
  },

  hideEnlarged() {
    this.enlargedSocketId = null;
    const overlay = document.getElementById('video-enlarged');
    if (overlay) {
      const v = document.getElementById('ve-video');
      if (v) v.srcObject = null;
      overlay.style.display = 'none';
    }
  },

  destroy() {
    this.hideEnlarged();
    this._teardownLocalVideo();
    this.enabled = false;
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Video;
