// Character: articulated isometric character rendering and animation
// Inspired by drawChar() reference — head, body, arms, legs, shoes, eyes following direction

const Character = {
  // Draw a character at grid position (gx, gy) with given colors and animation state
  draw(ctx, gx, gy, offsetX, offsetY, options = {}) {
    const {
      colors = CONSTANTS.DEFAULT_COLORS,
      direction = { dx: 0, dy: 1 }, // facing direction
      walkPhase = 0, // 0..2*PI oscillation
      isWalking = false,
      pseudo = '',
      isOnStage = false,
      isAdmin = false,
      disconnected = false,
    } = options;

    const pos = Board.iso(gx, gy, isOnStage ? 6 : 0);
    const sx = pos.x + offsetX;
    const sy = pos.y + offsetY;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, 10, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    // Animation
    const legSwing = isWalking ? Math.sin(walkPhase) * 4 : 0;
    const armSwing = isWalking ? Math.sin(walkPhase) * 3 : 0;
    const bodyBob = isWalking ? Math.abs(Math.sin(walkPhase)) * 1.5 : 0;

    const baseY = sy - 2 - bodyBob;

    // --- Legs ---
    // Left leg
    ctx.beginPath();
    ctx.moveTo(sx - 3, baseY);
    ctx.lineTo(sx - 3 - legSwing * 0.3, baseY + 10 + legSwing);
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.pants;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Left shoe
    ctx.beginPath();
    ctx.arc(sx - 3 - legSwing * 0.3, baseY + 11 + legSwing, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.shoes;
    ctx.fill();

    // Right leg
    ctx.beginPath();
    ctx.moveTo(sx + 3, baseY);
    ctx.lineTo(sx + 3 + legSwing * 0.3, baseY + 10 - legSwing);
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.pants;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Right shoe
    ctx.beginPath();
    ctx.arc(sx + 3 + legSwing * 0.3, baseY + 11 - legSwing, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.shoes;
    ctx.fill();

    // --- Body (torso) ---
    ctx.beginPath();
    ctx.moveTo(sx, baseY - 12);
    ctx.lineTo(sx - 6, baseY - 4);
    ctx.lineTo(sx - 5, baseY + 2);
    ctx.lineTo(sx + 5, baseY + 2);
    ctx.lineTo(sx + 6, baseY - 4);
    ctx.closePath();
    ctx.fillStyle = colors.shirt;
    ctx.fill();

    // Shirt detail line
    ctx.beginPath();
    ctx.moveTo(sx, baseY - 10);
    ctx.lineTo(sx, baseY + 1);
    ctx.strokeStyle = this.darken(colors.shirt, 0.15);
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // --- Arms ---
    // Left arm
    ctx.beginPath();
    ctx.moveTo(sx - 6, baseY - 8);
    ctx.lineTo(sx - 9 - armSwing * 0.4, baseY - 1 + armSwing);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = colors.shirt;
    ctx.lineCap = 'round';
    ctx.stroke();
    // Hand
    ctx.beginPath();
    ctx.arc(sx - 9 - armSwing * 0.4, baseY - 1 + armSwing, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = colors.skin;
    ctx.fill();

    // Right arm
    ctx.beginPath();
    ctx.moveTo(sx + 6, baseY - 8);
    ctx.lineTo(sx + 9 + armSwing * 0.4, baseY - 1 - armSwing);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = colors.shirt;
    ctx.lineCap = 'round';
    ctx.stroke();
    // Hand
    ctx.beginPath();
    ctx.arc(sx + 9 + armSwing * 0.4, baseY - 1 - armSwing, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = colors.skin;
    ctx.fill();

    // --- Head ---
    const headY = baseY - 20;

    // Neck
    ctx.fillStyle = colors.skin;
    ctx.fillRect(sx - 1.5, baseY - 14, 3, 3);

    // Head shape (oval)
    ctx.beginPath();
    ctx.ellipse(sx, headY, 7, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = colors.skin;
    ctx.fill();

    // Hair
    ctx.beginPath();
    ctx.ellipse(sx, headY - 2, 7.5, 6, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = colors.hair;
    ctx.fill();
    // Side hair
    ctx.beginPath();
    ctx.ellipse(sx - 6.5, headY - 1, 2, 4, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = colors.hair;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(sx + 6.5, headY - 1, 2, 4, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = colors.hair;
    ctx.fill();

    // --- Eyes (follow direction) ---
    const eyeOffsetX = direction.dx * 2;
    const eyeOffsetY = direction.dy * 1;

    // Left eye
    ctx.beginPath();
    ctx.ellipse(sx - 2.5 + eyeOffsetX * 0.3, headY + 1 + eyeOffsetY * 0.3, 1.5, 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx - 2.5 + eyeOffsetX * 0.6, headY + 1 + eyeOffsetY * 0.5, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();

    // Right eye
    ctx.beginPath();
    ctx.ellipse(sx + 2.5 + eyeOffsetX * 0.3, headY + 1 + eyeOffsetY * 0.3, 1.5, 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx + 2.5 + eyeOffsetX * 0.6, headY + 1 + eyeOffsetY * 0.5, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();

    // Mouth (small smile)
    ctx.beginPath();
    ctx.arc(sx + eyeOffsetX * 0.2, headY + 4, 2, 0.1, Math.PI - 0.1);
    ctx.strokeStyle = this.darken(colors.skin, 0.3);
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // --- Pseudo label ---
    if (pseudo) {
      this.drawPseudo(ctx, sx, headY - 16, pseudo, isAdmin);
    }

    // Disconnected indicator
    if (disconnected) {
      ctx.font = '8px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FF6B6B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('(déconnecté)', sx, headY - (pseudo ? 28 : 16));
    }

    // Stage indicator
    if (isOnStage && !disconnected) {
      this.drawBroadcastIndicator(ctx, sx, headY - (pseudo ? (disconnected ? 38 : 28) : 16));
    }
  },

  drawPseudo(ctx, sx, sy, text, isAdmin = false) {
    const displayText = isAdmin ? `★ ${text}` : text;
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    const metrics = ctx.measureText(displayText);
    const tw = metrics.width + 8;
    const th = 14;

    // Background pill
    ctx.fillStyle = 'rgba(10, 10, 26, 0.75)';
    ctx.beginPath();
    ctx.roundRect(sx - tw / 2, sy - th / 2, tw, th, 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(126, 184, 218, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Text
    ctx.fillStyle = isAdmin ? '#FFD700' : '#e0e0e0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, sx, sy);
  },

  drawBroadcastIndicator(ctx, sx, sy) {
    // Pulsing broadcast icon
    ctx.font = '9px "Segoe UI", sans-serif';
    ctx.fillStyle = '#FF6B6B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BROADCAST', sx, sy);
  },

  // Draw preview in avatar configuration
  drawPreview(ctx, width, height, colors, animTime = 0) {
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw a grid snippet for context
    const cx = width / 2;
    const cy = height * 0.7;

    // Simple floor
    for (let y = -2; y <= 2; y++) {
      for (let x = -2; x <= 2; x++) {
        const angle = Math.PI / 6;
        const tw = 40 * Math.cos(angle);
        const th = 20;
        const sx = cx + (x - y) * tw / 2;
        const sy = cy + (x + y) * th / 2 - 30;
        const isEven = (x + y + 4) % 2 === 0;

        ctx.beginPath();
        ctx.moveTo(sx, sy - th / 4);
        ctx.lineTo(sx + tw / 4, sy);
        ctx.lineTo(sx, sy + th / 4);
        ctx.lineTo(sx - tw / 4, sy);
        ctx.closePath();
        ctx.fillStyle = isEven ? '#3a4a5c' : '#344458';
        ctx.fill();
      }
    }

    // Draw character in center with idle animation
    const walkPhase = animTime * 3;

    // Save and translate for centered drawing
    ctx.save();
    const charX = cx;
    const charY = cy - 28;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(charX, charY + 14, 12, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    const bob = Math.abs(Math.sin(walkPhase)) * 1;
    const bY = charY - bob;

    // Scale up for preview
    const s = 1.5;
    ctx.translate(charX, bY);
    ctx.scale(s, s);
    ctx.translate(-charX, -bY);

    // Legs
    const lSwing = Math.sin(walkPhase) * 3;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(charX - 3, bY);
    ctx.lineTo(charX - 3, bY + 10 + lSwing);
    ctx.strokeStyle = colors.pants;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(charX - 3, bY + 11 + lSwing, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.shoes;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(charX + 3, bY);
    ctx.lineTo(charX + 3, bY + 10 - lSwing);
    ctx.strokeStyle = colors.pants;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(charX + 3, bY + 11 - lSwing, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.shoes;
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.moveTo(charX, bY - 12);
    ctx.lineTo(charX - 6, bY - 4);
    ctx.lineTo(charX - 5, bY + 2);
    ctx.lineTo(charX + 5, bY + 2);
    ctx.lineTo(charX + 6, bY - 4);
    ctx.closePath();
    ctx.fillStyle = colors.shirt;
    ctx.fill();

    // Arms
    const aSwing = Math.sin(walkPhase) * 2;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(charX - 6, bY - 8);
    ctx.lineTo(charX - 9, bY - 1 + aSwing);
    ctx.strokeStyle = colors.shirt;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(charX - 9, bY - 1 + aSwing, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = colors.skin;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(charX + 6, bY - 8);
    ctx.lineTo(charX + 9, bY - 1 - aSwing);
    ctx.strokeStyle = colors.shirt;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(charX + 9, bY - 1 - aSwing, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = colors.skin;
    ctx.fill();

    // Head
    const headY = bY - 20;
    ctx.fillStyle = colors.skin;
    ctx.fillRect(charX - 1.5, bY - 14, 3, 3);
    ctx.beginPath();
    ctx.ellipse(charX, headY, 7, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = colors.skin;
    ctx.fill();

    // Hair
    ctx.beginPath();
    ctx.ellipse(charX, headY - 2, 7.5, 6, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = colors.hair;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(charX - 6.5, headY - 1, 2, 4, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = colors.hair;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(charX + 6.5, headY - 1, 2, 4, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = colors.hair;
    ctx.fill();

    // Eyes
    ctx.beginPath();
    ctx.ellipse(charX - 2.5, headY + 1, 1.5, 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(charX - 2.5, headY + 1, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(charX + 2.5, headY + 1, 1.5, 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(charX + 2.5, headY + 1, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();

    // Mouth
    ctx.beginPath();
    ctx.arc(charX, headY + 4, 2, 0.1, Math.PI - 0.1);
    ctx.strokeStyle = this.darken(colors.skin, 0.3);
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.restore();
  },

  darken(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, Math.floor(((num >> 16) & 0xFF) * (1 - amount)));
    const g = Math.max(0, Math.floor(((num >> 8) & 0xFF) * (1 - amount)));
    const b = Math.max(0, Math.floor((num & 0xFF) * (1 - amount)));
    return `rgb(${r},${g},${b})`;
  },
};
