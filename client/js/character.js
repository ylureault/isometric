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

  // Avatar « mignon » du design Insuffle Espace : grosse tête ronde,
  // sourire, volumes arrondis plats. Directions gérées par décalage du
  // regard (profil) et chevelure pleine (dos). Unités : viewBox 56x80 du
  // prototype, converties via k. Les ancrages tête (~ -48S) et yeux
  // (~ -37S) restent alignés avec les accessoires existants.
  drawBody: function(ctx, sx, sy, S, colors, facing, walk, armSwing, handRaised, isAdmin, isWalking, headBob, isSpeaking, headTilt) {
    var k = S * 0.82;
    var isBack = facing.indexOf('back') === 0;
    var isRight = facing.indexOf('right') >= 0;
    headBob = headBob || 0;

    var X = function(u) { return sx + (u - 28) * k; };
    var Y = function(v) { return sy + (v - 72) * k; };

    var skin = colors.skin, hair = colors.hair, top = colors.shirt,
        pant = colors.pants, shoes = colors.shoes || '#2c2c33';

    // Balancement de marche
    var swing = isWalking ? walk * 10 : 0;          // jambes
    var armRot = isWalking ? armSwing * 0.9 : 0;    // bras (rad)

    ctx.save();
    if (headTilt) {
      ctx.translate(sx, sy);
      ctx.rotate(headTilt * 0.5);
      ctx.translate(-sx, -sy);
    }

    // ===== JAMBES ===== (rounded rects, lift alterné en marche)
    var liftL = Math.max(0, swing) * k;
    var liftR = Math.max(0, -swing) * k;
    ctx.fillStyle = pant;
    ctx.beginPath();
    ctx.roundRect(X(20), Y(55) - liftL, 7 * k, 16 * k, 3 * k);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(X(29), Y(55) - liftR, 7 * k, 16 * k, 3 * k);
    ctx.fill();

    // Chaussures
    ctx.fillStyle = shoes;
    ctx.beginPath();
    ctx.roundRect(X(18), Y(64) - liftL, 9 * k, 6 * k, 3 * k);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(X(29), Y(64) - liftR, 9 * k, 6 * k, 3 * k);
    ctx.fill();

    // ===== TORSE ===== (rounded rect doux)
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.roundRect(X(16), Y(37), 24 * k, 23 * k, 9 * k);
    ctx.fill();
    // Léger ombrage du bas du torse pour le volume
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.beginPath();
    ctx.roundRect(X(16), Y(53), 24 * k, 7 * k, 4 * k);
    ctx.fill();

    // ===== BRAS ===== (pivot épaule, main peau au bout)
    var drawArm = function(shoulderU, rot, raised) {
      ctx.save();
      ctx.translate(X(shoulderU + 3), Y(40));
      ctx.rotate(raised ? (shoulderU > 28 ? -2.6 : 2.6) : rot);
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.roundRect(-3 * k, -1 * k, 6 * k, 17 * k, 3 * k);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(0, 16 * k, 3.4 * k, 0, Math.PI * 2);
      ctx.fill();
      if (raised) {
        // Paume ouverte plus grande quand la main est levée
        ctx.beginPath();
        ctx.arc(0, 17 * k, 4.2 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    var waveTime = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    drawArm(11, -armRot, false);
    drawArm(39, handRaised ? Math.sin(waveTime * 8) * 0.12 : armRot, handRaised);

    // ===== TÊTE ===== (grand cercle, oscille légèrement)
    var hy = 26 - headBob * 1.5;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(X(28), Y(hy), 13 * k, 0, Math.PI * 2);
    ctx.fill();

    // Cheveux : casque sur le front (vue face/profil), pleine chevelure de dos
    ctx.fillStyle = hair;
    if (isBack) {
      ctx.beginPath();
      ctx.arc(X(28), Y(hy), 13 * k, 0, Math.PI * 2);
      ctx.fill();
      // nuque arrondie
      ctx.beginPath();
      ctx.roundRect(X(20), Y(hy + 6), 16 * k, 9 * k, 5 * k);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(X(15), Y(hy - 2));
      ctx.quadraticCurveTo(X(15), Y(hy - 15), X(28), Y(hy - 15));
      ctx.quadraticCurveTo(X(41), Y(hy - 15), X(41), Y(hy - 2));
      ctx.quadraticCurveTo(X(41), Y(hy - 8), X(28), Y(hy - 9));
      ctx.quadraticCurveTo(X(15), Y(hy - 8), X(15), Y(hy - 2));
      ctx.closePath();
      ctx.fill();
    }

    // ===== VISAGE ===== (masqué de dos)
    if (!isBack) {
      var look = isRight ? 2.4 : -2.4; // le regard suit la direction
      ctx.fillStyle = '#2a2a30';
      ctx.beginPath();
      ctx.arc(X(23 + look), Y(hy + 1), 1.7 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(X(33 + look), Y(hy + 1), 1.7 * k, 0, Math.PI * 2);
      ctx.fill();

      if (isSpeaking) {
        // Bouche ouverte quand on parle
        ctx.fillStyle = '#2a2a30';
        ctx.beginPath();
        ctx.ellipse(X(28 + look), Y(hy + 6.5), 2.4 * k, 3 * k, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8857d';
        ctx.beginPath();
        ctx.ellipse(X(28 + look), Y(hy + 7.3), 1.4 * k, 1.6 * k, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Sourire
        ctx.strokeStyle = '#2a2a30';
        ctx.lineWidth = 1.6 * k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(X(24 + look), Y(hy + 6));
        ctx.quadraticCurveTo(X(28 + look), Y(hy + 9), X(32 + look), Y(hy + 6));
        ctx.stroke();
      }

      // Joues roses discrètes
      ctx.fillStyle = 'rgba(255,120,120,0.18)';
      ctx.beginPath();
      ctx.arc(X(20.5 + look), Y(hy + 4.5), 2 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(X(35.5 + look), Y(hy + 4.5), 2 * k, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
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
    var cy = canvasH - 46;
    var S = 1.9;

    // Ombre portée douce
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5, 30, 12, 0, 0, Math.PI * 2);
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
