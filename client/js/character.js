// Character: detailed isometric person with direction-aware rendering

const Character = {
  draw(ctx, gx, gy, offsetX, offsetY, opts) {
    const {
      colors = CONSTANTS.DEFAULT_COLORS,
      direction = { dx: 0, dy: 1 },
      walkPhase = 0,
      isWalking = false,
      pseudo = '',
      accessory = 'none',
      chatBubble = null,
      isAdmin = false,
      isMuted = false,
      handRaised = false,
      isBroadcasting = false,
      isOnStage = false,
      isSpeaking = false,
      disconnected = false,
    } = opts || {};

    // Elevate character when on stage
    var elevation = Board.getElevationAt(Math.floor(gx), Math.floor(gy));
    const pos = Board.iso(gx, gy, elevation);
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

    // Accessory on head
    if (accessory && accessory !== 'none') {
      this.drawAccessory(ctx, sx, baseY, S, accessory);
    }

    // Chat bubble (message above head)
    if (chatBubble) {
      this.drawChatBubble(ctx, sx, baseY, S, chatBubble);
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

    // Speaking indicator — animated sound waves above head
    if (isSpeaking && !isMuted) {
      var spkX = sx;
      var spkY = baseY - 48 * S;
      var time = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
      // Pulsing sound waves
      for (var wi = 0; wi < 3; wi++) {
        var waveR = (4 + wi * 4) * S;
        var waveAlpha = 0.6 - wi * 0.18;
        var pulse = Math.sin(time * 6 + wi * 0.8) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(spkX, spkY, waveR * pulse, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.strokeStyle = 'rgba(46,204,113,' + (waveAlpha * pulse) + ')';
        ctx.lineWidth = 1.5 * S;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(spkX, spkY, waveR * pulse, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
      }
      // Green dot center
      ctx.beginPath();
      ctx.arc(spkX, spkY, 2.5 * S, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(46,204,113,0.9)';
      ctx.fill();
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

    // Isometric body tilt — lean slightly in direction of movement
    var tiltX = bodyFlip * 2 * S;
    // In iso, body should appear slightly rotated
    var shoulderNear = 13 * S;  // shoulder closer to viewer is wider
    var shoulderFar = 10 * S;   // farther shoulder is narrower (perspective)

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
    var torsoWL = isRight ? shoulderFar : shoulderNear;
    var torsoWR = isRight ? shoulderNear : shoulderFar;

    ctx.fillStyle = colors.shirt;
    ctx.beginPath();
    ctx.moveTo(sx - torsoWL + tiltX, torsoBot);
    ctx.lineTo(sx + torsoWR + tiltX, torsoBot);
    ctx.lineTo(sx + torsoWR - 1 * S + tiltX, torsoTop);
    ctx.lineTo(sx - torsoWL + 1 * S + tiltX, torsoTop);
    ctx.closePath();
    ctx.fill();

    // 3D shading on far side of torso
    var shadeLeft = isRight ? sx - torsoWL + tiltX : sx + tiltX;
    var shadeRight = isRight ? sx + tiltX : sx + torsoWR + tiltX;
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.moveTo(shadeLeft, torsoBot);
    ctx.lineTo(shadeRight, torsoBot);
    ctx.lineTo(shadeRight, torsoTop);
    ctx.lineTo(shadeLeft, torsoTop);
    ctx.closePath();
    ctx.fill();

    // ===== ARMS =====
    var armY = torsoTop + 4 * S;
    var armLen = 16 * S;
    var armW = 4 * S;

    // Left arm
    ctx.save();
    ctx.translate(sx - torsoWL + tiltX, armY);
    ctx.rotate(-armSwing * 0.8);
    ctx.fillStyle = colors.shirt;
    ctx.fillRect(-armW, 0, armW, armLen * 0.6);
    ctx.fillStyle = colors.skin;
    ctx.fillRect(-armW + 0.5 * S, armLen * 0.55, armW - 1 * S, armLen * 0.4);
    ctx.restore();

    // Right arm
    ctx.save();
    ctx.translate(sx + torsoWR + tiltX, armY);
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
    ctx.fillRect(sx + tiltX - 3 * S, torsoTop - 3 * S, 6 * S, 6 * S);

    // ===== HEAD =====
    var headCx = sx + tiltX;
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

  drawAccessory: function(ctx, sx, baseY, S, accessory) {
    var hx = sx;
    var hy = baseY - 46 * S;

    if (accessory === 'tophat') {
      // Top hat
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(hx, hy + 2 * S, 9 * S, 3 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(hx - 5 * S, hy - 10 * S, 10 * S, 12 * S);
      ctx.beginPath();
      ctx.ellipse(hx, hy - 10 * S, 5 * S, 2 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      // Band
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(hx - 5 * S, hy - 2 * S, 10 * S, 2 * S);
    } else if (accessory === 'cap') {
      // Baseball cap
      ctx.fillStyle = '#2980b9';
      ctx.beginPath();
      ctx.ellipse(hx, hy + 2 * S, 9 * S, 4 * S, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      // Visor
      ctx.beginPath();
      ctx.ellipse(hx + 4 * S, hy + 3 * S, 7 * S, 2.5 * S, 0.2, -0.3, Math.PI * 0.6);
      ctx.fillStyle = '#1a6596';
      ctx.fill();
    } else if (accessory === 'beanie') {
      // Beanie
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.ellipse(hx, hy - 1 * S, 8 * S, 6 * S, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      // Fold
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(hx - 8 * S, hy - 1 * S, 16 * S, 3 * S);
      // Pompom
      ctx.beginPath();
      ctx.arc(hx, hy - 7 * S, 2.5 * S, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    } else if (accessory === 'glasses') {
      // Glasses
      var ey = baseY - 35 * S;
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1 * S;
      ctx.beginPath();
      ctx.arc(hx - 4 * S, ey, 3.5 * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx + 4 * S, ey, 3.5 * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx - 0.5 * S, ey);
      ctx.lineTo(hx + 0.5 * S, ey);
      ctx.stroke();
      // Lens shine
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(hx - 5 * S, ey - 1 * S, 1.5 * S, 0, Math.PI * 2);
      ctx.fill();
    } else if (accessory === 'headphones') {
      // Headphones
      var ey2 = baseY - 36 * S;
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.arc(hx, ey2 - 6 * S, 9 * S, Math.PI * 0.85, Math.PI * 0.15, true);
      ctx.stroke();
      // Ear cups
      ctx.fillStyle = '#444';
      ctx.beginPath();
      ctx.ellipse(hx - 9 * S, ey2, 3 * S, 4 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx + 9 * S, ey2, 3 * S, 4 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      // Cushion
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.ellipse(hx - 9 * S, ey2, 2 * S, 3 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx + 9 * S, ey2, 2 * S, 3 * S, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (accessory === 'party') {
      // Party hat
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.moveTo(hx - 6 * S, hy + 2 * S);
      ctx.lineTo(hx, hy - 12 * S);
      ctx.lineTo(hx + 6 * S, hy + 2 * S);
      ctx.closePath();
      ctx.fill();
      // Stripes
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.moveTo(hx - 3 * S, hy - 2 * S);
      ctx.lineTo(hx, hy - 6 * S);
      ctx.lineTo(hx + 3 * S, hy - 2 * S);
      ctx.closePath();
      ctx.fill();
      // Pompom
      ctx.beginPath();
      ctx.arc(hx, hy - 12 * S, 2 * S, 0, Math.PI * 2);
      ctx.fillStyle = '#3498db';
      ctx.fill();
    }
  },

  drawChatBubble: function(ctx, sx, baseY, S, message) {
    if (!message || !message.text) return;
    var maxW = 120;
    var padding = 6;
    ctx.font = Math.max(8, Math.round(9 * S)) + 'px "Segoe UI", sans-serif';

    // Word wrap
    var words = message.text.split(' ');
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line + (line ? ' ' : '') + words[i];
      if (ctx.measureText(test).width > maxW - padding * 2) {
        if (line) lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (lines.length > 3) lines = lines.slice(0, 3);

    var lineH = 12;
    var bw = maxW;
    var bh = lines.length * lineH + padding * 2;
    var bx = sx - bw / 2;
    var by = baseY - 60 * S - bh;

    // Bubble background
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Bubble tail
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.moveTo(sx - 5, by + bh);
    ctx.lineTo(sx, by + bh + 6);
    ctx.lineTo(sx + 5, by + bh);
    ctx.closePath();
    ctx.fill();

    // Text
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (var j = 0; j < lines.length; j++) {
      ctx.fillText(lines[j], sx, by + padding + j * lineH);
    }
    ctx.textBaseline = 'alphabetic';
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
