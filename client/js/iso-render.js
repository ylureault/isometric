// DesignFurni — rendu du mobilier « Insuffle Espace » (port canvas du
// prototype Claude Design : iso.js + furniture.js).
// Volumes doux à 3 faces avec ombrage HSL, écrans lumineux, ombres portées.
// Chaque builder décrit des boîtes en unités-monde {ox,oy,oz,w,d,h,color…}
// projetées via Board.iso ; oz/h sont en unités de tuile (1 unité ≈ 28 px).

var DesignFurni = (function() {
  'use strict';

  /* ---- helpers couleur (port de iso.js) ---- */
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function(c) { return c + c; }).join('');
    var n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHsl(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }
  function shade(hex, dl, ds) {
    if (hex.charAt(0) !== '#') return hex;
    var hsl = rgbToHsl(hexToRgb(hex));
    var l = Math.max(0, Math.min(100, hsl.l + (dl || 0)));
    var s = Math.max(0, Math.min(100, hsl.s + (ds || 0)));
    return 'hsl(' + hsl.h.toFixed(0) + ' ' + s.toFixed(0) + '% ' + l.toFixed(0) + '%)';
  }

  /* ---- palette matériaux du design ---- */
  var MAT = {
    wood: '#cf9460', woodTop: '#e2b07e', woodDk: '#a9714a',
    metal: '#cfd6df', metalDk: '#9aa3b0',
    dark: '#343d52', screen: '#39d0c8', white: '#f3f5f9',
    fabric: '#e98f54', fabricB: '#d97b41',
    leaf: '#5bab6b', leafDk: '#3f8a52', pot: '#cf7d54',
    accent: '#6b6cff',
  };

  function legs(fw, fh, top, col) {
    var t = 0.12, inset = 0.12, c = col || MAT.metalDk;
    return [
      { ox: inset, oy: inset, oz: 0, w: t, d: t, h: top, color: c },
      { ox: fw - inset - t, oy: inset, oz: 0, w: t, d: t, h: top, color: c },
      { ox: inset, oy: fh - inset - t, oz: 0, w: t, d: t, h: top, color: c },
      { ox: fw - inset - t, oy: fh - inset - t, oz: 0, w: t, d: t, h: top, color: c },
    ];
  }

  function monitor(x, y) {
    return [
      { ox: x + 0.18, oy: y + 0.34, oz: 0, w: 0.14, d: 0.06, h: 0.16, color: MAT.metalDk },
      { ox: x + 0.05, oy: y + 0.26, oz: 0, w: 0.4, d: 0.22, h: 0.03, color: MAT.metal },
      { ox: x + 0.04, oy: y + 0.42, oz: 0.16, w: 0.42, d: 0.05, h: 0.34, color: '#22283a',
        top: shade('#22283a', 8), left: '#2b3247', right: '#1b2030' },
      { ox: x + 0.06, oy: y + 0.4, oz: 0.18, w: 0.38, d: 0.02, h: 0.3, color: MAT.screen,
        top: shade(MAT.screen, 10), left: shade(MAT.screen, 6), right: MAT.screen, glow: true },
    ];
  }

  /* ---- builders (port de furniture.js) ---- */
  var BUILD = {
    desk: function(o) {
      o = o || {};
      var fw = 3, fh = 1.1, topH = o.topH || 0.52, tt = 0.1;
      var wood = MAT.wood;
      var mons = [];
      [0.4, 1.55].forEach(function(mx) {
        monitor(mx, 0.18).forEach(function(b) {
          mons.push(Object.assign({}, b, { oz: b.oz + topH + tt }));
        });
      });
      return { fw: fw, fh: fh, boxes: legs(fw, fh, topH, MAT.metalDk).concat([
        { ox: 0, oy: 0, oz: topH, w: fw, d: fh, h: tt, color: wood, top: MAT.woodTop, left: MAT.woodDk, right: shade(wood, -16) },
      ], mons) };
    },

    chair: function(o) {
      o = o || {};
      var c = o.color || '#46506a', seat = 0.42, fw = 0.78, fh = 0.78;
      return { fw: fw, fh: fh, boxes: [
        { ox: 0.32, oy: 0.32, oz: 0, w: 0.12, d: 0.12, h: seat, color: MAT.metalDk },
        { ox: 0.12, oy: 0.12, oz: seat, w: 0.54, d: 0.54, h: 0.1, color: c, top: shade(c, 12), left: shade(c, -4), right: shade(c, -14) },
        { ox: 0.12, oy: 0.56, oz: seat + 0.1, w: 0.54, d: 0.1, h: 0.42, color: c, top: shade(c, 12), left: shade(c, -4), right: shade(c, -14) },
      ] };
    },

    sofa: function(o) {
      o = o || {};
      var c = o.color || MAT.fabric, fw = 1.7, fh = 0.9, base = 0.18, seat = 0.28;
      var top = shade(c, 10), left = shade(c, -3), right = shade(c, -14);
      return { fw: fw, fh: fh, boxes: [
        { ox: 0, oy: 0, oz: 0, w: fw, d: fh, h: base, color: c, top: top, left: left, right: right },
        { ox: 0.08, oy: 0.1, oz: base, w: fw - 0.16, d: fh - 0.18, h: seat, color: shade(c, 4), top: shade(c, 14), left: left, right: right },
        { ox: 0.06, oy: fh - 0.2, oz: base, w: fw - 0.12, d: 0.2, h: 0.5, color: c, top: top, left: left, right: right },
        { ox: 0, oy: 0, oz: base, w: 0.16, d: fh, h: 0.42, color: c, top: top, left: left, right: right },
        { ox: fw - 0.16, oy: 0, oz: base, w: 0.16, d: fh, h: 0.42, color: c, top: top, left: left, right: right },
      ] };
    },

    plant: function() {
      var fw = 0.7, fh = 0.7, p = MAT.pot;
      return { fw: fw, fh: fh, boxes: [
        { ox: 0.2, oy: 0.2, oz: 0, w: 0.3, d: 0.3, h: 0.28, color: p, top: shade(p, 10), left: shade(p, -4), right: shade(p, -14) },
        { ox: 0.08, oy: 0.08, oz: 0.28, w: 0.54, d: 0.54, h: 0.46, color: MAT.leaf, top: shade(MAT.leaf, 12), left: MAT.leafDk, right: shade(MAT.leaf, -16) },
        { ox: 0.2, oy: 0.2, oz: 0.74, w: 0.3, d: 0.3, h: 0.22, color: shade(MAT.leaf, 6), top: shade(MAT.leaf, 16), left: MAT.leafDk, right: shade(MAT.leaf, -12) },
      ] };
    },

    palm: function() {
      var fw = 0.8, fh = 0.8;
      var boxes = [
        { ox: 0.26, oy: 0.26, oz: 0, w: 0.28, d: 0.28, h: 0.26, color: MAT.pot, top: shade(MAT.pot, 10), left: shade(MAT.pot, -4), right: shade(MAT.pot, -14) },
        { ox: 0.34, oy: 0.34, oz: 0.26, w: 0.12, d: 0.12, h: 0.95, color: '#9a7b4f', top: '#b08f5e', left: '#866a44', right: '#7a5f3c' },
      ];
      var leaf = '#56a85f';
      [[0, 0.35], [0.35, 0], [-0.35, 0], [0, -0.35]].forEach(function(dxy, i) {
        boxes.push({ ox: 0.4 + dxy[0], oy: 0.4 + dxy[1], oz: 1.18, w: 0.32, d: 0.14, h: 0.08, color: leaf, top: shade(leaf, 14 - i), left: MAT.leafDk, right: shade(leaf, -14), bias: 0.3 });
      });
      boxes.push({ ox: 0.3, oy: 0.3, oz: 1.26, w: 0.2, d: 0.2, h: 0.12, color: shade(leaf, 6), top: shade(leaf, 18), left: MAT.leafDk, right: shade(leaf, -10), bias: 0.4 });
      return { fw: fw, fh: fh, boxes: boxes };
    },

    rug: function(o) {
      o = o || {};
      var fw = o.w || 2.4, fh = o.h || 2, c = o.color || MAT.wood;
      return { fw: fw, fh: fh, flat: true, boxes: [
        { ox: 0, oy: 0, oz: 0, w: fw, d: fh, h: 0.04, color: c, top: o.top || shade(c, 8), left: shade(c, -6), right: shade(c, -14) },
      ] };
    },

    whiteboard: function() {
      var fw = 1.6, fh = 0.3;
      return { fw: fw, fh: fh, boxes: [
        { ox: 0.2, oy: 0.08, oz: 0, w: 0.1, d: 0.1, h: 0.5, color: MAT.metalDk },
        { ox: fw - 0.3, oy: 0.08, oz: 0, w: 0.1, d: 0.1, h: 0.5, color: MAT.metalDk },
        { ox: 0.05, oy: 0.04, oz: 0.5, w: fw - 0.1, d: 0.06, h: 0.92, color: MAT.white,
          top: shade(MAT.white, 4), left: '#dfe4ec', right: '#cdd4de' },
        { ox: 0.12, oy: 0.02, oz: 0.58, w: 0.5, d: 0.02, h: 0.3, color: '#9fd0ff', glow: true, bias: 0.2 },
        { ox: 0.7, oy: 0.02, oz: 0.66, w: 0.5, d: 0.02, h: 0.18, color: '#ffd27f', glow: true, bias: 0.2 },
      ] };
    },

    postit: function(o) {
      o = o || {};
      var fw = 1.5, fh = 0.28, frame = MAT.woodDk;
      var boxes = [
        { ox: 0.05, oy: 0.04, oz: 0.3, w: fw - 0.1, d: 0.07, h: 0.9, color: '#b98a5e', top: '#cfa074', left: frame, right: shade(frame, -10) },
        { ox: 0.1, oy: 0.02, oz: 0.36, w: fw - 0.2, d: 0.02, h: 0.78, color: '#7a5736', bias: 0.1 },
      ];
      var notes = ['#ffd45e', '#ff9d7a', '#7ee0a6', '#8fc4ff', '#ffd45e', '#c8a6ff'];
      var i = 0;
      for (var r = 0; r < 2; r++) for (var cc = 0; cc < 3; cc++) {
        var col = notes[i % notes.length]; i++;
        boxes.push({ ox: 0.22 + cc * 0.38, oy: 0.0, oz: 0.5 + r * 0.32, w: 0.26, d: 0.02, h: 0.24, color: col, top: shade(col, 8), left: shade(col, -6), right: shade(col, -10), bias: 0.2 + i * 0.001 });
      }
      return { fw: fw, fh: fh, boxes: boxes };
    },

    table: function(o) {
      o = o || {};
      var fw = 1.3, fh = 1.3, topH = o.topH || 0.42;
      var wood = MAT.wood;
      return { fw: fw, fh: fh, boxes: legs(fw, fh, topH, MAT.woodDk).concat([
        { ox: 0.05, oy: 0.05, oz: topH, w: fw - 0.1, d: fh - 0.1, h: 0.1, color: wood, top: MAT.woodTop, left: MAT.woodDk, right: shade(wood, -16) },
      ]) };
    },

    lamp: function() {
      var fw = 0.5, fh = 0.5, glow = '#ffe6a8';
      return { fw: fw, fh: fh, boxes: [
        { ox: 0.2, oy: 0.2, oz: 0, w: 0.1, d: 0.1, h: 1.1, color: MAT.metalDk },
        { ox: 0.08, oy: 0.08, oz: 1.1, w: 0.34, d: 0.34, h: 0.26, color: glow, top: shade(glow, 8), left: shade(glow, -6), right: shade(glow, -12), glow: true, bias: 0.3 },
      ] };
    },

    // Grand écran mural (visioconférence)
    bigscreen: function() {
      var fw = 2, fh = 0.4;
      return { fw: fw, fh: fh, boxes: [
        { ox: 0.85, oy: 0.12, oz: 0, w: 0.3, d: 0.16, h: 0.5, color: MAT.metalDk },
        { ox: 0.6, oy: 0.08, oz: 0, w: 0.8, d: 0.26, h: 0.06, color: MAT.metal },
        { ox: 0.06, oy: 0.16, oz: 0.5, w: fw - 0.12, d: 0.08, h: 1.05, color: '#22283a', top: shade('#22283a', 8), left: '#2b3247', right: '#1b2030' },
        { ox: 0.1, oy: 0.14, oz: 0.56, w: fw - 0.2, d: 0.02, h: 0.92, color: MAT.screen, top: shade(MAT.screen, 10), left: shade(MAT.screen, 6), right: MAT.screen, glow: true },
      ] };
    },

    // Bibliothèque en bois avec étagères colorées
    bookshelf: function() {
      var fw = 1.6, fh = 0.5;
      var boxes = [
        { ox: 0, oy: 0, oz: 0, w: fw, d: fh, h: 1.2, color: MAT.wood, top: MAT.woodTop, left: MAT.woodDk, right: shade(MAT.wood, -16) },
      ];
      var books = ['#5b6cff', '#ff9d7a', '#39b58a', '#ffd45e', '#c8a6ff', '#e85c8a'];
      for (var s = 0; s < 2; s++) {
        for (var b = 0; b < 4; b++) {
          boxes.push({ ox: 0.12 + b * 0.36, oy: 0.04, oz: 0.18 + s * 0.5, w: 0.22, d: 0.06, h: 0.32,
            color: books[(s * 4 + b) % books.length], bias: 0.2 });
        }
      }
      return { fw: fw, fh: fh, boxes: boxes };
    },
  };

  /* ---- mapping types moteur → builders du design ---- */
  var MAP = {
    desk:        function() { return BUILD.desk(); },
    standingDesk:function() { return BUILD.desk({ topH: 0.78 }); },
    chair:       function() { return BUILD.chair(); },
    couch:       function() { return BUILD.sofa(); },
    coffeeTable: function() { return BUILD.table({ topH: 0.26 }); },
    largeTable:  function() { return BUILD.table(); },
    roundTable:  function() { return BUILD.table(); },
    plant:       function() { return BUILD.plant(); },
    palmTree:    function() { return BUILD.palm(); },
    whiteboard:  function() { return BUILD.whiteboard(); },
    postItBoard: function() { return BUILD.postit(); },
    carpet:      function() { return BUILD.rug({ color: '#caa274', top: '#dcb988' }); },
    largeCarpet: function() { return BUILD.rug({ color: '#caa274', top: '#dcb988' }); },
    collabSpace: function() { return BUILD.rug({ color: '#caa274', top: '#dcb988' }); },
    lamp:        function() { return BUILD.lamp(); },
    screen:      function() { return BUILD.bigscreen(); },
    bookshelf:   function() { return BUILD.bookshelf(); },
  };

  var cache = {}; // type:w:h -> { boxes (échelonnées + triées), flat }

  // Échelonne le builder sur l'empreinte du moteur (def.width × def.height),
  // en tournant de 90° si les orientations diffèrent (ex. tableau vertical).
  function buildFor(type, defW, defH) {
    var key = type + ':' + defW + ':' + defH;
    if (cache[key]) return cache[key];
    var f = MAP[type]();
    var boxes = f.boxes;
    var fw = f.fw, fh = f.fh;
    var rotated = (defW < defH) !== (fw < fh) && defW !== defH;
    if (rotated) {
      boxes = boxes.map(function(b) {
        return Object.assign({}, b, { ox: b.oy, oy: b.ox, w: b.d, d: b.w });
      });
      var tmp = fw; fw = fh; fh = tmp;
    }
    var sx = defW / fw, sy = defH / fh;
    var s = Math.min(sx, sy);
    // Conserve les proportions, centre dans l'empreinte
    var padX = (defW - fw * s) / 2, padY = (defH - fh * s) / 2;
    boxes = boxes.map(function(b) {
      return Object.assign({}, b, {
        ox: b.ox * s + padX, oy: b.oy * s + padY,
        w: b.w * s, d: b.d * s,
        oz: b.oz * s, h: b.h * s,
      });
    });
    boxes.sort(function(a, b) {
      return ((a.ox + a.oy) + a.oz * 0.6 + (a.bias || 0)) - ((b.ox + b.oy) + b.oz * 0.6 + (b.bias || 0));
    });
    var built = { boxes: boxes, flat: !!f.flat, scale: s };
    cache[key] = built;
    return built;
  }

  function canDraw(type) { return !!MAP[type]; }

  function draw(ctx, board, item, def) {
    var built = buildFor(item.type, def.width || 1, def.height || 1);
    var H = board.tileWidth * 0.44; // hauteur d'une unité-monde en px (design : 30/68)
    var x0 = item.x, y0 = item.y;

    // Ombre portée douce sous le meuble (équivalent du drop-shadow du design)
    if (!built.flat) {
      var c = board.iso(x0 + (def.width || 1) / 2, y0 + (def.height || 1) / 2, 0);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 4, board.tileWidth * 0.36 * (def.width || 1), board.tileHeight * 0.36 * (def.height || 1), 0, 0, Math.PI * 2);
      var g = ctx.createRadialGradient(c.x, c.y + 4, 0, c.x, c.y + 4, board.tileWidth * 0.4 * (def.width || 1));
      g.addColorStop(0, 'rgba(20,24,50,0.14)');
      g.addColorStop(1, 'rgba(20,24,50,0)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }

    for (var i = 0; i < built.boxes.length; i++) {
      var b = built.boxes[i];
      var color = b.color || '#cccccc';
      var top = b.top || shade(color, 12);
      var left = b.left || shade(color, -2, -4);
      var right = b.right || shade(color, -14, -2);
      var zb = b.oz * H, zt = (b.oz + b.h) * H;
      var bx = x0 + b.ox, by = y0 + b.oy;

      // sommets (projection iso, z en pixels)
      var tA = board.iso(bx, by, zt), tB = board.iso(bx + b.w, by, zt);
      var tC = board.iso(bx + b.w, by + b.d, zt), tD = board.iso(bx, by + b.d, zt);
      var lA = board.iso(bx, by + b.d, zb), lB = board.iso(bx + b.w, by + b.d, zb);
      var rA = board.iso(bx + b.w, by, zb), rB = board.iso(bx + b.w, by + b.d, zb);

      if (b.glow) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
      }
      // face droite
      ctx.fillStyle = right;
      ctx.beginPath();
      ctx.moveTo(rA.x, rA.y); ctx.lineTo(rB.x, rB.y); ctx.lineTo(tC.x, tC.y); ctx.lineTo(tB.x, tB.y);
      ctx.closePath(); ctx.fill();
      // face gauche
      ctx.fillStyle = left;
      ctx.beginPath();
      ctx.moveTo(lA.x, lA.y); ctx.lineTo(lB.x, lB.y); ctx.lineTo(tC.x, tC.y); ctx.lineTo(tD.x, tD.y);
      ctx.closePath(); ctx.fill();
      // face dessus
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.moveTo(tA.x, tA.y); ctx.lineTo(tB.x, tB.y); ctx.lineTo(tC.x, tC.y); ctx.lineTo(tD.x, tD.y);
      ctx.closePath(); ctx.fill();
      if (b.glow) ctx.restore();
    }
  }

  return { canDraw: canDraw, draw: draw, shade: shade, MAT: MAT, BUILD: BUILD };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DesignFurni;
