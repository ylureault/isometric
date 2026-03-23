// Character: detailed isometric person with direction-aware rendering

const Character = {
  draw(ctx, gx, gy, offsetX, offsetY, opts) {
    const {
      colors = CONSTANTS.DEFAULT_COLORS,
      direction = { dx: 0, dy: 1 },
      walkPhase = 0,
      isWalking = false,
      pseudo = '',
      isAdmin = false,
      isMuted = false,
      handRaised = false,
      isBroadcasting = false,
      isOnStage = false,
      disconnected = false,
    } = opts || {};

    const pos = Board.iso(gx, gy);
    const sx = pos.x + offsetX;
    const sy = pos.y + offsetY;
    const S = 0.7;

    ctx.save();
    if (disconnected) ctx.globalAlpha = 0.4;

    const facing = this.getFacing(direction);

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2 * S, 12 * S, 6 * S, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fill();

    // Broadcasting glow
    if (isBroadcasting) {
      ctx.beginPath();
      ctx.ellipse(sx, sy - 18 * S, 20 * S, 14 * S, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(52,152,219,0.12)';
      ctx.fill();
    }

    // On stage spotlight
    if (isOnStage) {
      ctx.beginPath();
      ctx.ellipse(sx, sy + 2 * S, 16 * S, 8 * S, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(241,196,15,0.1)';
      ctx.fill();
    }

    // Walk animation values
    var walk = isWalking ? Math.sin(walkPhase * 6) * 0.3 : 0;
    var armSwing = isWalking ? Math.sin(walkPhase * 6) * 0.4 : 0;
    var bounce = isWalking ? Math.abs(Math.sin(walkPhase * 6)) * 1.5 : 0;
    var baseY = sy - bounce;

    this.drawBody(ctx, sx, baseY, S, colors, facing, walk, armSwing, handRaised);

    // Admin crown
    if (isAdmin) {
      this.drawCrown(ctx, sx, baseY - 44 * S, S);
    }

    // Muted icon
    if (isMuted) {
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(sx + 12 * S, baseY - 38 * S, 4 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2 * S;
      ctx.beginPath();
      ctx.moveTo(sx + 10 * S, baseY - 40 * S);
      ctx.lineTo(sx + 14 * S, baseY - 36 * S);
      ctx.stroke();
    }

    // Pseudo label
    if (pseudo) {
      ctx.font = 'bold ' + Math.max(9, Math.round(11 * S)) + 'px "Segoe UI", sans-serif';
      var tw = ctx.measureText(pseudo).width;
      var px = sx - tw / 2 - 5;
      var py = baseY + 12 * S;
      var pw = tw + 10;
      var ph = 16;
      var rr = 4;

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.moveTo(px + rr, py);
      ctx.lineTo(px + pw - rr, py);
      ctx.arcTo(px + pw, py, px + pw, py + rr, rr);
      ctx.lineTo(px + pw, py + ph - rr);
      ctx.arcTo(px + pw, py + ph, px + pw - rr, py + ph, rr);
      ctx.lineTo(px + rr, py + ph);
      ctx.arcTo(px, py + ph, px, py + ph - rr, rr);
      ctx.lineTo(px, py + rr);
      ctx.arcTo(px, py, px + rr, py, rr);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pseudo, sx, py + ph / 2);
    }

    ctx.restore();
  },

  getFacing: function(dir) {
    var dx = dir.dx || 0;
    var dy = dir.dy || 0;
    if (dy > 0 && dx >= 0) return 'front-right';
    if (dy > 0 && dx < 0) return 'front-left';
    if (dy < 0 && dx <= 0) return 'back-left';
    if (dy < 0 && dx > 0) return 'back-right';
    if (dx > 0) return 'front-right';
    if (dx < 0) return 'front-left';
    return 'front-right';
  },

  drawBody: function(ctx, sx, sy, S, colors, facing, walk, armSwing, handRaised) {
    var isFront = facing.indexOf('front') === 0;
    var isRight = facing.indexOf('right') >= 0;
    var bodyFlip = isRight ? 1 : -1;

    // ===== LEGS =====
    var legSpread = 4 * S;
    var legTop = sy - 4 * S;
    var legBot = sy + 2 * S;
    var legWalk = walk * 8 * S;

    // Left leg
    ctx.fillStyle = colors.pants;
    ctx.beginPath();
    ctx.moveTo(sx - legSpread - 3 * S, legTop);
    ctx.lineTo(sx - legSpread + 3 * S, legTop);
    ctx.lineTo(sx - legSpread + 3 * S - legWalk, legBot);
    ctx.lineTo(sx - legSpread - 3 * S - legWalk, legBot);
    ctx.closePath();
    ctx.fill();

    // Right leg
    ctx.beginPath();
    ctx.moveTo(sx + legSpread - 3 * S, legTop);
    ctx.lineTo(sx + legSpread + 3 * S, legTop);
    ctx.lineTo(sx + legSpread + 3 * S + legWalk, legBot);
    ctx.lineTo(sx + legSpread - 3 * S + legWalk, legBot);
    ctx.closePath();
    ctx.fill();

    // Shoes
    ctx.fillStyle = colors.shoes;
    ctx.fillRect(sx - legSpread - 4 * S - legWalk, legBot - 2 * S, 8 * S, 4 * S);
    ctx.fillRect(sx + legSpread - 4 * S + legWalk, legBot - 2 * S, 8 * S, 4 * S);

    // ===== TORSO =====
    var torsoTop = sy - 22 * S;
    var torsoBot = legTop + 2 * S;
    var torsoW = 12 * S;

    ctx.fillStyle = colors.shirt;
    ctx.beginPath();
    ctx.moveTo(sx - torsoW, torsoBot);
    ctx.lineTo(sx + torsoW, torsoBot);
    ctx.lineTo(sx + torsoW - 1 * S, torsoTop);
    ctx.lineTo(sx - torsoW + 1 * S, torsoTop);
    ctx.closePath();
    ctx.fill();

    // 3D shading on torso
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.moveTo(sx + (isRight ? -2 : 2) * S, torsoBot);
    ctx.lineTo(sx + torsoW * (isRight ? -1 : 1), torsoBot);
    ctx.lineTo(sx + (torsoW - 1) * (isRight ? -1 : 1), torsoTop);
    ctx.lineTo(sx + (isRight ? -2 : 2) * S, torsoTop);
    ctx.closePath();
    ctx.fill();

    // ===== ARMS =====
    var armY = torsoTop + 4 * S;
    var armLen = 16 * S;
    var armW = 4 * S;

    // Left arm
    ctx.save();
    ctx.translate(sx - torsoW, armY);
    ctx.rotate(-armSwing * 0.8);
    ctx.fillStyle = colors.shirt;
    ctx.fillRect(-armW, 0, armW, armLen * 0.6);
    ctx.fillStyle = colors.skin;
    ctx.fillRect(-armW + 0.5 * S, armLen * 0.55, armW - 1 * S, armLen * 0.4);
    ctx.restore();

    // Right arm
    ctx.save();
    ctx.translate(sx + torsoW, armY);
    ctx.rotate(handRaised ? -1.2 : armSwing * 0.8);
    ctx.fillStyle = colors.shirt;
    ctx.fillRect(0, 0, armW, armLen * 0.6);
    ctx.fillStyle = colors.skin;
    ctx.fillRect(0.5 * S, armLen * 0.55, armW - 1 * S, armLen * 0.4);
    if (handRaised) {
      ctx.fillStyle = colors.skin;
      ctx.fillRect(0, armLen * 0.85, armW + 1 * S, 5 * S);
    }
    ctx.restore();

    // ===== NECK =====
    ctx.fillStyle = colors.skin;
    ctx.fillRect(sx - 3 * S, torsoTop - 3 * S, 6 * S, 6 * S);

    // ===== HEAD =====
    var headCx = sx;
    var headCy = torsoTop - 12 * S;
    var headRx = 9 * S;
    var headRy = 10 * S;

    if (isFront) {
      // Hair back
      ctx.fillStyle = colors.hair;
      ctx.beginPath();
      ctx.ellipse(headCx, headCy - 1 * S, headRx + 1 * S, headRy + 1 * S, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    } else {
      // Full hair from back view
      ctx.fillStyle = colors.hair;
      ctx.beginPath();
      ctx.ellipse(headCx, headCy, headRx + 1 * S, headRy + 1 * S, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Face
    ctx.fillStyle = colors.skin;
    ctx.beginPath();
    ctx.ellipse(headCx, headCy, headRx, headRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair on top
    ctx.fillStyle = colors.hair;
    ctx.beginPath();
    ctx.ellipse(headCx, headCy - 4 * S, headRx + 0.5 * S, 6 * S, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    if (isFront) {
      // Eyes
      var eyeY = headCy - 1 * S;
      var eyeSpread = 4 * S;
      var eyeDir = bodyFlip * 1.5 * S;

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(headCx - eyeSpread + eyeDir, eyeY, 2.5 * S, 2 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(headCx + eyeSpread + eyeDir, eyeY, 2.5 * S, 2 * S, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(headCx - eyeSpread + eyeDir + bodyFlip * 0.8 * S, eyeY, 1.2 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(headCx + eyeSpread + eyeDir + bodyFlip * 0.8 * S, eyeY, 1.2 * S, 0, Math.PI * 2);
      ctx.fill();

      // Smile
      ctx.strokeStyle = '#c4956a';
      ctx.lineWidth = 1 * S;
      ctx.beginPath();
      ctx.arc(headCx + eyeDir * 0.3, headCy + 4 * S, 3 * S, 0.1, Math.PI - 0.1);
      ctx.stroke();
    }
  },

  drawCrown: function(ctx, cx, cy, S) {
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.moveTo(cx - 6 * S, cy + 4 * S);
    ctx.lineTo(cx - 6 * S, cy);
    ctx.lineTo(cx - 3 * S, cy + 2 * S);
    ctx.lineTo(cx, cy - 2 * S);
    ctx.lineTo(cx + 3 * S, cy + 2 * S);
    ctx.lineTo(cx + 6 * S, cy);
    ctx.lineTo(cx + 6 * S, cy + 4 * S);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d4a00a';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  },

  drawPreview: function(ctx, canvasW, canvasH, colors, time) {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvasW, canvasH);

    var cx = canvasW / 2;
    var cy = canvasH / 2 + 20;
    var S = 1.2;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 16, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fill();

    var phase = time * 0.5;
    var dx = Math.cos(phase);
    var dy = Math.sin(phase);
    var facing = this.getFacing({ dx: dx, dy: dy });
    var walkPhase = time * 2;

    this.drawBody(ctx, cx, cy, S, colors, facing, Math.sin(walkPhase * 3) * 0.2, Math.sin(walkPhase * 3) * 0.3, false);

    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText('Aperçu', cx, cy + 30);
  },
};
