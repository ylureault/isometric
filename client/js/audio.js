// Audio: WebRTC peer-to-peer audio with proximity-based volume

const Audio = {
  localStream: null,
  peers: new Map(), // socketId -> { connection, audioElement, gainNode }
  audioContext: null,
  masterVolume: 1,
  isMuted: false,
  hasPermission: false,

  // Audio devices
  selectedInputDevice: null,
  selectedOutputDevice: null,

  async init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
        },
        video: false,
      };

      if (this.selectedInputDevice) {
        constraints.audio.deviceId = { exact: this.selectedInputDevice };
      }

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.hasPermission = true;
      return true;
    } catch (e) {
      console.warn('Microphone permission denied:', e.message);
      this.hasPermission = false;
      return false;
    }
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });
    }
    // Notify server
    if (Network.socket) {
      Network.socket.emit('mute-changed', { muted: this.isMuted });
    }
    return this.isMuted;
  },

  setMasterVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    // Update all peer volumes
    for (const [, peer] of this.peers) {
      if (peer.audioElement) {
        peer.audioElement.volume = peer.currentVolume * this.masterVolume;
      }
    }
  },

  // Create or update peer connection for audio
  async connectToPeer(socketId) {
    if (this.peers.has(socketId)) return;
    if (!this.localStream) return;

    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    const connection = new RTCPeerConnection(config);
    const audioElement = new window.Audio();
    audioElement.autoplay = true;

    const peer = {
      connection,
      audioElement,
      currentVolume: 0,
      connected: false,
    };

    this.peers.set(socketId, peer);

    // Add local tracks
    this.localStream.getTracks().forEach(track => {
      connection.addTrack(track, this.localStream);
    });

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

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        this.disconnectPeer(socketId);
      }
    };

    // Create offer
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      Network.socket.emit('rtc-offer', {
        targetSocketId: socketId,
        offer: connection.localDescription,
      });
    } catch (e) {
      console.error('Error creating offer:', e);
    }
  },

  async handleOffer(fromSocketId, offer) {
    if (!this.localStream) return;

    let peer = this.peers.get(fromSocketId);
    if (!peer) {
      const config = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      };
      const connection = new RTCPeerConnection(config);
      const audioElement = new window.Audio();
      audioElement.autoplay = true;

      peer = { connection, audioElement, currentVolume: 0, connected: false };
      this.peers.set(fromSocketId, peer);

      this.localStream.getTracks().forEach(track => {
        connection.addTrack(track, this.localStream);
      });

      connection.ontrack = (event) => {
        audioElement.srcObject = event.streams[0];
        peer.connected = true;
      };

      connection.onicecandidate = (event) => {
        if (event.candidate) {
          Network.socket.emit('rtc-ice-candidate', {
            targetSocketId: fromSocketId,
            candidate: event.candidate,
          });
        }
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
          this.disconnectPeer(fromSocketId);
        }
      };
    }

    try {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      Network.socket.emit('rtc-answer', {
        targetSocketId: fromSocketId,
        answer: peer.connection.localDescription,
      });
    } catch (e) {
      console.error('Error handling offer:', e);
    }
  },

  async handleAnswer(fromSocketId, answer) {
    const peer = this.peers.get(fromSocketId);
    if (!peer) return;
    try {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (e) {
      console.error('Error handling answer:', e);
    }
  },

  async handleIceCandidate(fromSocketId, candidate) {
    const peer = this.peers.get(fromSocketId);
    if (!peer) return;
    try {
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding ICE candidate:', e);
    }
  },

  disconnectPeer(socketId) {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    if (peer.connection) peer.connection.close();
    if (peer.audioElement) {
      peer.audioElement.srcObject = null;
      peer.audioElement.remove();
    }
    this.peers.delete(socketId);
  },

  // Update volumes based on proximity
  updateProximity(localPlayer, remotePlayers, audioRadius) {
    for (const [socketId, remotePlayer] of remotePlayers) {
      const peer = this.peers.get(socketId);

      // Check if we need to connect/disconnect
      const localOnStage = Board.isOnStage(Math.floor(localPlayer.x), Math.floor(localPlayer.y));
      const remoteOnStage = Board.isOnStage(Math.floor(remotePlayer.renderX), Math.floor(remotePlayer.renderY));

      // Determine if audio should be active
      let volume = 0;
      const localTableId = localPlayer.tableId || null;
      const remoteTableId = remotePlayer.tableId || null;

      // Stage broadcast: anyone on stage is heard by everyone
      if (remoteOnStage && !remotePlayer.isMuted) {
        volume = 1;
      }
      // Table bubble: same table = hear each other
      else if (localTableId && localTableId === remoteTableId) {
        volume = 1;
      }
      // Proximity audio (only if both are NOT at tables)
      else if (!localTableId && !remoteTableId) {
        const dist = Math.sqrt(
          (localPlayer.x - remotePlayer.renderX) ** 2 +
          (localPlayer.y - remotePlayer.renderY) ** 2
        );
        if (dist < audioRadius) {
          volume = Math.max(0, 1 - dist / audioRadius);
        }
      }

      // Stage priority: if I'm at a table but someone is on stage, still hear them
      if (remoteOnStage && !remotePlayer.isMuted) {
        volume = Math.max(volume, 1);
      }

      const shouldConnect = volume > 0 || localOnStage || remoteOnStage;

      if (shouldConnect && !peer) {
        this.connectToPeer(socketId);
      } else if (!shouldConnect && peer) {
        this.disconnectPeer(socketId);
      }

      if (peer) {
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

  // Check if local user is speaking (for visual indicator)
  isSpeaking() {
    if (!this.localStream || this.isMuted || !this.audioContext) return false;
    // Simple speaking detection based on audio level would require analyser node
    // For now, return false - full implementation would use AudioAnalyser
    return false;
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
      // Re-add tracks to existing connections
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
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }
    for (const [sid] of this.peers) {
      this.disconnectPeer(sid);
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  },
};
