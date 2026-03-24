// Audio: WebRTC peer-to-peer audio with proximity-based volume

const Audio = {
  localStream: null,
  peers: new Map(), // socketId -> { connection, audioElement, currentVolume, connected, pendingCandidates }
  audioContext: null,
  masterVolume: 1,
  isMuted: false,
  hasPermission: false,

  // Audio devices
  selectedInputDevice: null,
  selectedOutputDevice: null,

  // Prevent rapid connect/disconnect
  _connectingPeers: new Set(),

  async init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Resume AudioContext on any user interaction (Chrome autoplay policy)
      const resumeCtx = () => {
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
      };
      ['click', 'touchstart', 'keydown'].forEach(evt => {
        document.addEventListener(evt, resumeCtx, { once: false, passive: true });
      });
    } catch (e) {
      console.warn('AudioContext not available');
    }
  },

  async requestMicrophone() {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Prefer higher quality voice settings
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 1 },
          latency: { ideal: 0.01 },
        },
        video: false,
      };

      if (this.selectedInputDevice) {
        constraints.audio.deviceId = { exact: this.selectedInputDevice };
      }

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.hasPermission = true;

      // Apply mute state to newly acquired tracks
      if (this.isMuted) {
        this.localStream.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      }

      return true;
    } catch (e) {
      console.warn('Microphone permission denied:', e.message);
      this.hasPermission = false;
      return false;
    }
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    this._applyMuteState();
    if (Network.socket) {
      Network.socket.emit('mute-changed', { muted: this.isMuted });
    }
    return this.isMuted;
  },

  // Centralized mute application — ensures all tracks match mute state
  _applyMuteState() {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });
    }
  },

  setMasterVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    for (const [, peer] of this.peers) {
      if (peer.audioElement) {
        peer.audioElement.volume = peer.currentVolume * this.masterVolume;
      }
    }
  },

  _createPeerConfig() {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
    };
  },

  _setupPeerConnection(socketId, connection) {
    const audioElement = new window.Audio();
    audioElement.autoplay = true;

    // Set output device if selected
    if (this.selectedOutputDevice && audioElement.setSinkId) {
      audioElement.setSinkId(this.selectedOutputDevice).catch(() => {});
    }

    const peer = {
      connection,
      audioElement,
      currentVolume: 0,
      connected: false,
      pendingCandidates: [],
      _disconnectTimer: null,
    };

    this.peers.set(socketId, peer);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        connection.addTrack(track, this.localStream);
      });
    }

    // Handle remote stream
    connection.ontrack = (event) => {
      audioElement.srcObject = event.streams[0];
      peer.connected = true;
    };

    // ICE candidates
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        Network.socket.emit('rtc-ice-candidate', {
          targetSocketId: socketId,
          candidate: event.candidate,
        });
      }
    };

    // ICE restart on disconnection
    connection.oniceconnectionstatechange = () => {
      if (connection.iceConnectionState === 'disconnected') {
        // Try ICE restart before giving up
        setTimeout(() => {
          if (connection.iceConnectionState === 'disconnected') {
            connection.createOffer({ iceRestart: true }).then(offer => {
              return connection.setLocalDescription(offer);
            }).then(() => {
              Network.socket.emit('rtc-offer', {
                targetSocketId: socketId,
                offer: connection.localDescription,
              });
            }).catch(() => {});
          }
        }, 2000);
      }
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      if (state === 'failed' || state === 'closed') {
        this.disconnectPeer(socketId);
      }
    };

    return peer;
  },

  // Prefer Opus codec with high bitrate for voice clarity
  _preferOpus(sdp) {
    // Set Opus parameters for voice: maxaveragebitrate, stereo off, DTX on (silence suppression)
    if (sdp.indexOf('opus/48000') === -1) return sdp;
    return sdp.replace(
      /a=fmtp:(\d+) (.+)/g,
      function(match, pt, params) {
        if (sdp.indexOf('a=rtpmap:' + pt + ' opus/48000') !== -1) {
          var extra = '';
          if (params.indexOf('maxaveragebitrate') === -1) extra += ';maxaveragebitrate=32000';
          if (params.indexOf('usedtx') === -1) extra += ';usedtx=1';
          if (params.indexOf('stereo') === -1) extra += ';stereo=0';
          return 'a=fmtp:' + pt + ' ' + params + extra;
        }
        return match;
      }
    );
  },

  // Create or update peer connection for audio
  async connectToPeer(socketId) {
    if (this.peers.has(socketId) || this._connectingPeers.has(socketId)) return;
    if (!this.localStream) return;

    this._connectingPeers.add(socketId);

    try {
      const connection = new RTCPeerConnection(this._createPeerConfig());
      this._setupPeerConnection(socketId, connection);

      // Create offer with Opus preference
      const offer = await connection.createOffer();
      offer.sdp = this._preferOpus(offer.sdp);
      await connection.setLocalDescription(offer);
      Network.socket.emit('rtc-offer', {
        targetSocketId: socketId,
        offer: connection.localDescription,
      });
    } catch (e) {
      console.error('Error creating offer for', socketId, ':', e.message);
      this.peers.delete(socketId);
    } finally {
      this._connectingPeers.delete(socketId);
    }
  },

  async handleOffer(fromSocketId, offer) {
    if (!this.localStream) return;

    // If we already have a peer with an active connection, handle glare
    let peer = this.peers.get(fromSocketId);
    if (peer) {
      const state = peer.connection.signalingState;
      if (state === 'have-local-offer') {
        // Glare: both sides sent offers. Use socket ID comparison to break tie.
        // Lower socket ID wins (keeps their offer, other side accepts)
        if (Network.mySocketId < fromSocketId) {
          // We win: ignore their offer, they'll accept our answer
          return;
        } else {
          // They win: close our connection, accept their offer
          this.disconnectPeer(fromSocketId);
        }
      } else if (state !== 'stable' && state !== 'closed') {
        // Connection in unexpected state — reset
        this.disconnectPeer(fromSocketId);
      } else if (state === 'stable' && peer.connected) {
        // Already connected and stable — ignore duplicate offer
        return;
      }
    }

    try {
      const connection = new RTCPeerConnection(this._createPeerConfig());
      peer = this._setupPeerConnection(fromSocketId, connection);

      await connection.setRemoteDescription(new RTCSessionDescription(offer));

      // Flush any pending ICE candidates
      for (const candidate of peer.pendingCandidates) {
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      }
      peer.pendingCandidates = [];

      const answer = await connection.createAnswer();
      answer.sdp = this._preferOpus(answer.sdp);
      await connection.setLocalDescription(answer);
      Network.socket.emit('rtc-answer', {
        targetSocketId: fromSocketId,
        answer: connection.localDescription,
      });
    } catch (e) {
      console.error('Error handling offer from', fromSocketId, ':', e.message);
      this.disconnectPeer(fromSocketId);
    }
  },

  async handleAnswer(fromSocketId, answer) {
    const peer = this.peers.get(fromSocketId);
    if (!peer) return;

    // Only set remote description if we're in the right state
    const state = peer.connection.signalingState;
    if (state !== 'have-local-offer') {
      console.warn('Ignoring answer from', fromSocketId, '- state is', state);
      return;
    }

    try {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));

      // Flush any pending ICE candidates
      for (const candidate of peer.pendingCandidates) {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      }
      peer.pendingCandidates = [];
    } catch (e) {
      console.error('Error handling answer from', fromSocketId, ':', e.message);
      this.disconnectPeer(fromSocketId);
    }
  },

  async handleIceCandidate(fromSocketId, candidate) {
    const peer = this.peers.get(fromSocketId);
    if (!peer) return;

    try {
      // If remote description is not set yet, queue the candidate
      if (!peer.connection.remoteDescription) {
        peer.pendingCandidates.push(candidate);
        return;
      }
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      // Silently ignore ICE candidate errors (common and non-fatal)
    }
  },

  disconnectPeer(socketId) {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    if (peer._disconnectTimer) {
      clearTimeout(peer._disconnectTimer);
      peer._disconnectTimer = null;
    }
    try {
      if (peer.connection && peer.connection.connectionState !== 'closed') {
        peer.connection.close();
      }
    } catch (e) { /* ignore */ }
    if (peer.audioElement) {
      peer.audioElement.srcObject = null;
      try { peer.audioElement.remove(); } catch (e) { /* ignore */ }
    }
    this.peers.delete(socketId);
    this._connectingPeers.delete(socketId);
  },

  // Update volumes based on proximity
  updateProximity(localPlayer, remotePlayers, audioRadius) {
    for (const [socketId, remotePlayer] of remotePlayers) {
      const peer = this.peers.get(socketId);

      const localOnStage = Board.isOnStage(Math.floor(localPlayer.x), Math.floor(localPlayer.y));
      const remoteOnStage = Board.isOnStage(Math.floor(remotePlayer.renderX), Math.floor(remotePlayer.renderY));

      let volume = 0;
      const localTableId = localPlayer.tableId || null;
      const remoteTableId = remotePlayer.tableId || null;

      // 1. Admin broadcast (Space key): heard by everyone at full volume
      if (remotePlayer.isBroadcasting) {
        volume = 1;
      }
      // 2. Stage: anyone on stage is heard by everyone
      else if (remoteOnStage && !remotePlayer.isMuted) {
        volume = 1;
      }
      // 3. Table bubble: same table = hear each other clearly
      else if (localTableId && localTableId === remoteTableId) {
        volume = 1;
      }
      // 4. Proximity audio
      else {
        const dist = Math.sqrt(
          (localPlayer.x - remotePlayer.renderX) ** 2 +
          (localPlayer.y - remotePlayer.renderY) ** 2
        );
        if (dist < audioRadius) {
          const fadeStart = Math.min(CONSTANTS.AUDIO_FADE_START, audioRadius * 0.5);
          if (dist <= fadeStart) {
            volume = 1;
          } else {
            volume = Math.max(0, 1 - (dist - fadeStart) / (audioRadius - fadeStart));
          }
          volume = volume * volume;
        }
      }

      // Muted remote players: force volume 0 but keep connection
      if (remotePlayer.isMuted && !remotePlayer.isBroadcasting) {
        volume = 0;
      }

      const shouldConnect = volume > 0 || localOnStage || remoteOnStage || remotePlayer.isBroadcasting || localPlayer.isBroadcasting;

      if (shouldConnect && !peer && !this._connectingPeers.has(socketId)) {
        this.connectToPeer(socketId);
      } else if (!shouldConnect && peer && volume === 0) {
        // Hysteresis: don't immediately disconnect
        if (!peer._disconnectTimer) {
          peer._disconnectTimer = setTimeout(() => {
            const p = this.peers.get(socketId);
            if (p && p.currentVolume === 0) {
              this.disconnectPeer(socketId);
            }
          }, 3000);
        }
      }

      if (peer) {
        if (volume > 0 && peer._disconnectTimer) {
          clearTimeout(peer._disconnectTimer);
          peer._disconnectTimer = null;
        }
        peer.currentVolume = volume;
        if (peer.audioElement) {
          peer.audioElement.volume = volume * this.masterVolume;
        }
      }
    }

    // Disconnect peers for players no longer in the room
    for (const [socketId] of this.peers) {
      if (!remotePlayers.has(socketId)) {
        this.disconnectPeer(socketId);
      }
    }
  },

  // Audio level analysis for speaking detection
  _analyser: null,
  _analyserData: null,
  _speakingThreshold: 0.015,
  _isSpeakingState: false,
  _speakingLastEmit: 0,

  setupAnalyser() {
    if (this._analyser || !this.audioContext || !this.localStream) return;
    try {
      // Resume audio context if suspended (needed after user gesture)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
        return; // Retry on next call
      }
      var source = this.audioContext.createMediaStreamSource(this.localStream);
      this._analyser = this.audioContext.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyserData = new Float32Array(this._analyser.fftSize);
      source.connect(this._analyser);
    } catch (e) { /* ignore */ }
  },

  getAudioLevel() {
    if (!this._analyser || !this._analyserData) return 0;
    this._analyser.getFloatTimeDomainData(this._analyserData);
    var sum = 0;
    for (var i = 0; i < this._analyserData.length; i++) {
      sum += this._analyserData[i] * this._analyserData[i];
    }
    return Math.sqrt(sum / this._analyserData.length);
  },

  isSpeaking() {
    if (!this.localStream || this.isMuted || !this.audioContext) return false;
    this.setupAnalyser();
    var level = this.getAudioLevel();
    var speaking = level > this._speakingThreshold;

    // Emit speaking state to server (throttled to 4 times/sec)
    var now = Date.now();
    if (speaking !== this._isSpeakingState && now - this._speakingLastEmit > 250) {
      this._isSpeakingState = speaking;
      this._speakingLastEmit = now;
      if (Network.socket) {
        Network.socket.emit('speaking-changed', { speaking: speaking });
      }
    }

    return speaking;
  },

  async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        inputs: devices.filter(d => d.kind === 'audioinput'),
        outputs: devices.filter(d => d.kind === 'audiooutput'),
      };
    } catch (e) {
      return { inputs: [], outputs: [] };
    }
  },

  async setInputDevice(deviceId) {
    this.selectedInputDevice = deviceId;
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      await this.requestMicrophone();
      for (const [, peer] of this.peers) {
        const senders = peer.connection.getSenders();
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
        if (audioSender && this.localStream) {
          audioSender.replaceTrack(this.localStream.getAudioTracks()[0]);
        }
      }
    }
  },

  destroy() {
    // Stop all local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    // Disconnect all peers (copies keys to avoid mutation during iteration)
    for (const sid of [...this.peers.keys()]) {
      this.disconnectPeer(sid);
    }
    this._connectingPeers.clear();
    // Clean up analyser
    this._analyser = null;
    this._analyserData = null;
    this._isSpeakingState = false;
    // Close audio context
    if (this.audioContext) {
      try { this.audioContext.close(); } catch (e) { /* ignore */ }
      this.audioContext = null;
    }
    this.hasPermission = false;
    this.isMuted = false;
  },
};
