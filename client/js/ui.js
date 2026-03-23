// UI: HUD updates, avatar configuration panel, notifications, controls

const UI = {
  avatarConfig: null,
  previewCanvas: null,
  previewCtx: null,
  previewAnimId: null,
  currentColors: { ...CONSTANTS.DEFAULT_COLORS },
  notifications: [],

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
      input.addEventListener('input', () => {
        this.currentColors[key] = input.value;
      });
    }

    // Start preview animation
    let animTime = 0;
    const animatePreview = () => {
      animTime += 0.016;
      Character.drawPreview(
        this.previewCtx,
        this.previewCanvas.width,
        this.previewCanvas.height,
        this.currentColors,
        animTime
      );
      this.previewAnimId = requestAnimationFrame(animatePreview);
    };
    animatePreview();

    // Enter button
    document.getElementById('btn-enter').addEventListener('click', () => {
      const pseudo = document.getElementById('pseudo-input').value.trim();
      const errorEl = document.getElementById('error-pseudo');

      if (!pseudo) {
        errorEl.style.display = 'block';
        return;
      }
      errorEl.style.display = 'none';

      if (this.previewAnimId) {
        cancelAnimationFrame(this.previewAnimId);
      }

      // Hide config overlay
      this.avatarConfig.style.display = 'none';

      // Show HUD
      document.getElementById('hud').style.display = 'flex';
      document.getElementById('minimap-container').style.display = 'block';
      document.getElementById('controls-hint').style.display = 'block';

      onEnter({
        pseudo,
        colors: { ...this.currentColors },
      });
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
        </div>
      `;
    }
  },

  showCopyLink(roomId) {
    const container = document.getElementById('copy-link-container');
    if (container) {
      container.style.display = 'flex';
      const urlDisplay = document.getElementById('room-url-display');
      if (urlDisplay) {
        urlDisplay.textContent = `${window.location.origin}/client/room.html?room=${roomId}`;
      }
    }
  },

  updateHUD(roomName, playerX, playerY, participantCount) {
    document.getElementById('hud-room-name').textContent = roomName || 'Room';
    document.getElementById('hud-coords').textContent =
      `Position: ${Math.floor(playerX)}, ${Math.floor(playerY)}`;
    document.getElementById('hud-participants').textContent =
      `Participants: ${participantCount}`;
  },

  // Notification system
  showNotification(text) {
    const container = document.getElementById('notifications-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'notification';
    el.textContent = text;
    container.appendChild(el);

    // Trigger animation
    requestAnimationFrame(() => {
      el.classList.add('notification-show');
    });

    // Remove after duration
    setTimeout(() => {
      el.classList.remove('notification-show');
      el.classList.add('notification-hide');
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, CONSTANTS.NOTIFICATION_DURATION);
  },

  showReconnecting(show) {
    const el = document.getElementById('reconnecting-indicator');
    if (el) {
      el.style.display = show ? 'flex' : 'none';
    }
  },
};
