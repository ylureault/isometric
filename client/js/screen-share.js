// Screen Share: WebRTC screen sharing for admins

const ScreenShare = {
  localStream: null,
  isSharing: false,
  shareScope: null, // 'global' or 'table'
  shareTableId: null,

  // Outgoing screen share connections (sender side)
  outgoingPeers: new Map(), // socketId -> RTCPeerConnection

  // Incoming screen shares
  incomingShares: new Map(), // socketId -> { connection, videoElement }
  activeGlobalShare: null, // { socketId, pseudo }
  collabScreenOwners: new Set(), // socketIds sharing inside a table/collab space

  // True if the given participant is currently sharing a screen (any scope).
  isSharingFrom(socketId) {
    if (this.activeGlobalShare && this.activeGlobalShare.socketId === socketId) return true;
    if (this.incomingShares.has(socketId)) return true;
    if (this.collabScreenOwners.has(socketId)) return true;
    return false;
  },

  async startShare(scope = 'global', tableId = null) {
    try {
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });

      this.isSharing = true;
      this.shareScope = scope;
      this.shareTableId = tableId;

      // Handle stream end (user clicks "Stop sharing" in browser)
      this.localStream.getVideoTracks()[0].onended = () => {
        this.stopShare();
      };

      // Notify server
      Network.socket.emit('screen-share-start', { scope, tableId });

      // Send stream to all peers via WebRTC
      this.broadcastStream();

      return true;
    } catch (e) {
      console.warn('Screen share cancelled or failed:', e.message);
      return false;
    }
  },

  stopShare() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    this.isSharing = false;
    this.shareScope = null;
    this.shareTableId = null;

    // Close all outgoing peer connections
    for (const [sid, conn] of this.outgoingPeers) {
      try { conn.close(); } catch (e) { /* ignore */ }
    }
    this.outgoingPeers.clear();

    Network.socket.emit('screen-share-stop');
    UI.updateScreenShareButton();
  },

  broadcastStream() {
    if (!this.localStream) return;

    // For each remote player, create screen share connection
    for (const [socketId] of Network.remotePlayers) {
      this.sendStreamToPeer(socketId);
    }
  },

  async sendStreamToPeer(socketId) {
    if (!this.localStream) return;

    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    const connection = new RTCPeerConnection(config);

    // Store the outgoing connection so we can handle answers and ICE candidates
    this.outgoingPeers.set(socketId, connection);

    this.localStream.getTracks().forEach(track => {
      connection.addTrack(track, this.localStream);
    });

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        Network.socket.emit('screen-rtc-ice-candidate', {
          targetSocketId: socketId,
          candidate: event.candidate,
        });
      }
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        this.outgoingPeers.delete(socketId);
      }
    };

    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      Network.socket.emit('screen-rtc-offer', {
        targetSocketId: socketId,
        offer: connection.localDescription,
      });
    } catch (e) {
      console.error('Screen share offer error:', e);
    }
  },

  // Hidden (but rendered) sink so incoming <video> elements actually decode
  // frames. A detached or display:none video is throttled by the browser and
  // paints black when drawn to the canvas — it must be connected and playing.
  _getVideoSink() {
    let sink = document.getElementById('screen-share-sink');
    if (!sink) {
      sink = document.createElement('div');
      sink.id = 'screen-share-sink';
      sink.setAttribute('aria-hidden', 'true');
      // Off-screen but still rendered/decoded (do NOT use display:none).
      sink.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none;';
      document.body.appendChild(sink);
    }
    return sink;
  },

  async handleScreenOffer(fromSocketId, offer) {
    const config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    };

    const connection = new RTCPeerConnection(config);
    const videoElement = document.createElement('video');
    videoElement.autoplay = true;
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.setAttribute('playsinline', '');
    // Attach to the DOM so the browser keeps decoding frames for canvas drawing.
    this._getVideoSink().appendChild(videoElement);

    this.incomingShares.set(fromSocketId, { connection, videoElement });

    connection.ontrack = (event) => {
      if (videoElement.srcObject !== event.streams[0]) {
        videoElement.srcObject = event.streams[0];
      }
      // Explicitly start playback; autoplay alone is unreliable here.
      const p = videoElement.play();
      if (p && p.catch) p.catch(() => { /* will retry on loadedmetadata */ });
    };
    videoElement.addEventListener('loadedmetadata', () => {
      const p = videoElement.play();
      if (p && p.catch) p.catch(() => {});
    });

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        Network.socket.emit('screen-rtc-ice-candidate', {
          targetSocketId: fromSocketId,
          candidate: event.candidate,
        });
      }
    };

    try {
      await connection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      Network.socket.emit('screen-rtc-answer', {
        targetSocketId: fromSocketId,
        answer: connection.localDescription,
      });
    } catch (e) {
      console.error('Screen share answer error:', e);
    }
  },

  async handleScreenAnswer(fromSocketId, answer) {
    // The answer comes from a receiver, so look up our outgoing peer connection
    const connection = this.outgoingPeers.get(fromSocketId);
    if (!connection) return;
    try {
      await connection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (e) {
      console.error('Screen answer error:', e);
    }
  },

  async handleScreenIceCandidate(fromSocketId, candidate) {
    // Check outgoing connections first (we are the sender, they are sending ICE back)
    const outgoing = this.outgoingPeers.get(fromSocketId);
    if (outgoing) {
      try {
        await outgoing.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) { /* ignore non-fatal ICE errors */ }
      return;
    }
    // Otherwise check incoming connections (we are the receiver)
    const share = this.incomingShares.get(fromSocketId);
    if (!share) return;
    try {
      await share.connection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) { /* ignore non-fatal ICE errors */ }
  },

  removeShare(socketId) {
    const share = this.incomingShares.get(socketId);
    if (share) {
      if (share.connection) share.connection.close();
      if (share.videoElement) {
        try { share.videoElement.pause(); } catch (e) { /* ignore */ }
        share.videoElement.srcObject = null;
        if (share.videoElement.parentNode) share.videoElement.parentNode.removeChild(share.videoElement);
      }
      this.incomingShares.delete(socketId);
    }
    if (this.activeGlobalShare && this.activeGlobalShare.socketId === socketId) {
      this.activeGlobalShare = null;
    }
  },

  // Draw screen share on canvas (global share = center of plateau)
  drawGlobalShare(ctx, offsetX, offsetY, gridSize) {
    if (!this.activeGlobalShare) return;
    const share = this.incomingShares.get(this.activeGlobalShare.socketId);
    if (!share || !share.videoElement || !share.videoElement.videoWidth) return;

    const centerPos = Board.iso(gridSize / 2, gridSize / 2, 40);
    const sx = centerPos.x + offsetX;
    const sy = centerPos.y + offsetY;

    const screenW = 200;
    const screenH = screenW * (share.videoElement.videoHeight / share.videoElement.videoWidth) || 120;

    // Screen frame
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(sx - screenW / 2 - 4, sy - screenH - 4, screenW + 8, screenH + 8);

    // Video content
    try {
      ctx.drawImage(share.videoElement, sx - screenW / 2, sy - screenH, screenW, screenH);
    } catch (e) { /* video not ready */ }

    // Border
    ctx.strokeStyle = '#7eb8da';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - screenW / 2, sy - screenH, screenW, screenH);

    // Label
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.fillStyle = '#7eb8da';
    ctx.textAlign = 'center';
    ctx.fillText(`Partage de ${this.activeGlobalShare.pseudo}`, sx, sy + 14);
  },

  destroy() {
    this.stopShare();
    for (const [sid] of this.incomingShares) {
      this.removeShare(sid);
    }
    for (const [sid, conn] of this.outgoingPeers) {
      try { conn.close(); } catch (e) { /* ignore */ }
    }
    this.outgoingPeers.clear();
  },
};
