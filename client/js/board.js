// Board: beautiful isometric grid rendering with 3D depth

const Board = {
  gridSize: 20,
  tileWidth: CONSTANTS.TILE_WIDTH,
  tileHeight: CONSTANTS.TILE_HEIGHT,
  floorColor1: '#4a5a6c',
  floorColor2: '#3e4e5e',
  furniture: [],
  collisionMap: null,

  init(gridSize, envType) {
    this.gridSize = gridSize;
    this.tileWidth = CONSTANTS.TILE_WIDTH;
    this.tileHeight = CONSTANTS.TILE_HEIGHT;
    const preset = Environments.getPreset(envType);
    this.floorColor1 = preset.floorColor1;
    this.floorColor2 = preset.floorColor2;
    this.furniture = Environments.getFurniture(envType, gridSize);
    this.buildCollisionMap();
  },

  buildCollisionMap() {
    this.collisionMap = Array.from({ length: this.gridSize }, () =>
      new Array(this.gridSize).fill(false)
    );
    for (const item of this.furniture) {
      const def = Environments.furnitureTypes[item.type];
      if (!def || !def.solid) continue;
      for (let dx = 0; dx < def.width; dx++) {
        for (let dy = 0; dy < def.height; dy++) {
          const gx = item.x + dx;
          const gy = item.y + dy;
          if (gx >= 0 && gx < this.gridSize && gy >= 0 && gy < this.gridSize) {
            this.collisionMap[gy][gx] = true;
          }
        }
      }
    }
  },

  isSolid(gx, gy) {
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    if (ix < 0 || ix >= this.gridSize || iy < 0 || iy >= this.gridSize) return true;
    return this.collisionMap[iy][ix];
  },

  isInBounds(gx, gy) { return gx >= 0 && gx < this.gridSize && gy >= 0 && gy < this.gridSize; },

  isOnStage(gx, gy) {
    for (const item of this.furniture) {
      const def = Environments.furnitureTypes[item.type];
      if (!def || !def.isStage) continue;
      if (gx >= item.x && gx < item.x + def.width && gy >= item.y && gy < item.y + def.height) return true;
    }
    return false;
  },

  // Isometric projection
  iso(x, y, z) {
    z = z || 0;
    return {
      x: (x - y) * (this.tileWidth / 2),
      y: (x + y) * (this.tileHeight / 2) - z,
    };
  },

  screenToGrid(sx, sy, offsetX, offsetY, zoom) {
    const z = zoom || 1;
    const rx = (sx - offsetX) / z;
    const ry = (sy - offsetY) / z;
    const gx = (rx / (this.tileWidth / 2) + ry / (this.tileHeight / 2)) / 2;
    const gy = (ry / (this.tileHeight / 2) - rx / (this.tileWidth / 2)) / 2;
    return { x: gx, y: gy };
  },

  drawGrid(ctx, offsetX, offsetY, playerX, playerY) {
    const tw = this.tileWidth / 2;
    const th = this.tileHeight / 2;

    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        const pos = this.iso(x, y);
        const sx = pos.x + offsetX;
        const sy = pos.y + offsetY;

        const isEven = (x + y) % 2 === 0;
        let baseHex = isEven ? this.floorColor1 : this.floorColor2;

        // Stage check
        if (this.isOnStage(x, y)) {
          baseHex = '#8A6E58';
        }

        // Proximity glow
        let glow = 0;
        if (playerX !== undefined) {
          const dist = Math.sqrt((x + 0.5 - playerX) ** 2 + (y + 0.5 - playerY) ** 2);
          if (dist < 2.5) glow = (1 - dist / 2.5) * 0.15;
        }

        const base = this.hexToRgb(baseHex);
        const topR = Math.min(255, base.r + 15 + glow * 255);
        const topG = Math.min(255, base.g + 15 + glow * 255);
        const topB = Math.min(255, base.b + 18 + glow * 255);

        // Top face (lighter)
        ctx.beginPath();
        ctx.moveTo(sx, sy - th);
        ctx.lineTo(sx + tw, sy);
        ctx.lineTo(sx, sy + th);
        ctx.lineTo(sx - tw, sy);
        ctx.closePath();
        ctx.fillStyle = `rgb(${topR|0},${topG|0},${topB|0})`;
        ctx.fill();

        // Left edge highlight
        ctx.beginPath();
        ctx.moveTo(sx - tw, sy);
        ctx.lineTo(sx, sy - th);
        ctx.strokeStyle = `rgba(255,255,255,0.07)`;
        ctx.lineWidth = 0.7;
        ctx.stroke();

        // Right edge shadow
        ctx.beginPath();
        ctx.moveTo(sx + tw, sy);
        ctx.lineTo(sx, sy + th);
        ctx.strokeStyle = `rgba(0,0,0,0.08)`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }

    this.drawEdges(ctx, offsetX, offsetY);
  },

  drawEdges(ctx, offsetX, offsetY) {
    const gs = this.gridSize;
    const tw = this.tileWidth / 2;
    const th = this.tileHeight / 2;
    const depth = 12;

    // Bottom-right edge
    for (let x = 0; x < gs; x++) {
      const p = this.iso(x, gs);
      const sx = p.x + offsetX;
      const sy = p.y + offsetY;
      ctx.beginPath();
      ctx.moveTo(sx, sy - th);
      ctx.lineTo(sx + tw, sy);
      ctx.lineTo(sx + tw, sy + depth);
      ctx.lineTo(sx, sy - th + depth);
      ctx.closePath();
      ctx.fillStyle = '#1a2030';
      ctx.fill();
    }

    // Bottom-left edge
    for (let y = 0; y < gs; y++) {
      const p = this.iso(gs, y);
      const sx = p.x + offsetX;
      const sy = p.y + offsetY;
      ctx.beginPath();
      ctx.moveTo(sx, sy - th);
      ctx.lineTo(sx - tw, sy);
      ctx.lineTo(sx - tw, sy + depth);
      ctx.lineTo(sx, sy - th + depth);
      ctx.closePath();
      ctx.fillStyle = '#141c28';
      ctx.fill();
    }

    // Bottom corner
    const cp = this.iso(gs, gs);
    ctx.beginPath();
    ctx.moveTo(cp.x + offsetX, cp.y + offsetY - th);
    ctx.lineTo(cp.x + offsetX, cp.y + offsetY - th + depth);
    ctx.strokeStyle = '#0e1420';
    ctx.lineWidth = 1;
    ctx.stroke();
  },

  getSortedFurniture() {
    return [...this.furniture].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  },

  drawFurnitureItem(ctx, item, offsetX, offsetY) {
    const def = Environments.furnitureTypes[item.type];
    if (!def) return;
    if (def.isStage) return this.drawStage(ctx, item, def, offsetX, offsetY);
    if (def.isPlant) return this.drawPlant(ctx, item, def, offsetX, offsetY);
    if (def.isScreen) return this.drawScreen(ctx, item, def, offsetX, offsetY);
    if (def.isZone) return this.drawZoneOverlay(ctx, item, def, offsetX, offsetY);
    this.drawBox(ctx, item, def, offsetX, offsetY);
  },

  drawBox(ctx, item, def, ox, oy) {
    const cx = item.x + def.width / 2;
    const cy = item.y + def.height / 2;
    const pos = this.iso(cx, cy);
    const sx = pos.x + ox;
    const sy = pos.y + oy;
    const tw2 = this.tileWidth / 2;
    const w = tw2 * def.width * 0.45;
    const d = (this.tileHeight / 2) * def.height * 0.45;
    const h = def.drawHeight;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + 4, w * 0.5, d * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();

    // Top face
    ctx.beginPath();
    ctx.moveTo(sx, sy - h - d);
    ctx.lineTo(sx + w, sy - h);
    ctx.lineTo(sx, sy - h + d);
    ctx.lineTo(sx - w, sy - h);
    ctx.closePath();
    ctx.fillStyle = def.topColor;
    ctx.fill();

    // Right face (darker)
    ctx.beginPath();
    ctx.moveTo(sx + w, sy - h);
    ctx.lineTo(sx, sy - h + d);
    ctx.lineTo(sx, sy + d);
    ctx.lineTo(sx + w, sy);
    ctx.closePath();
    ctx.fillStyle = this.darken(def.color, 0.15);
    ctx.fill();

    // Left face
    ctx.beginPath();
    ctx.moveTo(sx - w, sy - h);
    ctx.lineTo(sx, sy - h + d);
    ctx.lineTo(sx, sy + d);
    ctx.lineTo(sx - w, sy);
    ctx.closePath();
    ctx.fillStyle = def.color;
    ctx.fill();

    // Top edge highlight
    ctx.beginPath();
    ctx.moveTo(sx - w, sy - h);
    ctx.lineTo(sx, sy - h - d);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  },

  drawStage(ctx, item, def, ox, oy) {
    const h = def.drawHeight;
    const tw = this.tileWidth / 2;
    const th = this.tileHeight / 2;

    for (let dy = 0; dy < def.height; dy++) {
      for (let dx = 0; dx < def.width; dx++) {
        const pos = this.iso(item.x + dx, item.y + dy, h);
        const sx = pos.x + ox;
        const sy = pos.y + oy;

        // Stage tile
        ctx.beginPath();
        ctx.moveTo(sx, sy - th);
        ctx.lineTo(sx + tw, sy);
        ctx.lineTo(sx, sy + th);
        ctx.lineTo(sx - tw, sy);
        ctx.closePath();
        ctx.fillStyle = (dx + dy) % 2 === 0 ? '#A08060' : '#907050';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Front edge
        if (dy === def.height - 1) {
          ctx.beginPath();
          ctx.moveTo(sx - tw, sy);
          ctx.lineTo(sx, sy + th);
          ctx.lineTo(sx, sy + th + h);
          ctx.lineTo(sx - tw, sy + h);
          ctx.closePath();
          ctx.fillStyle = '#6A4E38';
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(sx, sy + th);
          ctx.lineTo(sx + tw, sy);
          ctx.lineTo(sx + tw, sy + h);
          ctx.lineTo(sx, sy + th + h);
          ctx.closePath();
          ctx.fillStyle = '#5A3E28';
          ctx.fill();
        }
        if (dx === def.width - 1) {
          ctx.beginPath();
          ctx.moveTo(sx + tw, sy);
          ctx.lineTo(sx, sy + th);
          ctx.lineTo(sx, sy + th + h);
          ctx.lineTo(sx + tw, sy + h);
          ctx.closePath();
          ctx.fillStyle = '#5A3E28';
          ctx.fill();
        }
      }
    }
  },

  drawPlant(ctx, item, def, ox, oy) {
    const pos = this.iso(item.x + 0.5, item.y + 0.5);
    const sx = pos.x + ox;
    const sy = pos.y + oy;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + 3, 8, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fill();

    // Pot
    ctx.beginPath();
    ctx.moveTo(sx - 6, sy - 4);
    ctx.lineTo(sx + 6, sy - 4);
    ctx.lineTo(sx + 5, sy + 5);
    ctx.lineTo(sx - 5, sy + 5);
    ctx.closePath();
    ctx.fillStyle = '#A0522D';
    ctx.fill();
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Pot rim
    ctx.beginPath();
    ctx.ellipse(sx, sy - 4, 7, 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#B0623D';
    ctx.fill();

    if (def.isPalm) {
      // Trunk
      ctx.fillStyle = '#8B7355';
      ctx.fillRect(sx - 2.5, sy - 26, 5, 22);
      // Leaves
      const ly = sy - 28;
      for (let a = 0; a < 7; a++) {
        const angle = (a / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(sx, ly);
        ctx.quadraticCurveTo(
          sx + Math.cos(angle) * 10, ly + Math.sin(angle) * 5 - 8,
          sx + Math.cos(angle) * 18, ly + Math.sin(angle) * 10
        );
        ctx.strokeStyle = a % 2 === 0 ? '#2D8A27' : '#3A9A32';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    } else {
      // Bush
      ctx.fillStyle = '#3A8A32';
      ctx.beginPath(); ctx.arc(sx, sy - 16, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2D7A27';
      ctx.beginPath(); ctx.arc(sx - 6, sy - 12, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 6, sy - 12, 6, 0, Math.PI * 2); ctx.fill();
      // Highlights
      ctx.fillStyle = '#4AAA42';
      ctx.beginPath(); ctx.arc(sx + 2, sy - 18, 3, 0, Math.PI * 2); ctx.fill();
    }
  },

  drawScreen(ctx, item, def, ox, oy) {
    const cx = item.x + def.width / 2;
    const cy = item.y + def.height / 2;
    const pos = this.iso(cx, cy);
    const sx = pos.x + ox;
    const sy = pos.y + oy;

    // Stand
    ctx.fillStyle = '#555';
    ctx.fillRect(sx - 2, sy - def.drawHeight, 4, def.drawHeight);

    // Screen frame
    const sw = 40;
    const sh = 26;
    ctx.fillStyle = '#111';
    ctx.fillRect(sx - sw / 2 - 2, sy - def.drawHeight - sh - 2, sw + 4, sh + 4);
    // Screen
    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(sx - sw / 2, sy - def.drawHeight - sh, sw, sh);
    // Glow
    const grad = ctx.createLinearGradient(sx - sw / 2, sy - def.drawHeight - sh, sx + sw / 2, sy - def.drawHeight);
    grad.addColorStop(0, 'rgba(80, 140, 220, 0.1)');
    grad.addColorStop(0.5, 'rgba(80, 140, 220, 0.02)');
    grad.addColorStop(1, 'rgba(80, 140, 220, 0.08)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx - sw / 2, sy - def.drawHeight - sh, sw, sh);
  },

  drawZoneOverlay(ctx, item, def, ox, oy) {
    const tw = this.tileWidth / 2;
    const th = this.tileHeight / 2;
    const w = item.width || def.width;
    const h = item.height || def.height;

    // Overlay tiles
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const pos = this.iso(item.x + dx, item.y + dy);
        const sx = pos.x + ox;
        const sy = pos.y + oy;
        ctx.beginPath();
        ctx.moveTo(sx, sy - th);
        ctx.lineTo(sx + tw, sy);
        ctx.lineTo(sx, sy + th);
        ctx.lineTo(sx - tw, sy);
        ctx.closePath();
        ctx.fillStyle = 'rgba(126, 184, 218, 0.08)';
        ctx.fill();
      }
    }

    // Label
    if (item.zone) {
      const lp = this.iso(item.x + w / 2, item.y + h / 2);
      const lx = lp.x + ox;
      const ly = lp.y + oy;

      ctx.beginPath();
      ctx.arc(lx, ly - 6, 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(126, 184, 218, 0.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(126, 184, 218, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.fillStyle = '#7eb8da';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.zone, lx, ly - 6);

      if (item.zoneName) {
        ctx.font = '10px "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(126, 184, 218, 0.7)';
        ctx.fillText(item.zoneName, lx, ly + 10);
      }
    }
  },

  hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 0xFF, g: (n >> 8) & 0xFF, b: n & 0xFF };
  },

  darken(hex, amt) {
    const c = this.hexToRgb(hex);
    return `rgb(${Math.max(0, c.r * (1 - amt)) | 0},${Math.max(0, c.g * (1 - amt)) | 0},${Math.max(0, c.b * (1 - amt)) | 0})`;
  },

  lighten(hex, amt) {
    const c = this.hexToRgb(hex);
    return `rgb(${Math.min(255, c.r + 255 * amt) | 0},${Math.min(255, c.g + 255 * amt) | 0},${Math.min(255, c.b + 255 * amt) | 0})`;
  },
};
