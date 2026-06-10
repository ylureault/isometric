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
      isSharingScreen = false,
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

    // Shadow — soft elongated ellipse that shifts with movement
    var shadowOffX = isWalking ? Math.sin(walkPhase * 6) * 1.5 * S : 0;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(sx + shadowOffX, sy + 2 * S, 14 * S, 7 * S, 0.15, 0, Math.PI * 2);
    var shadowGrad = ctx.createRadialGradient(sx + shadowOffX, sy + 2 * S, 0, sx + shadowOffX, sy + 2 * S, 14 * S);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.18)');
    shadowGrad.addColorStop(0.6, 'rgba(0,0,0,0.08)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowGrad;
    ctx.fill();
    ctx.restore();

    // Broadcasting glow
    if (isBroadcasting) {
      ctx.beginPath();
      ctx.ellipse(sx, sy - 18 * S, 20 * S, 14 * S, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(52,152,219,0.12)';
      ctx.fill();
    }

    // On stage spotlight — radial gradient
    if (isOnStage) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(sx, sy + 2 * S, 18 * S, 9 * S, 0, 0, Math.PI * 2);
      var spotGrad = ctx.createRadialGradient(sx, sy + 2 * S, 0, sx, sy + 2 * S, 18 * S);
      spotGrad.addColorStop(0, 'rgba(241,196,15,0.15)');
      spotGrad.addColorStop(1, 'rgba(241,196,15,0)');
      ctx.fillStyle = spotGrad;
      ctx.fill();
      ctx.restore();
    }

    // Walk animation values — smoother
    var walkSin = isWalking ? Math.sin(walkPhase * 6) : 0;
    var walkCos = isWalking ? Math.cos(walkPhase * 6) : 0;
    var walk = walkSin * 0.3;
    var armSwing = walkSin * 0.45;
    var bounce = isWalking ? Math.abs(Math.sin(walkPhase * 6)) * 1.5 : 0;
    var headBob = isWalking ? Math.abs(walkCos) * 0.8 : 0;

    // #4 Idle breathing animation (subtle Y-axis bob when not walking)
    var breathTime = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    var breathBob = isWalking ? 0 : Math.sin(breathTime * Math.PI) * 0.3;
    var baseY = sy - bounce - breathBob;

    // #8 Head tilt when walking (lean into direction)
    var headTilt = isWalking ? walkSin * 0.06 * (facing.indexOf('right') >= 0 ? 1 : -1) : 0;

    this.drawBody(ctx, sx, baseY, S, colors, facing, walk, armSwing, handRaised, isAdmin, isWalking, headBob, isSpeaking, headTilt);

    // Admin crown
    if (isAdmin) {
      this.drawCrown(ctx, sx, baseY - 46 * S, S);
    }

    // Accessory on head
    if (accessory && accessory !== 'none') {
      this.drawAccessory(ctx, sx, baseY, S, accessory);
    }

    // Chat bubble
    if (chatBubble) {
      this.drawChatBubble(ctx, sx, baseY, S, chatBubble);
    }

    // #14 Muted icon — proper microphone shape
    if (isMuted) {
      var micX = sx + 12 * S, micY = baseY - 38 * S;
      // Red circle background
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(micX, micY, 5 * S, 0, Math.PI * 2);
      ctx.fill();
      // Microphone body (white)
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(micX - 1.5 * S, micY - 3 * S, 3 * S, 4 * S, 1.2 * S);
      ctx.fill();
      // Mic arc (U-shape holder)
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.8 * S;
      ctx.beginPath();
      ctx.arc(micX, micY - 0.5 * S, 2.5 * S, 0, Math.PI);
      ctx.stroke();
      // Mic stand
      ctx.beginPath();
      ctx.moveTo(micX, micY + 2 * S);
      ctx.lineTo(micX, micY + 3.2 * S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(micX - 1.5 * S, micY + 3.2 * S);
      ctx.lineTo(micX + 1.5 * S, micY + 3.2 * S);
      ctx.stroke();
      // Strike-through line (red slash)
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2 * S;
      ctx.beginPath();
      ctx.moveTo(micX - 3 * S, micY - 3.5 * S);
      ctx.lineTo(micX + 3 * S, micY + 3.5 * S);
      ctx.stroke();
    }

    // #14 Voice activity: pulsing green ring at base of avatar
    if (isSpeaking && !isMuted) {
      var ringTime = typeof performance !== 'undefined' ? performance.now() / 500 : 0;
      var ringPulse = 0.6 + Math.sin(ringTime) * 0.4;
      var ringR = 12 * S;
      ctx.save();
      ctx.translate(sx, baseY + 2 * S);
      ctx.scale(1, 0.5); // flatten to isometric ellipse
      ctx.beginPath();
      ctx.arc(0, 0, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(46,204,113,' + (0.5 * ringPulse) + ')';
      ctx.lineWidth = 2.5 * S;
      ctx.stroke();
      // Outer glow ring
      ctx.beginPath();
      ctx.arc(0, 0, ringR + 3 * S, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(46,204,113,' + (0.2 * ringPulse) + ')';
      ctx.lineWidth = 1.5 * S;
      ctx.stroke();
      ctx.restore();
    }

    // Speaking indicator — animated sound waves above head
    if (isSpeaking && !isMuted) {
      var spkX = sx;
      var spkY = baseY - 48 * S;
      var time = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
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
      ctx.beginPath();
      ctx.arc(spkX, spkY, 2.5 * S, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(46,204,113,0.9)';
      ctx.fill();
    }

    // Screen-share badge — small monitor icon floating above the head.
    // Placed on the left so it never overlaps the mic badge (right side).
    if (isSharingScreen) {
      var scX = sx - 12 * S, scY = baseY - 38 * S;
      var sharePulse = 0.7 + Math.sin((typeof performance !== 'undefined' ? performance.now() : 0) / 400) * 0.3;
      // Soft glow
      ctx.beginPath();
      ctx.arc(scX, scY, 7 * S, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(46,160,120,' + (0.18 * sharePulse) + ')';
      ctx.fill();
      // Green rounded badge
      ctx.fillStyle = '#2e9b6e';
      ctx.beginPath();
      ctx.arc(scX, scY, 5 * S, 0, Math.PI * 2);
      ctx.fill();
      // Monitor screen (white)
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(scX - 3 * S, scY - 2.6 * S, 6 * S, 4 * S, 0.8 * S);
      ctx.fill();
      // Monitor stand
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(scX - 1.4 * S, scY + 1.4 * S);
      ctx.lineTo(scX + 1.4 * S, scY + 1.4 * S);
      ctx.lineTo(scX + 0.8 * S, scY + 3 * S);
      ctx.lineTo(scX - 0.8 * S, scY + 3 * S);
      ctx.closePath();
      ctx.fill();
    }

    // Étiquette de pseudo — pastille du design (accent pour soi, vitrée sinon)
    if (pseudo) {
      var isMe = !!opts.isMe;
      var tagBg = '#ffffff', tagText = '#1d2138', tagBorder = 'rgba(20,28,60,.08)';
      if (typeof Engine !== 'undefined' && Engine.themeColor) {
        tagBg = isMe ? Engine.themeColor('--accent', '#5b6cff') : Engine.themeColor('--panel-solid', '#ffffff');
        tagText = isMe ? '#ffffff' : Engine.themeColor('--ink', '#1d2138');
        tagBorder = Engine.themeColor('--panel-border', 'rgba(20,28,60,.08)');
      } else if (isMe) {
        tagBg = '#5b6cff'; tagText = '#ffffff';
      }
      ctx.font = '700 ' + Math.max(9, Math.round(11 * S)) + 'px "Plus Jakarta Sans", sans-serif';
      var tw = ctx.measureText(pseudo).width;
      var ph = 18;
      var pw = tw + 20;
      var px = sx - pw / 2;
      var py = baseY + 10 * S;

      ctx.save();
      ctx.shadowColor = 'rgba(20,24,60,.30)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = tagBg;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 999);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      if (!isMe) {
        ctx.strokeStyle = tagBorder;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = tagText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pseudo, sx, py + ph / 2 + 0.5);
      ctx.restore();
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

  // Helper to measure color brightness
  _colorBrightness: function(hex) {
    if (!hex || hex.charAt(0) !== '#') return 128;
    var n = parseInt(hex.replace('#', ''), 16);
    var r = (n >> 16) & 0xFF, g = (n >> 8) & 0xFF, b = n & 0xFF;
    return (r * 299 + g * 587 + b * 114) / 1000;
  },

  drawBody: function(ctx, sx, sy, S, colors, facing, walk, armSwing, handRaised, isAdmin, isWalking, headBob, isSpeaking, headTilt) {
    var isFront = facing.indexOf('front') === 0;
    var isRight = facing.indexOf('right') >= 0;
    var bodyFlip = isRight ? 1 : -1;

    var tiltX = bodyFlip * 2 * S;
    var shoulderNear = 12 * S;
    var shoulderFar = 9 * S;
    headBob = headBob || 0;
    headTilt = headTilt || 0;
    isSpeaking = isSpeaking || false;

    // #2 Moving foot shadow
    var footShadowOff = isWalking ? Math.sin(walk * 8) * 2 * S : 0;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(sx + footShadowOff, sy + 3 * S, 10 * S, 4 * S, 0, 0, Math.PI * 2);
    var footShadGrad = ctx.createRadialGradient(sx + footShadowOff, sy + 3 * S, 0, sx + footShadowOff, sy + 3 * S, 10 * S);
    footShadGrad.addColorStop(0, 'rgba(0,0,0,0.12)');
    footShadGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = footShadGrad;
    ctx.fill();
    ctx.restore();

    // ===== LEGS ===== (thinner for polish)
    var legSpread = 4 * S;
    var legTop = sy - 4 * S;
    var legBot = sy + 2 * S;
    var legWalk = walk * 8 * S;
    var legW = 2.8 * S;

    // Left leg
    ctx.fillStyle = colors.pants;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sx - legSpread - legW, legTop);
    ctx.lineTo(sx - legSpread + legW, legTop);
    ctx.lineTo(sx - legSpread + legW - legWalk, legBot);
    ctx.lineTo(sx - legSpread - legW - legWalk, legBot);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right leg
    ctx.beginPath();
    ctx.moveTo(sx + legSpread - legW, legTop);
    ctx.lineTo(sx + legSpread + legW, legTop);
    ctx.lineTo(sx + legSpread + legW + legWalk, legBot);
    ctx.lineTo(sx + legSpread - legW + legWalk, legBot);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Shoes — rounded with sole detail
    var shoeW = 3.8 * S;
    var shoeH = 2 * S;
    var shoeRaise = isWalking ? Math.abs(walk) * 2 * S : 0;
    var lsx = sx - legSpread - legWalk;
    var rsx = sx + legSpread + legWalk;

    // Left shoe
    ctx.fillStyle = colors.shoes;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(lsx, legBot - 0.3 * S + (walk > 0 ? shoeRaise : 0), shoeW, shoeH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Sole
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(lsx, legBot + shoeH * 0.5 + (walk > 0 ? shoeRaise : 0), shoeW * 0.9, shoeH * 0.3, 0, 0, Math.PI);
    ctx.fill();
    // #9 Visible sole line
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.6 * S;
    ctx.beginPath();
    ctx.moveTo(lsx - shoeW * 0.8, legBot + shoeH * 0.15 + (walk > 0 ? shoeRaise : 0));
    ctx.lineTo(lsx + shoeW * 0.8, legBot + shoeH * 0.15 + (walk > 0 ? shoeRaise : 0));
    ctx.stroke();

    // Right shoe
    ctx.fillStyle = colors.shoes;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(rsx, legBot - 0.3 * S + (walk < 0 ? shoeRaise : 0), shoeW, shoeH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(rsx, legBot + shoeH * 0.5 + (walk < 0 ? shoeRaise : 0), shoeW * 0.9, shoeH * 0.3, 0, 0, Math.PI);
    ctx.fill();
    // #9 Visible sole line
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.6 * S;
    ctx.beginPath();
    ctx.moveTo(rsx - shoeW * 0.8, legBot + shoeH * 0.15 + (walk < 0 ? shoeRaise : 0));
    ctx.lineTo(rsx + shoeW * 0.8, legBot + shoeH * 0.15 + (walk < 0 ? shoeRaise : 0));
    ctx.stroke();

    // ===== TORSO =====
    var torsoTop = sy - 22 * S;
    var torsoBot = legTop + 2 * S;
    var torsoWL = isRight ? shoulderFar : shoulderNear;
    var torsoWR = isRight ? shoulderNear : shoulderFar;

    // Main torso shape
    ctx.fillStyle = colors.shirt;
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sx - torsoWL + tiltX, torsoBot);
    ctx.lineTo(sx + torsoWR + tiltX, torsoBot);
    ctx.lineTo(sx + torsoWR - 1 * S + tiltX, torsoTop);
    ctx.lineTo(sx - torsoWL + 1 * S + tiltX, torsoTop);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Far side shadow
    var shadeLeft = isRight ? sx - torsoWL + tiltX : sx + tiltX;
    var shadeRight = isRight ? sx + tiltX : sx + torsoWR + tiltX;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.moveTo(shadeLeft, torsoBot);
    ctx.lineTo(shadeRight, torsoBot);
    ctx.lineTo(shadeRight, torsoTop);
    ctx.lineTo(shadeLeft, torsoTop);
    ctx.closePath();
    ctx.fill();

    // Near side highlight
    var hlLeft = isRight ? sx + tiltX : sx - torsoWL + tiltX;
    var hlRight = isRight ? sx + torsoWR + tiltX : sx + tiltX;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.moveTo(hlLeft, torsoBot);
    ctx.lineTo(hlRight, torsoBot);
    ctx.lineTo(hlRight, torsoTop);
    ctx.lineTo(hlLeft, torsoTop);
    ctx.closePath();
    ctx.fill();

    // Collar line
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.7 * S;
    ctx.beginPath();
    ctx.moveTo(sx - 4 * S + tiltX, torsoTop + 1 * S);
    ctx.quadraticCurveTo(sx + tiltX, torsoTop + 3 * S, sx + 4 * S + tiltX, torsoTop + 1 * S);
    ctx.stroke();

    // Subtle tie/accent line
    var shirtBright = this._colorBrightness(colors.shirt);
    ctx.strokeStyle = shirtBright < 160 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1.2 * S;
    ctx.beginPath();
    ctx.moveTo(sx + tiltX, torsoTop + 3 * S);
    ctx.lineTo(sx + tiltX + 0.4 * S, torsoBot - 4 * S);
    ctx.stroke();

    // ===== ARMS ===== (thinner, smoother swing with elbow bend #3)
    var armY = torsoTop + 4 * S;
    var armLen = 16 * S;
    var armW = 3.2 * S;
    // #3 Elbow bend angle during walking
    var elbowBend = isWalking ? Math.abs(armSwing) * 0.35 : 0;

    // Left arm
    ctx.save();
    ctx.translate(sx - torsoWL + tiltX, armY);
    ctx.rotate(-armSwing * 0.9);
    // Upper arm (shirt)
    ctx.fillStyle = colors.shirt;
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(-armW, 0, armW, armLen * 0.5, 1 * S);
    ctx.fill();
    ctx.stroke();
    // #3 Forearm with elbow bend
    ctx.save();
    ctx.translate(-armW / 2, armLen * 0.5);
    ctx.rotate(elbowBend);
    ctx.fillStyle = colors.skin;
    ctx.beginPath();
    ctx.roundRect(-armW / 2 + 0.4 * S, 0, armW - 0.8 * S, armLen * 0.38, 1 * S);
    ctx.fill();
    // Hand
    ctx.beginPath();
    ctx.ellipse(0, armLen * 0.4, armW * 0.5, armW * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // Right arm
    ctx.save();
    ctx.translate(sx + torsoWR + tiltX, armY);
    // #12 Hand wave animation when raised
    var waveTime = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    var waveRot = handRaised ? -1.2 + Math.sin(waveTime * 8) * 0.2 : armSwing * 0.9;
    ctx.rotate(waveRot);
    // Upper arm (shirt)
    ctx.fillStyle = colors.shirt;
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, armW, armLen * 0.5, 1 * S);
    ctx.fill();
    ctx.stroke();
    // #3 Forearm with elbow bend
    ctx.save();
    ctx.translate(armW / 2, armLen * 0.5);
    ctx.rotate(handRaised ? -0.3 + Math.sin(waveTime * 8) * 0.15 : -elbowBend);
    ctx.fillStyle = colors.skin;
    ctx.beginPath();
    ctx.roundRect(-armW / 2 + 0.4 * S, 0, armW - 0.8 * S, armLen * 0.38, 1 * S);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, armLen * 0.4, armW * 0.5, armW * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (handRaised) {
      // Bigger open palm for wave
      ctx.fillStyle = colors.skin;
      ctx.beginPath();
      ctx.ellipse(0, armLen * 0.42, armW * 0.6, armW * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();

    // ===== NECK =====
    ctx.fillStyle = colors.skin;
    ctx.fillRect(sx + tiltX - 2.5 * S, torsoTop - 3 * S, 5 * S, 6 * S);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(sx + tiltX - 2.5 * S, torsoTop - 1 * S, 5 * S, 2 * S);
    // #10 Subtle neck shadow under head
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(sx + tiltX, torsoTop - 3 * S, 5 * S, 1.5 * S, 0, 0, Math.PI * 2);
    ctx.fill();

    // ===== HEAD ===== (slightly larger for cute proportions)
    var headCx = sx + tiltX;
    var headCy = torsoTop - 13 * S - headBob;
    var headRx = 10 * S;
    var headRy = 11 * S;

    // #8 Head tilt when walking
    if (headTilt) {
      ctx.save();
      ctx.translate(headCx, headCy);
      ctx.rotate(headTilt);
      ctx.translate(-headCx, -headCy);
    }

    if (isFront) {
      // Hair behind head
      ctx.fillStyle = colors.hair;
      ctx.beginPath();
      ctx.ellipse(headCx, headCy - 1 * S, headRx + 1.5 * S, headRy + 1.5 * S, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    } else {
      // Full hair from back
      ctx.fillStyle = colors.hair;
      ctx.beginPath();
      ctx.ellipse(headCx, headCy, headRx + 1.5 * S, headRy + 1.5 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      // Back hair strand texture
      var hairBr = this._colorBrightness(colors.hair);
      ctx.strokeStyle = hairBr > 100 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5 * S;
      for (var hs = -2; hs <= 2; hs++) {
        ctx.beginPath();
        ctx.moveTo(headCx + hs * 3 * S, headCy - headRy * 0.7);
        ctx.quadraticCurveTo(headCx + hs * 3.5 * S, headCy, headCx + hs * 2.5 * S, headCy + headRy * 0.6);
        ctx.stroke();
      }
    }

    // Face
    ctx.fillStyle = colors.skin;
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(headCx, headCy, headRx, headRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Face shading — radial highlight from upper-left
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(headCx, headCy, headRx, headRy, 0, 0, Math.PI * 2);
    ctx.clip();
    var faceGrad = ctx.createRadialGradient(headCx - 3 * S, headCy - 4 * S, 0, headCx, headCy, headRy);
    faceGrad.addColorStop(0, 'rgba(255,255,255,0.14)');
    faceGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
    faceGrad.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = faceGrad;
    ctx.fillRect(headCx - headRx, headCy - headRy, headRx * 2, headRy * 2);
    ctx.restore();

    // Hair on top with strands
    ctx.fillStyle = colors.hair;
    ctx.beginPath();
    ctx.ellipse(headCx, headCy - 4.5 * S, headRx + 0.5 * S, 7 * S, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Hair strand lines
    var hairBright2 = this._colorBrightness(colors.hair);
    ctx.strokeStyle = hairBright2 > 120 ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.6 * S;
    for (var strand = -3; strand <= 3; strand++) {
      ctx.beginPath();
      ctx.moveTo(headCx + strand * 2 * S, headCy - headRy + 1 * S);
      ctx.quadraticCurveTo(headCx + strand * 2.5 * S + bodyFlip * 2 * S, headCy - headRy + 5 * S, headCx + strand * 2 * S + bodyFlip * 1 * S, headCy - 4 * S);
      ctx.stroke();
    }

    // Side hair / sideburns (front view)
    if (isFront) {
      ctx.fillStyle = colors.hair;
      ctx.beginPath();
      ctx.ellipse(headCx - headRx + 1 * S, headCy - 2 * S, 2.5 * S, 5.5 * S, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(headCx + headRx - 1 * S, headCy - 2 * S, 2.5 * S, 5.5 * S, -0.15, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isFront) {
      // ===== EYES with eyelids, iris, sparkle =====
      var eyeY = headCy - 1 * S;
      var eyeSpread = 4.5 * S;
      var eyeDir = bodyFlip * 1.5 * S;

      // Eye whites
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.ellipse(headCx - eyeSpread + eyeDir, eyeY, 2.8 * S, 2.2 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(headCx + eyeSpread + eyeDir, eyeY, 2.8 * S, 2.2 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Iris
      ctx.fillStyle = '#5a4030';
      ctx.beginPath();
      ctx.arc(headCx - eyeSpread + eyeDir + bodyFlip * 0.6 * S, eyeY + 0.2 * S, 1.6 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(headCx + eyeSpread + eyeDir + bodyFlip * 0.6 * S, eyeY + 0.2 * S, 1.6 * S, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(headCx - eyeSpread + eyeDir + bodyFlip * 0.8 * S, eyeY + 0.3 * S, 0.9 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(headCx + eyeSpread + eyeDir + bodyFlip * 0.8 * S, eyeY + 0.3 * S, 0.9 * S, 0, Math.PI * 2);
      ctx.fill();

      // Eye sparkle
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(headCx - eyeSpread + eyeDir + bodyFlip * 0.3 * S, eyeY - 0.5 * S, 0.55 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(headCx + eyeSpread + eyeDir + bodyFlip * 0.3 * S, eyeY - 0.5 * S, 0.55 * S, 0, Math.PI * 2);
      ctx.fill();

      // Eyelids
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.7 * S;
      ctx.beginPath();
      ctx.arc(headCx - eyeSpread + eyeDir, eyeY - 0.5 * S, 2.8 * S, Math.PI + 0.4, Math.PI * 2 - 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(headCx + eyeSpread + eyeDir, eyeY - 0.5 * S, 2.8 * S, Math.PI + 0.4, Math.PI * 2 - 0.4);
      ctx.stroke();

      // Eyebrows
      ctx.strokeStyle = colors.hair;
      ctx.lineWidth = 0.8 * S;
      ctx.beginPath();
      ctx.moveTo(headCx - eyeSpread + eyeDir - 2.5 * S, eyeY - 3.2 * S);
      ctx.quadraticCurveTo(headCx - eyeSpread + eyeDir, eyeY - 4 * S, headCx - eyeSpread + eyeDir + 2.5 * S, eyeY - 3 * S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(headCx + eyeSpread + eyeDir - 2.5 * S, eyeY - 3 * S);
      ctx.quadraticCurveTo(headCx + eyeSpread + eyeDir, eyeY - 4 * S, headCx + eyeSpread + eyeDir + 2.5 * S, eyeY - 3.2 * S);
      ctx.stroke();

      // #7 White highlight dot in each pupil for life
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(headCx - eyeSpread + eyeDir + bodyFlip * 0.5 * S, eyeY - 0.1 * S, 0.45 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(headCx + eyeSpread + eyeDir + bodyFlip * 0.5 * S, eyeY - 0.1 * S, 0.45 * S, 0, Math.PI * 2);
      ctx.fill();

      // #11 Mouth — open when speaking, smile otherwise
      var smileWidth = isWalking ? 2.2 * S : 3 * S;
      var smileArc = isWalking ? 0.15 : 0.25;
      if (isSpeaking) {
        // Open mouth (small ellipse)
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.ellipse(headCx + eyeDir * 0.3, headCy + 5 * S, 2 * S, 1.5 * S, 0, 0, Math.PI * 2);
        ctx.fill();
        // Mouth interior hint
        ctx.fillStyle = 'rgba(180,60,60,0.15)';
        ctx.beginPath();
        ctx.ellipse(headCx + eyeDir * 0.3, headCy + 5.2 * S, 1.4 * S, 0.8 * S, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.8 * S;
        ctx.beginPath();
        ctx.arc(headCx + eyeDir * 0.3, headCy + 4.5 * S, smileWidth, smileArc, Math.PI - smileArc);
        ctx.stroke();
      }

      // Nose hint
      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 0.5 * S;
      ctx.beginPath();
      ctx.moveTo(headCx + eyeDir * 0.4, headCy + 0.5 * S);
      ctx.lineTo(headCx + eyeDir * 0.4 + bodyFlip * 0.8 * S, headCy + 2.5 * S);
      ctx.stroke();

      // Cheek blush
      ctx.fillStyle = 'rgba(255,150,150,0.05)';
      ctx.beginPath();
      ctx.ellipse(headCx - eyeSpread + eyeDir - 1 * S, headCy + 2.5 * S, 2 * S, 1.2 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(headCx + eyeSpread + eyeDir + 1 * S, headCy + 2.5 * S, 2 * S, 1.2 * S, 0, 0, Math.PI * 2);
      ctx.fill();

      // Admin glasses (wire frames)
      if (isAdmin) {
        ctx.strokeStyle = 'rgba(80,80,80,0.5)';
        ctx.lineWidth = 0.7 * S;
        ctx.beginPath();
        ctx.ellipse(headCx - eyeSpread + eyeDir, eyeY, 3.5 * S, 2.8 * S, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(headCx + eyeSpread + eyeDir, eyeY, 3.5 * S, 2.8 * S, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Bridge
        ctx.beginPath();
        ctx.moveTo(headCx - eyeSpread + eyeDir + 3.5 * S, eyeY);
        ctx.quadraticCurveTo(headCx + eyeDir, eyeY - 1 * S, headCx + eyeSpread + eyeDir - 3.5 * S, eyeY);
        ctx.stroke();
        // Temples
        ctx.beginPath();
        ctx.moveTo(headCx - eyeSpread + eyeDir - 3.5 * S, eyeY);
        ctx.lineTo(headCx - headRx + 0.5 * S, eyeY - 0.5 * S);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(headCx + eyeSpread + eyeDir + 3.5 * S, eyeY);
        ctx.lineTo(headCx + headRx - 0.5 * S, eyeY - 0.5 * S);
        ctx.stroke();
      }
    }

    // #6 Ears (on visible side, both front and back views)
    if (isFront) {
      // Near ear
      var earX = isRight ? headCx - headRx + 0.5 * S : headCx + headRx - 0.5 * S;
      ctx.fillStyle = colors.skin;
      ctx.strokeStyle = 'rgba(0,0,0,0.07)';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.ellipse(earX, headCy, 1.5 * S, 2.5 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Inner ear detail
      ctx.strokeStyle = 'rgba(0,0,0,0.04)';
      ctx.lineWidth = 0.3 * S;
      ctx.beginPath();
      ctx.arc(earX, headCy - 0.3 * S, 1 * S, 0.3, Math.PI * 1.7);
      ctx.stroke();
    }

    // #1 Body outline (full character silhouette stroke for definition)
    // Applied as a subtle dark stroke around head
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(headCx, headCy, headRx + 0.3, headRy + 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Close head tilt transform
    if (headTilt) {
      ctx.restore();
    }
  },

  drawAccessory: function(ctx, sx, baseY, S, accessory) {
    var hx = sx;
    var hy = baseY - 48 * S;

    if (accessory === 'tophat') {
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(hx, hy + 2 * S, 9 * S, 3 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(hx - 5 * S, hy - 10 * S, 10 * S, 12 * S);
      ctx.beginPath();
      ctx.ellipse(hx, hy - 10 * S, 5 * S, 2 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(hx - 5 * S, hy - 2 * S, 10 * S, 2 * S);
    } else if (accessory === 'cap') {
      ctx.fillStyle = '#2980b9';
      ctx.beginPath();
      ctx.ellipse(hx, hy + 2 * S, 9 * S, 4 * S, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx + 4 * S, hy + 3 * S, 7 * S, 2.5 * S, 0.2, -0.3, Math.PI * 0.6);
      ctx.fillStyle = '#1a6596';
      ctx.fill();
    } else if (accessory === 'beanie') {
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.ellipse(hx, hy - 1 * S, 8 * S, 6 * S, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(hx - 8 * S, hy - 1 * S, 16 * S, 3 * S);
      ctx.beginPath();
      ctx.arc(hx, hy - 7 * S, 2.5 * S, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    } else if (accessory === 'glasses') {
      var ey = baseY - 37 * S;
      ctx.strokeStyle = '#555';
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
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(hx - 5 * S, ey - 1 * S, 1.5 * S, 0, Math.PI * 2);
      ctx.fill();
    } else if (accessory === 'headphones') {
      var ey2 = baseY - 38 * S;
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.arc(hx, ey2 - 6 * S, 9 * S, Math.PI * 0.85, Math.PI * 0.15, true);
      ctx.stroke();
      ctx.fillStyle = '#444';
      ctx.beginPath();
      ctx.ellipse(hx - 9 * S, ey2, 3 * S, 4 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx + 9 * S, ey2, 3 * S, 4 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.ellipse(hx - 9 * S, ey2, 2 * S, 3 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx + 9 * S, ey2, 2 * S, 3 * S, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (accessory === 'party') {
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.moveTo(hx - 6 * S, hy + 2 * S);
      ctx.lineTo(hx, hy - 12 * S);
      ctx.lineTo(hx + 6 * S, hy + 2 * S);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.moveTo(hx - 3 * S, hy - 2 * S);
      ctx.lineTo(hx, hy - 6 * S);
      ctx.lineTo(hx + 3 * S, hy - 2 * S);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx, hy - 12 * S, 2 * S, 0, Math.PI * 2);
      ctx.fillStyle = '#3498db';
      ctx.fill();
    }
  },

  drawChatBubble: function(ctx, sx, baseY, S, message) {
    if (!message || !message.text) return;
    // Fade out during last 1.5 seconds
    var age = (Date.now() - message.time) / 1000;
    var fadeAlpha = age > 3.5 ? Math.max(0, 1 - (age - 3.5) / 1.5) : 1;
    if (fadeAlpha <= 0) return;

    ctx.save();
    ctx.globalAlpha *= fadeAlpha;

    var maxW = 110;
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
    if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = lines[2].slice(0, -3) + '...'; }

    var lineH = 12;
    var bw = Math.min(maxW, Math.max.apply(null, lines.map(function(l) { return ctx.measureText(l).width; })) + padding * 2 + 4);
    var bh = lines.length * lineH + padding * 2;
    var bx = sx - bw / 2;
    var by = baseY - 64 * S - bh;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.roundRect(bx + 2, by + 2, bw, bh, 8);
    ctx.fill();

    // Bubble background
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Tail
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(sx - 4, by + bh);
    ctx.lineTo(sx, by + bh + 5);
    ctx.lineTo(sx + 4, by + bh);
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
    ctx.restore();
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
    // #13 Crown gem (red center dot) with sparkle
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(cx, cy + 1 * S, 1.4 * S, 0, Math.PI * 2);
    ctx.fill();
    // Gem highlight
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(cx - 0.4 * S, cy + 0.6 * S, 0.5 * S, 0, Math.PI * 2);
    ctx.fill();
    // Side gems (smaller blue dots on the tips)
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(cx - 3 * S, cy + 2.2 * S, 0.7 * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 3 * S, cy + 2.2 * S, 0.7 * S, 0, Math.PI * 2);
    ctx.fill();
  },

  // Aperçu onboarding — fond transparent (le piédestal lumineux est en CSS),
  // l'avatar tourne doucement sur lui-même pour se présenter.
  drawPreview: function(ctx, canvasW, canvasH, colors, time, accessory) {
    ctx.clearRect(0, 0, canvasW, canvasH);

    var cx = canvasW / 2;
    var cy = canvasH / 2 + 38;
    var S = 1.5;

    // Ombre portée douce
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 24, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,24,40,0.16)';
    ctx.fill();

    // Rotation lente sur les 4 directions, pause plus longue de face
    var cycle = (time * 0.25) % 4;
    var dirIndex = Math.floor(cycle);
    var directions = [
      { dx: 1, dy: 1 },   // avant-droite
      { dx: -1, dy: 1 },  // avant-gauche
      { dx: -1, dy: -1 }, // arrière-gauche
      { dx: 1, dy: -1 },  // arrière-droite
    ];
    var facing = this.getFacing(directions[dirIndex]);
    var walkPhase = time * 2;

    this.drawBody(ctx, cx, cy, S, colors, facing, Math.sin(walkPhase * 3) * 0.12, Math.sin(walkPhase * 3) * 0.2, false, false, false, 0, false, 0);
    if (accessory && accessory !== 'none') {
      this.drawAccessory(ctx, cx, cy, S, accessory);
    }
  },
};
