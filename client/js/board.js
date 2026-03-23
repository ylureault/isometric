// Board: isometric grid rendering, furniture, and collision detection

const Board = {
  gridSize: 20,
  tileWidth: CONSTANTS.TILE_WIDTH,
  tileHeight: CONSTANTS.TILE_HEIGHT,
  floorColor1: '#3a4a5c',
  floorColor2: '#344458',
  furniture: [],
  collisionMap: null, // 2D boolean array for solid tiles

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

  // Check if a position is on the stage
  isOnStage(gx, gy) {
    for (const item of this.furniture) {
      const def = Environments.furnitureTypes[item.type];
      if (!def || !def.isStage) continue;
      if (gx >= item.x && gx < item.x + def.width &&
          gy >= item.y && gy < item.y + def.height) {
        return true;
      }
    }
    return false;
  },

  // Isometric projection: world (x, y, z) -> screen (sx, sy)
  iso(x, y, z = 0) {
    const angle = Math.PI / 6;
    const sx = (x - y) * this.tileWidth * Math.cos(angle);
    const sy = (x + y) * this.tileHeight * Math.sin(angle) - z;
    return { x: sx, y: sy };
  },

  // Screen to grid (approximate inverse)
  screenToGrid(sx, sy, offsetX, offsetY) {
    const rx = sx - offsetX;
    const ry = sy - offsetY;
    const angle = Math.PI / 6;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const tw = this.tileWidth * cosA;
    const th = this.tileHeight * sinA;
    const gx = (rx / tw + ry / th) / 2;
    const gy = (ry / th - rx / tw) / 2;
    return { x: gx, y: gy };
  },

  drawGrid(ctx, offsetX, offsetY, playerX, playerY) {
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        this.drawTile(ctx, x, y, offsetX, offsetY, playerX, playerY);
      }
    }
    // Draw grid edges (depth effect)
    this.drawEdges(ctx, offsetX, offsetY);
  },

  drawTile(ctx, x, y, offsetX, offsetY, playerX, playerY) {
    const pos = this.iso(x, y);
    const sx = pos.x + offsetX;
    const sy = pos.y + offsetY;

    const tw = this.tileWidth * Math.cos(Math.PI / 6);
    const th = this.tileHeight;

    // Checkerboard pattern
    const isEven = (x + y) % 2 === 0;
    let baseColor = isEven ? this.floorColor1 : this.floorColor2;

    // Proximity highlight near player
    if (playerX !== undefined && playerY !== undefined) {
      const dist = Math.sqrt((x - playerX) ** 2 + (y - playerY) ** 2);
      if (dist < 3) {
        const intensity = 1 - dist / 3;
        baseColor = this.lightenColor(baseColor, intensity * 0.15);
      }
    }

    // Check if this tile is a stage
    if (this.isOnStage(x, y)) {
      baseColor = this.lightenColor('#7A5E48', 0.1);
    }

    // Draw diamond tile
    ctx.beginPath();
    ctx.moveTo(sx, sy - th / 2);          // top
    ctx.lineTo(sx + tw / 2, sy);           // right
    ctx.lineTo(sx, sy + th / 2);           // bottom
    ctx.lineTo(sx - tw / 2, sy);           // left
    ctx.closePath();

    ctx.fillStyle = baseColor;
    ctx.fill();

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  },

  drawEdges(ctx, offsetX, offsetY) {
    const gs = this.gridSize;
    const edgeDepth = 8;

    // Right edge
    for (let x = 0; x < gs; x++) {
      const top = this.iso(x, gs);
      const topNext = this.iso(x + 1, gs);
      const tw = this.tileWidth * Math.cos(Math.PI / 6);

      ctx.beginPath();
      ctx.moveTo(top.x + offsetX, top.y + offsetY);
      ctx.lineTo(top.x + offsetX + tw / 2, top.y + offsetY + this.tileHeight / 2);
      ctx.lineTo(top.x + offsetX + tw / 2, top.y + offsetY + this.tileHeight / 2 + edgeDepth);
      ctx.lineTo(top.x + offsetX, top.y + offsetY + edgeDepth);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(
        top.x + offsetX, top.y + offsetY,
        top.x + offsetX, top.y + offsetY + edgeDepth
      );
      gradient.addColorStop(0, 'rgba(40,50,60,0.8)');
      gradient.addColorStop(1, 'rgba(10,10,26,0.9)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Bottom edge
    for (let y = 0; y < gs; y++) {
      const top = this.iso(gs, y);
      const tw = this.tileWidth * Math.cos(Math.PI / 6);

      ctx.beginPath();
      ctx.moveTo(top.x + offsetX, top.y + offsetY);
      ctx.lineTo(top.x + offsetX - tw / 2, top.y + offsetY + this.tileHeight / 2);
      ctx.lineTo(top.x + offsetX - tw / 2, top.y + offsetY + this.tileHeight / 2 + edgeDepth);
      ctx.lineTo(top.x + offsetX, top.y + offsetY + edgeDepth);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(
        top.x + offsetX, top.y + offsetY,
        top.x + offsetX, top.y + offsetY + edgeDepth
      );
      gradient.addColorStop(0, 'rgba(30,40,50,0.8)');
      gradient.addColorStop(1, 'rgba(10,10,26,0.9)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  },

  // Get all drawable entities (furniture) sorted by depth for rendering
  getSortedFurniture() {
    return [...this.furniture].sort((a, b) => {
      const da = a.x + a.y;
      const db = b.x + b.y;
      return da - db;
    });
  },

  drawFurnitureItem(ctx, item, offsetX, offsetY) {
    const def = Environments.furnitureTypes[item.type];
    if (!def) return;

    if (def.isStage) {
      this.drawStage(ctx, item, def, offsetX, offsetY);
      return;
    }

    if (def.isPlant) {
      this.drawPlant(ctx, item, def, offsetX, offsetY);
      return;
    }

    if (def.isScreen) {
      this.drawScreen(ctx, item, def, offsetX, offsetY);
      return;
    }

    // Generic furniture: extruded isometric box
    const cx = item.x + def.width / 2;
    const cy = item.y + def.height / 2;
    const pos = this.iso(cx, cy);
    const sx = pos.x + offsetX;
    const sy = pos.y + offsetY;

    const tw = this.tileWidth * Math.cos(Math.PI / 6);
    const w = tw * def.width * 0.4;
    const d = this.tileHeight * def.height * 0.4;
    const h = def.drawHeight;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, w * 0.6, d * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();

    // Top face
    ctx.beginPath();
    ctx.moveTo(sx, sy - h - d * 0.5);
    ctx.lineTo(sx + w * 0.5, sy - h);
    ctx.lineTo(sx, sy - h + d * 0.5);
    ctx.lineTo(sx - w * 0.5, sy - h);
    ctx.closePath();
    ctx.fillStyle = def.topColor;
    ctx.fill();

    // Right face
    ctx.beginPath();
    ctx.moveTo(sx + w * 0.5, sy - h);
    ctx.lineTo(sx, sy - h + d * 0.5);
    ctx.lineTo(sx, sy + d * 0.5);
    ctx.lineTo(sx + w * 0.5, sy);
    ctx.closePath();
    ctx.fillStyle = this.darkenColor(def.color, 0.2);
    ctx.fill();

    // Left face
    ctx.beginPath();
    ctx.moveTo(sx - w * 0.5, sy - h);
    ctx.lineTo(sx, sy - h + d * 0.5);
    ctx.lineTo(sx, sy + d * 0.5);
    ctx.lineTo(sx - w * 0.5, sy);
    ctx.closePath();
    ctx.fillStyle = def.color;
    ctx.fill();
  },

  drawStage(ctx, item, def, offsetX, offsetY) {
    const h = def.drawHeight;
    // Draw elevated platform
    for (let dy = 0; dy < def.height; dy++) {
      for (let dx = 0; dx < def.width; dx++) {
        const x = item.x + dx;
        const y = item.y + dy;
        const pos = this.iso(x, y, h);
        const sx = pos.x + offsetX;
        const sy = pos.y + offsetY;
        const tw = this.tileWidth * Math.cos(Math.PI / 6);
        const th = this.tileHeight;

        // Elevated tile
        ctx.beginPath();
        ctx.moveTo(sx, sy - th / 2);
        ctx.lineTo(sx + tw / 2, sy);
        ctx.lineTo(sx, sy + th / 2);
        ctx.lineTo(sx - tw / 2, sy);
        ctx.closePath();
        ctx.fillStyle = '#9A7E68';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Front edge of stage tile
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

        // Right edge
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
  },

  drawPlant(ctx, item, def, offsetX, offsetY) {
    const pos = this.iso(item.x + 0.5, item.y + 0.5);
    const sx = pos.x + offsetX;
    const sy = pos.y + offsetY;

    // Pot
    ctx.beginPath();
    ctx.moveTo(sx - 5, sy - 4);
    ctx.lineTo(sx + 5, sy - 4);
    ctx.lineTo(sx + 4, sy + 4);
    ctx.lineTo(sx - 4, sy + 4);
    ctx.closePath();
    ctx.fillStyle = '#8B4513';
    ctx.fill();

    // Foliage (3 circles)
    ctx.fillStyle = def.topColor;
    ctx.beginPath();
    ctx.arc(sx, sy - 14, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx - 5, sy - 10, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx + 5, sy - 10, 5, 0, Math.PI * 2);
    ctx.fill();

    // Darker details
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(sx - 2, sy - 12, 3, 0, Math.PI * 2);
    ctx.fill();
  },

  drawScreen(ctx, item, def, offsetX, offsetY) {
    const cx = item.x + def.width / 2;
    const cy = item.y + def.height / 2;
    const pos = this.iso(cx, cy);
    const sx = pos.x + offsetX;
    const sy = pos.y + offsetY;

    // Stand
    ctx.fillStyle = '#333';
    ctx.fillRect(sx - 2, sy - def.drawHeight, 4, def.drawHeight);

    // Screen panel
    const sw = 30;
    const sh = 20;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(sx - sw / 2, sy - def.drawHeight - sh, sw, sh);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - sw / 2, sy - def.drawHeight - sh, sw, sh);

    // Screen glow
    ctx.fillStyle = 'rgba(100, 140, 200, 0.15)';
    ctx.fillRect(sx - sw / 2 + 2, sy - def.drawHeight - sh + 2, sw - 4, sh - 4);
  },

  // Minimap rendering
  drawMinimap(ctx, width, height, playerX, playerY) {
    const scale = Math.min(width, height) / this.gridSize;

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    // Grid tiles
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        const isEven = (x + y) % 2 === 0;
        ctx.fillStyle = isEven ? this.floorColor1 : this.floorColor2;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    // Furniture
    for (const item of this.furniture) {
      const def = Environments.furnitureTypes[item.type];
      if (!def) continue;
      ctx.fillStyle = def.isStage ? '#9A7E68' : def.color;
      ctx.fillRect(item.x * scale, item.y * scale, def.width * scale, def.height * scale);
    }

    // Player
    ctx.fillStyle = '#FF6B6B';
    ctx.beginPath();
    ctx.arc(playerX * scale, playerY * scale, 3, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(126, 184, 218, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  },

  // Color utilities
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
