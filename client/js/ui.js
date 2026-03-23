// UI: HUD updates, avatar configuration panel, controls

const UI = {
  avatarConfig: null,
  previewCanvas: null,
  previewCtx: null,
  previewAnimId: null,
  currentColors: { ...CONSTANTS.DEFAULT_COLORS },

  initAvatarConfig(onEnter) {
    this.avatarConfig = document.getElementById('avatar-config');
    this.previewCanvas = document.getElementById('avatar-preview-canvas');
    this.previewCtx = this.previewCanvas.getContext('2d');

    // Color pickers
    const colorInputs = {
      skin: document.getElementById('color-skin'),
      hair: document.getElementById('color-hair'),
      shirt: document.getElementById('color-shirt'),
      pants: document.getElementById('color-pants'),
      shoes: document.getElementById('color-shoes'),
    };

    // Set initial values
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

      // Stop preview animation
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

  updateHUD(roomName, playerX, playerY, participantCount) {
    document.getElementById('hud-room-name').textContent = roomName || 'Room';
    document.getElementById('hud-coords').textContent =
      `Position: ${Math.floor(playerX)}, ${Math.floor(playerY)}`;
    document.getElementById('hud-participants').textContent =
      `Participants: ${participantCount}`;
  },
};
