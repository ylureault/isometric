// Board: isometric grid rendering, furniture, collision, zones

const Board = {
  gridSize: 20,
  tileWidth: CONSTANTS.TILE_WIDTH,
  tileHeight: CONSTANTS.TILE_HEIGHT,
  floorColor1: '#3a4a5c',
  floorColor2: '#344458',
  furniture: [],
  collisionMap: null,

  init(gridSize, envType) {
    this.gridSize = gridSize;
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

  isInBounds(gx, gy) {
    return gx >= 0 && gx < this.gridSize && gy >= 0 && gy < this.gridSize;
  },

  isOnStage(gx, gy) {
    for (const item of this.furniture) {
      const def = Environments.furnitureTypes[item.type];
      if (!def || !def.isStage) continue;
      if (gx >= item.x && gx < item.x + def.width &&
          gy >= item.y && gy < item.y + def.height) return true;
    }
    return false;
  },

  iso(x, y, z = 0) {
    const angle = Math.PI / 6;
    const sx = (x - y) * this.tileWidth * Math.cos(angle);
    const sy = (x + y) * this.tileHeight * Math.sin(angle) - z;
    return { x: sx, y: sy };
  },

  screenToGrid(sx, sy, offsetX, offsetY, zoom) {
    const z = zoom || 1;
    const rx = (sx - offsetX) / z;
    const ry = (sy - offsetY) / z;
    const angle = Math.PI / 6;
    const tw = this.tileWidth * Math.cos(angle);
    const th = this.tileHeight * Math.sin(angle);
    const gx = (rx / tw + ry / th) / 2;
    const gy = (ry / th - rx / tw) / 2;
    return { x: gx, y: gy };
  },

  drawGrid(ctx, offsetX, offsetY, playerX, playerY, zoom) {
    // Draw zone carpets/markers first (below tiles)
    for (const item of this.furniture) {
      const def = Environments.furnitureTypes[item.type];
      if (def && def.isZone) this.drawZoneMarker(ctx, item, def, offsetX, offsetY);
      if (def && def.isCarpet) this.drawCarpet(ctx, item, def, offsetX, offsetY);
    }

    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        this.drawTile(ctx, x, y, offsetX, offsetY, playerX, playerY);
      }
    }
    this.drawEdges(ctx, offsetX, offsetY);
  },

  drawTile(ctx, x, y, offsetX, offsetY, playerX, playerY) {
    const pos = this.iso(x, y);
    const sx = pos.x + offsetX;
    const sy = pos.y + offsetY;
    const tw = this.tileWidth * Math.cos(Math.PI / 6);
    const th = this.tileHeight;

    const isEven = (x + y) % 2 === 0;
    let baseColor = isEven ? this.floorColor1 : this.floorColor2;

    // Subtle proximity glow
    if (playerX !== undefined && playerY !== undefined) {
      const dist = Math.sqrt((x + 0.5 - playerX) ** 2 + (y + 0.5 - playerY) ** 2);
      if (dist < 2.5) {
        const intensity = 1 - dist / 2.5;
        baseColor = this.lightenColor(baseColor, intensity * 0.12);
      }
    }

    if (this.isOnStage(x, y)) {
      baseColor = this.lightenColor('#7A5E48', 0.08);
    }

    ctx.beginPath();
    ctx.moveTo(sx, sy - th / 2);
    ctx.lineTo(sx + tw / 2, sy);
    ctx.lineTo(sx, sy + th / 2);
    ctx.lineTo(sx - tw / 2, sy);
    ctx.closePath();
    ctx.fillStyle = baseColor;
    ctx.fill();

    // Very subtle inner highlight on top-left edge
    ctx.beginPath();
    ctx.moveTo(sx, sy - th / 2);
    ctx.lineTo(sx + tw / 2, sy);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(sx, sy - th / 2);
    ctx.lineTo(sx - tw / 2, sy);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  },

  drawEdges(ctx, offsetX, offsetY) {
    const gs = this.gridSize;
    const edgeDepth = 10;
    const tw = this.tileWidth * Math.cos(Math.PI / 6);

    // Bottom-right edge
    for (let x = 0; x < gs; x++) {
      const top = this.iso(x, gs);
      ctx.beginPath();
      ctx.moveTo(top.x + offsetX, top.y + offsetY);
      ctx.lineTo(top.x + offsetX + tw / 2, top.y + offsetY + this.tileHeight / 2);
      ctx.lineTo(top.x + offsetX + tw / 2, top.y + offsetY + this.tileHeight / 2 + edgeDepth);
      ctx.lineTo(top.x + offsetX, top.y + offsetY + edgeDepth);
      ctx.closePath();
      const g1 = ctx.createLinearGradient(top.x + offsetX, top.y + offsetY, top.x + offsetX, top.y + offsetY + edgeDepth);
      g1.addColorStop(0, '#2a3444');
      g1.addColorStop(1, '#0a0a1a');
      ctx.fillStyle = g1;
      ctx.fill();
    }

    // Bottom-left edge
    for (let y = 0; y < gs; y++) {
      const top = this.iso(gs, y);
      ctx.beginPath();
      ctx.moveTo(top.x + offsetX, top.y + offsetY);
      ctx.lineTo(top.x + offsetX - tw / 2, top.y + offsetY + this.tileHeight / 2);
      ctx.lineTo(top.x + offsetX - tw / 2, top.y + offsetY + this.tileHeight / 2 + edgeDepth);
      ctx.lineTo(top.x + offsetX, top.y + offsetY + edgeDepth);
      ctx.closePath();
      const g2 = ctx.createLinearGradient(top.x + offsetX, top.y + offsetY, top.x + offsetX, top.y + offsetY + edgeDepth);
      g2.addColorStop(0, '#1e2838');
      g2.addColorStop(1, '#0a0a1a');
      ctx.fillStyle = g2;
      ctx.fill();
    }
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
    if (def.isWhiteboard) return this.drawWhiteboardObj(ctx, item, def, offsetX, offsetY);
    if (def.isRound) return this.drawRoundTable(ctx, item, def, offsetX, offsetY);
    if (def.isZone || def.isCarpet) return; // drawn under tiles
    this.drawGenericFurniture(ctx, item, def, offsetX, offsetY);
  },

  drawGenericFurniture(ctx, item, def, ox, oy) {
    const cx = item.x + def.width / 2;
    const cy = item.y + def.height / 2;
    const pos = this.iso(cx, cy);
    const sx = pos.x + ox;
    const sy = pos.y + oy;
    const tw = this.tileWidth * Math.cos(Math.PI / 6);
    const w = tw * def.width * 0.4;
    const d = this.tileHeight * def.height * 0.4;
    const h = def.drawHeight;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + 3, w * 0.55, d * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    // Top
    ctx.beginPath();
    ctx.moveTo(sx, sy - h - d * 0.5);
    ctx.lineTo(sx + w * 0.5, sy - h);
    ctx.lineTo(sx, sy - h + d * 0.5);
    ctx.lineTo(sx - w * 0.5, sy - h);
    ctx.closePath();
    ctx.fillStyle = def.topColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Right
    ctx.beginPath();
    ctx.moveTo(sx + w * 0.5, sy - h);
    ctx.lineTo(sx, sy - h + d * 0.5);
    ctx.lineTo(sx, sy + d * 0.5);
    ctx.lineTo(sx + w * 0.5, sy);
    ctx.closePath();
    ctx.fillStyle = this.darkenColor(def.color, 0.2);
    ctx.fill();

    // Left
    ctx.beginPath();
    ctx.moveTo(sx - w * 0.5, sy - h);
    ctx.lineTo(sx, sy - h + d * 0.5);
    ctx.lineTo(sx, sy + d * 0.5);
    ctx.lineTo(sx - w * 0.5, sy);
    ctx.closePath();
    ctx.fillStyle = def.color;
    ctx.fill();
  },

  drawRoundTable(ctx, item, def, ox, oy) {
    const cx = item.x + def.width / 2;
    const cy = item.y + def.height / 2;
    const pos = this.iso(cx, cy);
    const sx = pos.x + ox;
    const sy = pos.y + oy;
    const h = def.drawHeight;
    const r = 14;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + 3, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    // Leg
    ctx.fillStyle = '#5A3E1E';
    ctx.fillRect(sx - 2, sy - h + 3, 4, h - 3);

    // Top
    ctx.beginPath();
    ctx.ellipse(sx, sy - h, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = def.topColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  },

  drawStage(ctx, item, def, ox, oy) {
    const h = def.drawHeight;
    const tw = this.tileWidth * Math.cos(Math.PI / 6);
    const th = this.tileHeight;

    for (let dy = 0; dy < def.height; dy++) {
      for (let dx = 0; dx < def.width; dx++) {
        const x = item.x + dx;
        const y = item.y + dy;
        const pos = this.iso(x, y, h);
        const sx = pos.x + ox;
        const sy = pos.y + oy;

        // Stage tile
        ctx.beginPath();
        ctx.moveTo(sx, sy - th / 2);
        ctx.lineTo(sx + tw / 2, sy);
        ctx.lineTo(sx, sy + th / 2);
        ctx.lineTo(sx - tw / 2, sy);
        ctx.closePath();
        const stageColor = (dx + dy) % 2 === 0 ? '#9A7E68' : '#8A6E58';
        ctx.fillStyle = stageColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Front edges
        if (dy === def.height - 1) {
          ctx.beginPath();
          ctx.moveTo(sx - tw / 2, sy);
          ctx.lineTo(sx, sy + th / 2);
          ctx.lineTo(sx, sy + th / 2 + h);
          ctx.lineTo(sx - tw / 2, sy + h);
          ctx.closePath();
          ctx.fillStyle = '#6A4E38';
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(sx, sy + th / 2);
          ctx.lineTo(sx + tw / 2, sy);
          ctx.lineTo(sx + tw / 2, sy + h);
          ctx.lineTo(sx, sy + th / 2 + h);
          ctx.closePath();
          ctx.fillStyle = '#5A3E28';
          ctx.fill();
        }
        if (dx === def.width - 1) {
          ctx.beginPath();
          ctx.moveTo(sx + tw / 2, sy);
          ctx.lineTo(sx, sy + th / 2);
          ctx.lineTo(sx, sy + th / 2 + h);
          ctx.lineTo(sx + tw / 2, sy + h);
          ctx.closePath();
          ctx.fillStyle = '#5A3E28';
          ctx.fill();
        }
      }
    }

    // Stage spotlights (decorative circles above)
    const centerPos = this.iso(item.x + def.width / 2, item.y + 0.5, h + 2);
    const csx = centerPos.x + ox;
    const csy = centerPos.y + oy;
    const spotGrad = ctx.createRadialGradient(csx, csy - 20, 0, csx, csy - 20, 40);
    spotGrad.addColorStop(0, 'rgba(255, 220, 150, 0.06)');
    spotGrad.addColorStop(1, 'rgba(255, 220, 150, 0)');
    ctx.fillStyle = spotGrad;
    ctx.fillRect(csx - 40, csy - 60, 80, 80);
  },

  drawPlant(ctx, item, def, ox, oy) {
    const pos = this.iso(item.x + 0.5, item.y + 0.5);
    const sx = pos.x + ox;
    const sy = pos.y + oy;
    const isPalm = def.isPalm;
    const trunkH = isPalm ? 20 : 0;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, 6, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fill();

    // Pot
    ctx.beginPath();
    ctx.moveTo(sx - 5, sy - 3);
    ctx.lineTo(sx + 5, sy - 3);
    ctx.lineTo(sx + 4, sy + 3);
    ctx.lineTo(sx - 4, sy + 3);
    ctx.closePath();
    ctx.fillStyle = '#A0522D';
    ctx.fill();
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    if (isPalm) {
      // Trunk
      ctx.beginPath();
      ctx.moveTo(sx - 2, sy - 3);
      ctx.lineTo(sx + 2, sy - 3);
      ctx.lineTo(sx + 1.5, sy - 3 - trunkH);
      ctx.lineTo(sx - 1.5, sy - 3 - trunkH);
      ctx.closePath();
      ctx.fillStyle = '#8B7355';
      ctx.fill();

      // Palm leaves
      const ly = sy - 3 - trunkH;
      for (let a = 0; a < 6; a++) {
        const angle = (a / 6) * Math.PI * 2;
        const lx = sx + Math.cos(angle) * 12;
        const lly = ly + Math.sin(angle) * 6 - 4;
        ctx.beginPath();
        ctx.moveTo(sx, ly - 2);
        ctx.quadraticCurveTo(sx + Math.cos(angle) * 6, ly + Math.sin(angle) * 3 - 6, lx, lly);
        ctx.strokeStyle = a % 2 === 0 ? '#2D7A27' : '#3A8A32';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      // Center
      ctx.beginPath();
      ctx.arc(sx, ly - 3, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#3A7A32';
      ctx.fill();
    } else {
      // Bush foliage
      ctx.fillStyle = def.topColor;
      ctx.beginPath(); ctx.arc(sx, sy - 14, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx - 5, sy - 10, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 5, sy - 10, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(sx - 2, sy - 13, 3, 0, Math.PI * 2); ctx.fill();
    }
  },

  drawScreen(ctx, item, def, ox, oy) {
    const cx = item.x + def.width / 2;
    const cy = item.y + def.height / 2;
    const pos = this.iso(cx, cy);
    const sx = pos.x + ox;
    const sy = pos.y + oy;

    // Stand
    ctx.fillStyle = '#444';
    ctx.fillRect(sx - 1.5, sy - def.drawHeight, 3, def.drawHeight);

    // Screen
    const sw = 32;
    const sh = 22;
    ctx.fillStyle = '#111';
    ctx.fillRect(sx - sw / 2 - 1, sy - def.drawHeight - sh - 1, sw + 2, sh + 2);
    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(sx - sw / 2, sy - def.drawHeight - sh, sw, sh);

    // Screen reflection
    const grad = ctx.createLinearGradient(sx - sw / 2, sy - def.drawHeight - sh, sx - sw / 2, sy - def.drawHeight);
    grad.addColorStop(0, 'rgba(100, 160, 220, 0.12)');
    grad.addColorStop(0.5, 'rgba(100, 160, 220, 0.03)');
    grad.addColorStop(1, 'rgba(100, 160, 220, 0.08)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx - sw / 2, sy - def.drawHeight - sh, sw, sh);
  },

  drawWhiteboardObj(ctx, item, def, ox, oy) {
    const cx = item.x + def.width / 2;
    const cy = item.y + def.height / 2;
    const pos = this.iso(cx, cy);
    const sx = pos.x + ox;
    const sy = pos.y + oy;

    // Stand
    ctx.fillStyle = '#888';
    ctx.fillRect(sx - 1, sy - def.drawHeight, 2, def.drawHeight);

    // Board
    const bw = 36;
    const bh = 24;
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(sx - bw / 2, sy - def.drawHeight - bh, bw, bh);
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - bw / 2, sy - def.drawHeight - bh, bw, bh);

    // Some marker scribbles
    ctx.strokeStyle = 'rgba(200, 60, 60, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - 10, sy - def.drawHeight - bh + 6);
    ctx.quadraticCurveTo(sx, sy - def.drawHeight - bh + 4, sx + 10, sy - def.drawHeight - bh + 8);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60, 60, 200, 0.3)';
    ctx.beginPath();
    ctx.moveTo(sx - 8, sy - def.drawHeight - bh + 14);
    ctx.lineTo(sx + 8, sy - def.drawHeight - bh + 14);
    ctx.stroke();
  },

  drawZoneMarker(ctx, item, def, ox, oy) {
    const tw = this.tileWidth * Math.cos(Math.PI / 6);
    const th = this.tileHeight;
    const w = def.width;
    const h = def.height;

    // Draw zone area with subtle highlight
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const pos = this.iso(item.x + dx, item.y + dy);
        const sx = pos.x + ox;
        const sy = pos.y + oy;
        ctx.beginPath();
        ctx.moveTo(sx, sy - th / 2);
        ctx.lineTo(sx + tw / 2, sy);
        ctx.lineTo(sx, sy + th / 2);
        ctx.lineTo(sx - tw / 2, sy);
        ctx.closePath();
        ctx.fillStyle = def.color;
        ctx.fill();
      }
    }

    // Zone label
    if (item.zone) {
      const labelPos = this.iso(item.x + w / 2, item.y + h / 2);
      const lsx = labelPos.x + ox;
      const lsy = labelPos.y + oy;

      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Number circle
      ctx.beginPath();
      ctx.arc(lsx, lsy - 8, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(126, 184, 218, 0.25)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(126, 184, 218, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#7eb8da';
      ctx.fillText(item.zone, lsx, lsy - 8);

      if (item.zoneName) {
        ctx.font = '9px "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(126, 184, 218, 0.6)';
        ctx.fillText(item.zoneName, lsx, lsy + 6);
      }
    }
  },

  drawCarpet(ctx, item, def, ox, oy) {
    const tw = this.tileWidth * Math.cos(Math.PI / 6);
    const th = this.tileHeight;
    for (let dy = 0; dy < def.height; dy++) {
      for (let dx = 0; dx < def.width; dx++) {
        const pos = this.iso(item.x + dx, item.y + dy);
        const sx = pos.x + ox;
        const sy = pos.y + oy;
        ctx.beginPath();
        ctx.moveTo(sx, sy - th / 2);
        ctx.lineTo(sx + tw / 2, sy);
        ctx.lineTo(sx, sy + th / 2);
        ctx.lineTo(sx - tw / 2, sy);
        ctx.closePath();
        ctx.fillStyle = (dx + dy) % 2 === 0
          ? 'rgba(139, 69, 19, 0.15)'
          : 'rgba(160, 82, 45, 0.12)';
        ctx.fill();
      }
    }
  },

  lightenColor(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, ((num >> 16) & 0xFF) + Math.floor(255 * amount));
    const g = Math.min(255, ((num >> 8) & 0xFF) + Math.floor(255 * amount));
    const b = Math.min(255, (num & 0xFF) + Math.floor(255 * amount));
    return `rgb(${r},${g},${b})`;
  },

  darkenColor(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, Math.floor(((num >> 16) & 0xFF) * (1 - amount)));
    const g = Math.max(0, Math.floor(((num >> 8) & 0xFF) * (1 - amount)));
    const b = Math.max(0, Math.floor((num & 0xFF) * (1 - amount)));
    return `rgb(${r},${g},${b})`;
  },
};
