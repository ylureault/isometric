// Board: realistic isometric office rendering with walls and detailed furniture

const Board = {
  gridSize: 20,
  tileWidth: CONSTANTS.TILE_WIDTH,
  tileHeight: CONSTANTS.TILE_HEIGHT,
  floorColor1: '#c8c8c8',
  floorColor2: '#b8b8b8',
  wallColor: '#e8e0d8',
  furniture: [],
  collisionMap: null,

  init(gridSize, envType) {
    this.gridSize = gridSize;
    this.tileWidth = CONSTANTS.TILE_WIDTH;
    this.tileHeight = CONSTANTS.TILE_HEIGHT;
    var preset = Environments.getPreset(envType);
    this.floorColor1 = preset.floorColor1;
    this.floorColor2 = preset.floorColor2;
    this.wallColor = preset.wallColor || '#e0e0e0';
    this.furniture = Environments.getFurniture(envType, gridSize);
    this.buildCollisionMap();
  },

  buildCollisionMap() {
    this.collisionMap = Array.from({ length: this.gridSize }, function() {
      return new Array(Board.gridSize).fill(false);
    });
    for (var i = 0; i < this.furniture.length; i++) {
      var item = this.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def || !def.solid) continue;
      for (var dx = 0; dx < def.width; dx++) {
        for (var dy = 0; dy < def.height; dy++) {
          var gx = item.x + dx;
          var gy = item.y + dy;
          if (gx >= 0 && gx < this.gridSize && gy >= 0 && gy < this.gridSize) {
            this.collisionMap[gy][gx] = true;
          }
        }
      }
    }
  },

  isSolid(gx, gy) {
    var ix = Math.floor(gx);
    var iy = Math.floor(gy);
    if (ix < 0 || ix >= this.gridSize || iy < 0 || iy >= this.gridSize) return true;
    return this.collisionMap[iy][ix];
  },

  isInBounds(gx, gy) { return gx >= 0 && gx < this.gridSize && gy >= 0 && gy < this.gridSize; },

  isOnStage(gx, gy) {
    for (var i = 0; i < this.furniture.length; i++) {
      var item = this.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def || !def.isStage) continue;
      if (gx >= item.x && gx < item.x + def.width && gy >= item.y && gy < item.y + def.height) return true;
    }
    return false;
  },

  // Get the z elevation at a grid position (for stages)
  getElevationAt(gx, gy) {
    for (var i = 0; i < this.furniture.length; i++) {
      var item = this.furniture[i];
      var def = Environments.furnitureTypes[item.type];
      if (!def || !def.isStage) continue;
      if (gx >= item.x && gx < item.x + def.width && gy >= item.y && gy < item.y + def.height) {
        return def.drawHeight;
      }
    }
    return 0;
  },

  iso(x, y, z) {
    z = z || 0;
    return {
      x: (x - y) * (this.tileWidth / 2),
      y: (x + y) * (this.tileHeight / 2) - z,
    };
  },

  screenToGrid(sx, sy, offsetX, offsetY, zoom) {
    var z = zoom || 1;
    var rx = (sx - offsetX) / z;
    var ry = (sy - offsetY) / z;
    return {
      x: (rx / (this.tileWidth / 2) + ry / (this.tileHeight / 2)) / 2,
      y: (ry / (this.tileHeight / 2) - rx / (this.tileWidth / 2)) / 2,
    };
  },

  // ===== DRAWING PRIMITIVES =====

  drawIsoPoly(ctx, points, fill, stroke, lw) {
    if (points.length < 3) return;
    ctx.beginPath();
    var p0 = this.iso(points[0][0], points[0][1], points[0][2] || 0);
    ctx.moveTo(p0.x, p0.y);
    for (var i = 1; i < points.length; i++) {
      var p = this.iso(points[i][0], points[i][1], points[i][2] || 0);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 0.5; ctx.stroke(); }
  },

  drawIsoBox(ctx, x, y, z, w, d, h, topC, leftC, rightC, stroke) {
    // Top face
    this.drawIsoPoly(ctx, [[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]], topC, stroke, 0.5);
    // Left face (front-left)
    this.drawIsoPoly(ctx, [[x,y+d,z+h],[x+w,y+d,z+h],[x+w,y+d,z],[x,y+d,z]], leftC, stroke, 0.5);
    // Right face (front-right)
    this.drawIsoPoly(ctx, [[x+w,y,z+h],[x+w,y+d,z+h],[x+w,y+d,z],[x+w,y,z]], rightC, stroke, 0.5);
  },

  drawIsoLine(ctx, p1, p2, color, lw) {
    var a = this.iso(p1[0], p1[1], p1[2] || 0);
    var b = this.iso(p2[0], p2[1], p2[2] || 0);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 1;
    ctx.stroke();
  },

  // ===== MAIN DRAWING =====

  drawGrid(ctx, offsetX, offsetY, playerX, playerY) {
    var gs = this.gridSize;

    // Floor
    this.drawIsoPoly(ctx, [[0,0,0],[gs,0,0],[gs,gs,0],[0,gs,0]], this.floorColor1, null, 0);

    // Tile grid lines
    for (var i = 0; i <= gs; i++) {
      this.drawIsoLine(ctx, [i, 0, 0], [i, gs, 0], 'rgba(0,0,0,0.04)', 0.5);
      this.drawIsoLine(ctx, [0, i, 0], [gs, i, 0], 'rgba(0,0,0,0.04)', 0.5);
    }

    // Alternating tile shading
    for (var y = 0; y < gs; y++) {
      for (var x = 0; x < gs; x++) {
        if ((x + y) % 2 === 1) {
          this.drawIsoPoly(ctx,
            [[x,y,0],[x+1,y,0],[x+1,y+1,0],[x,y+1,0]],
            this.floorColor2, null, 0
          );
        }
      }
    }

    // Player proximity glow
    if (playerX !== undefined) {
      for (var py = Math.max(0, Math.floor(playerY) - 2); py <= Math.min(gs - 1, Math.floor(playerY) + 2); py++) {
        for (var px = Math.max(0, Math.floor(playerX) - 2); px <= Math.min(gs - 1, Math.floor(playerX) + 2); px++) {
          var dist = Math.sqrt((px + 0.5 - playerX) * (px + 0.5 - playerX) + (py + 0.5 - playerY) * (py + 0.5 - playerY));
          if (dist < 2.5) {
            var alpha = (1 - dist / 2.5) * 0.08;
            this.drawIsoPoly(ctx,
              [[px,py,0],[px+1,py,0],[px+1,py+1,0],[px,py+1,0]],
              'rgba(70,130,180,' + alpha + ')', null, 0
            );
          }
        }
      }
    }

    // Draw walls and floor edges
    this.drawWalls(ctx);
    this.drawEdges(ctx, 0, 0);
  },

  drawWalls(ctx) {
    var gs = this.gridSize;
    var WH = 80; // wall height in pixels

    // Back-left wall: x=0, y goes from 0 to gs
    this.drawIsoPoly(ctx,
      [[0,0,0],[0,gs,0],[0,gs,WH],[0,0,WH]],
      this.wallColor, 'rgba(0,0,0,0.05)', 0.5
    );

    // Back-right wall: y=0, x goes from 0 to gs
    this.drawIsoPoly(ctx,
      [[0,0,0],[gs,0,0],[gs,0,WH],[0,0,WH]],
      this.darken(this.wallColor, 0.05), 'rgba(0,0,0,0.05)', 0.5
    );

    // Wall tops
    this.drawIsoPoly(ctx,
      [[0,0,WH],[gs,0,WH],[gs,0,WH+3],[0,0,WH+3]],
      '#fff', 'rgba(0,0,0,0.05)', 0.3
    );
    this.drawIsoPoly(ctx,
      [[0,0,WH],[0,gs,WH],[0,gs,WH+3],[0,0,WH+3]],
      '#f8f8f8', 'rgba(0,0,0,0.05)', 0.3
    );
  },

  drawEdges(ctx, offsetX, offsetY) {
    var gs = this.gridSize;
    var depth = 8;

    // Bottom-right edge
    this.drawIsoPoly(ctx,
      [[gs,0,0],[gs,gs,0],[gs,gs,-depth],[gs,0,-depth]],
      '#888', 'rgba(0,0,0,0.1)', 0.5
    );

    // Bottom-left edge
    this.drawIsoPoly(ctx,
      [[0,gs,0],[gs,gs,0],[gs,gs,-depth],[0,gs,-depth]],
      '#999', 'rgba(0,0,0,0.1)', 0.5
    );
  },

  getSortedFurniture() {
    return this.furniture.slice().sort(function(a, b) { return (a.x + a.y) - (b.x + b.y); });
  },

  // ===== FURNITURE DRAWING =====

  drawFurnitureItem(ctx, item, offsetX, offsetY) {
    var def = Environments.furnitureTypes[item.type];
    if (!def) return;
    if (def.isStage) return this.drawStage(ctx, item, def);
    if (def.isPlant) return this.drawPlant(ctx, item, def);
    if (def.isScreen) return this.drawScreen(ctx, item, def);
    if (def.isWhiteboard) return this.drawWhiteboard(ctx, item, def);
    if (def.isPostItBoard) return this.drawPostItBoard(ctx, item, def);
    if (def.isZone) return this.drawZoneOverlay(ctx, item, def);
    if (def.isCollabSpace) return this.drawCollabSpace(ctx, item, def);
    if (def.isPartition) return this.drawPartition(ctx, item, def);
    if (def.isPodium) return this.drawPodium(ctx, item, def);
    if (def.isProjector) return this.drawProjector(ctx, item, def);
    if (def.isWaterCooler) return this.drawWaterCooler(ctx, item, def);
    if (def.isLamp) return this.drawLamp(ctx, item, def);
    if (def.isDoor) return this.drawDoor(ctx, item, def);
    if (def.isClock) return this.drawClock(ctx, item, def);
    if (def.isConfPhone) return this.drawConfPhone(ctx, item, def);
    if (def.isStandingDesk) return this.drawStandingDesk(ctx, item, def);
    if (item.type === 'desk') return this.drawDesk(ctx, item, def);
    if (item.type === 'chair') return this.drawChair(ctx, item, def);
    if (item.type === 'couch') return this.drawCouch(ctx, item, def);
    if (item.type === 'coffeeTable') return this.drawCoffeeTable(ctx, item, def);
    if (item.type === 'largeTable') return this.drawLargeTable(ctx, item, def);
    if (item.type === 'roundTable') return this.drawRoundTable(ctx, item, def);
    if (item.type === 'bookshelf') return this.drawBookshelf(ctx, item, def);
    this.drawIsoBox(ctx, item.x, item.y, 0, def.width, def.height, def.drawHeight, def.topColor, this.darken(def.color, 0.1), def.color, 'rgba(0,0,0,0.1)');
  },

  drawDesk(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var legH = 10, topH = 2;

    // Legs (dark)
    this.drawIsoBox(ctx, x+0.1, y+0.05, 0, 0.1, 0.08, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+w-0.2, y+0.05, 0, 0.1, 0.08, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+0.1, y+d-0.13, 0, 0.1, 0.08, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+w-0.2, y+d-0.13, 0, 0.1, 0.08, legH, '#2a2a2a', '#1a1a1a', '#222', null);

    // Table top
    this.drawIsoBox(ctx, x, y, legH, w, d, topH, def.topColor, this.darken(def.color, 0.1), def.color, 'rgba(0,0,0,0.08)');

    // Monitor
    var mz = legH + topH;
    var mx = x + 0.3, my = y + 0.15;
    // Monitor stand
    this.drawIsoBox(ctx, mx+0.25, my, mz, 0.15, 0.12, 5, '#444', '#333', '#3a3a3a', null);
    // Monitor bezel
    this.drawIsoPoly(ctx, [[mx,my,mz+5],[mx+0.65,my,mz+5],[mx+0.65,my,mz+12],[mx,my,mz+12]], '#2a2a2a', '#1a1a1a', 0.5);
    // Monitor screen (blue glow)
    this.drawIsoPoly(ctx, [[mx+0.04,my,mz+5.5],[mx+0.61,my,mz+5.5],[mx+0.61,my,mz+11.5],[mx+0.04,my,mz+11.5]], '#4488cc', '#336699', 0.3);

    // Keyboard
    this.drawIsoBox(ctx, x+0.3, y+0.5, mz, 0.6, 0.25, 0.3, '#e0e0e0', '#ccc', '#d5d5d5', 'rgba(0,0,0,0.06)');
  },

  drawChair(ctx, item, def) {
    var x = item.x + 0.25, y = item.y + 0.25;
    var seatH = 7;

    // Base with wheels
    this.drawIsoBox(ctx, x+0.05, y+0.05, 0, 0.4, 0.4, 0.8, '#444', '#333', '#3a3a3a', null);
    // Pole
    this.drawIsoBox(ctx, x+0.15, y+0.15, 0.8, 0.15, 0.15, seatH - 2, '#555', '#444', '#4a4a4a', null);
    // Seat
    this.drawIsoBox(ctx, x-0.02, y-0.02, seatH, 0.55, 0.55, 1, '#5a6d7a', '#4a5d6a', '#506370', null);
    // Backrest
    this.drawIsoBox(ctx, x, y-0.02, seatH + 1, 0.5, 0.06, 8, '#5a6d7a', '#4a5d6a', '#506370', null);
    // Armrests
    this.drawIsoBox(ctx, x, y+0.05, seatH + 3, 0.06, 0.35, 0.5, '#4a5d6a', '#3a4d5a', '#455560', null);
    this.drawIsoBox(ctx, x+0.44, y+0.05, seatH + 3, 0.06, 0.35, 0.5, '#4a5d6a', '#3a4d5a', '#455560', null);
  },

  drawCouch(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var h = def.drawHeight;

    // Couch base
    this.drawIsoBox(ctx, x, y, 0, w, d, h * 0.6, def.topColor, this.darken(def.color, 0.15), def.color, 'rgba(0,0,0,0.05)');
    // Backrest
    this.drawIsoBox(ctx, x, y, h * 0.6, w, 0.2, h * 0.5, this.darken(def.color, 0.05), this.darken(def.color, 0.2), this.darken(def.color, 0.1), null);
    // Cushion lines
    if (w >= 2) {
      this.drawIsoLine(ctx, [x + w/2, y, h*0.6 + 0.5], [x + w/2, y + d, h*0.6 + 0.5], 'rgba(0,0,0,0.08)', 0.5);
    }
    // Armrests
    this.drawIsoBox(ctx, x, y, h*0.6, 0.2, d, h*0.3, this.darken(def.color, 0.08), this.darken(def.color, 0.2), this.darken(def.color, 0.12), null);
    this.drawIsoBox(ctx, x+w-0.2, y, h*0.6, 0.2, d, h*0.3, this.darken(def.color, 0.08), this.darken(def.color, 0.2), this.darken(def.color, 0.12), null);
  },

  drawCoffeeTable(ctx, item, def) {
    var x = item.x, y = item.y;
    // Short legs
    this.drawIsoBox(ctx, x+0.1, y+0.1, 0, 0.08, 0.08, 3, '#bbb', '#aaa', '#b0b0b0', null);
    this.drawIsoBox(ctx, x+0.8, y+0.1, 0, 0.08, 0.08, 3, '#bbb', '#aaa', '#b0b0b0', null);
    this.drawIsoBox(ctx, x+0.1, y+0.8, 0, 0.08, 0.08, 3, '#bbb', '#aaa', '#b0b0b0', null);
    this.drawIsoBox(ctx, x+0.8, y+0.8, 0, 0.08, 0.08, 3, '#bbb', '#aaa', '#b0b0b0', null);
    // Glass top
    this.drawIsoBox(ctx, x+0.05, y+0.05, 3, 0.9, 0.9, 0.8, 'rgba(220,230,240,0.7)', 'rgba(200,210,220,0.5)', 'rgba(210,220,230,0.6)', 'rgba(0,0,0,0.08)');
  },

  drawLargeTable(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var legH = 10;

    // Legs
    this.drawIsoBox(ctx, x+0.15, y+0.1, 0, 0.12, 0.1, legH, '#1a1a1a', '#111', '#1a1a1a', null);
    this.drawIsoBox(ctx, x+w-0.27, y+0.1, 0, 0.12, 0.1, legH, '#1a1a1a', '#111', '#1a1a1a', null);
    this.drawIsoBox(ctx, x+0.15, y+d-0.2, 0, 0.12, 0.1, legH, '#1a1a1a', '#111', '#1a1a1a', null);
    this.drawIsoBox(ctx, x+w-0.27, y+d-0.2, 0, 0.12, 0.1, legH, '#1a1a1a', '#111', '#1a1a1a', null);
    // Table top
    this.drawIsoBox(ctx, x, y, legH, w, d, 1.5, def.topColor, this.darken(def.color, 0.1), def.color, 'rgba(0,0,0,0.06)');
    // Front panel
    this.drawIsoPoly(ctx, [[x,y+d,legH-6],[x+w,y+d,legH-6],[x+w,y+d,legH],[x,y+d,legH]], '#e8e8e8', 'rgba(0,0,0,0.05)', 0.3);
  },

  drawRoundTable(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var legH = 10;
    var cx = x + w / 2, cy = y + d / 2;

    // Center pole
    this.drawIsoBox(ctx, cx-0.1, cy-0.1, 0, 0.2, 0.2, legH, '#ccc', '#bbb', '#c0c0c0', null);
    // Table top (approximate circle with octagon)
    var r = w * 0.45;
    var pts = [];
    for (var a = 0; a < 8; a++) {
      var angle = a * Math.PI / 4;
      pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, legH + 1]);
    }
    this.drawIsoPoly(ctx, pts, def.topColor, 'rgba(0,0,0,0.08)', 0.5);
  },

  drawBookshelf(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var h = def.drawHeight;

    // Main frame
    this.drawIsoBox(ctx, x, y, 0, w, d, h, def.topColor, this.darken(def.color, 0.05), def.color, 'rgba(0,0,0,0.06)');

    // Shelves
    var shelves = 3;
    for (var i = 1; i <= shelves; i++) {
      var sz = i * h / (shelves + 1);
      this.drawIsoPoly(ctx, [[x+0.05,y,sz],[x+w-0.05,y,sz],[x+w-0.05,y+d,sz],[x+0.05,y+d,sz]], '#e8e8e8', 'rgba(0,0,0,0.04)', 0.3);
    }

    // Books on shelves
    var bookColors = ['#d94040','#4a90d9','#b8c940','#e8a030','#6b8e4e','#9b59b6'];
    var bi = 0;
    for (var row = 0; row < shelves; row++) {
      var bz = (row + 1) * h / (shelves + 1) + 0.5;
      var bx = x + 0.1;
      while (bx < x + w - 0.3) {
        var bw = 0.15 + Math.random() * 0.1;
        var bh = h / (shelves + 1) - 2;
        this.drawIsoBox(ctx, bx, y, bz, bw, d * 0.7, bh, bookColors[bi % bookColors.length], bookColors[bi % bookColors.length], bookColors[bi % bookColors.length], null);
        bx += bw + 0.02;
        bi++;
      }
    }
  },

  drawPartition(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var h = def.drawHeight;

    // Frame posts
    this.drawIsoBox(ctx, x, y, 0, 0.08, 0.08, h, '#a0b0b8', '#8a9aa0', '#95a5ad', null);
    this.drawIsoBox(ctx, x, y+d, 0, 0.08, 0.08, h, '#a0b0b8', '#8a9aa0', '#95a5ad', null);

    // Glass panel (semi-transparent)
    ctx.save();
    ctx.globalAlpha = 0.2;
    this.drawIsoPoly(ctx, [[x,y,1],[x,y+d,1],[x,y+d,h-1],[x,y,h-1]], '#b0dce8', '#90c0d0', 1);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Frame lines
    this.drawIsoLine(ctx, [x,y,0], [x,y,h], '#a0b8c0', 1.5);
    this.drawIsoLine(ctx, [x,y+d,0], [x,y+d,h], '#a0b8c0', 1.5);
    this.drawIsoLine(ctx, [x,y,h], [x,y+d,h], '#a0b8c0', 1);
    this.drawIsoLine(ctx, [x,y,h/2], [x,y+d,h/2], '#a0b8c0', 0.5);

    // Reflection highlight
    ctx.save();
    ctx.globalAlpha = 0.08;
    this.drawIsoPoly(ctx, [[x,y+0.3,2],[x,y+d*0.6,2],[x,y+d*0.6,h-2],[x,y+0.3,h-2]], '#fff', null, 0);
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  drawPostItBoard(ctx, item, def) {
    // Cork board mounted on left wall (x=0)
    var x = item.x, y = item.y;
    var d = def.height;
    var bz = 20;
    var bh = 18;

    // Cork background
    this.drawIsoPoly(ctx, [
      [x, y, bz],
      [x, y+d, bz],
      [x, y+d, bz+bh],
      [x, y, bz+bh]
    ], '#c4a06a', '#a08050', 1);

    // Post-its (colorful squares on the cork)
    var postItColors = ['#FFE066','#FF6B6B','#6BCB77','#4D96FF','#FF78C4','#FFB347'];
    for (var i = 0; i < 6; i++) {
      var py = y + 0.15 + (i % 3) * (d - 0.3) / 3;
      var pz = bz + 2 + Math.floor(i / 3) * (bh - 4) / 2;
      var pw = (d - 0.3) / 3 - 0.1;
      var ph = (bh - 4) / 2 - 1;
      this.drawIsoPoly(ctx, [
        [x, py, pz],
        [x, py+pw, pz],
        [x, py+pw, pz+ph],
        [x, py, pz+ph]
      ], postItColors[i], null, 0);
    }

    // Frame
    this.drawIsoLine(ctx, [x,y,bz], [x,y+d,bz], '#8a6a4a', 1.5);
    this.drawIsoLine(ctx, [x,y+d,bz], [x,y+d,bz+bh], '#8a6a4a', 1.5);
    this.drawIsoLine(ctx, [x,y+d,bz+bh], [x,y,bz+bh], '#8a6a4a', 1.5);
    this.drawIsoLine(ctx, [x,y,bz+bh], [x,y,bz], '#8a6a4a', 1.5);

    // Label above post-it board
    var labelPos = this.iso(x, y + d / 2, bz + bh + 3);
    ctx.font = 'bold 9px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(230,126,34,0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('📌 Mur collaboratif', labelPos.x, labelPos.y - 2);
    ctx.font = '7px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(230,126,34,0.55)';
    ctx.fillText('Cliquez pour ouvrir', labelPos.x, labelPos.y + 8);
  },

  drawStage(ctx, item, def) {
    var h = def.drawHeight;

    for (var dy = 0; dy < def.height; dy++) {
      for (var dx = 0; dx < def.width; dx++) {
        var tx = item.x + dx, ty = item.y + dy;
        var woodColor = (dx + dy) % 2 === 0 ? '#C8A070' : '#B89060';

        // Stage tile top
        this.drawIsoPoly(ctx, [[tx,ty,h],[tx+1,ty,h],[tx+1,ty+1,h],[tx,ty+1,h]], woodColor, 'rgba(0,0,0,0.04)', 0.3);

        // Front edge
        if (dy === def.height - 1) {
          this.drawIsoPoly(ctx, [[tx,ty+1,h],[tx+1,ty+1,h],[tx+1,ty+1,0],[tx,ty+1,0]], '#8A6848', 'rgba(0,0,0,0.06)', 0.3);
        }
        // Right edge
        if (dx === def.width - 1) {
          this.drawIsoPoly(ctx, [[tx+1,ty,h],[tx+1,ty+1,h],[tx+1,ty+1,0],[tx+1,ty,0]], '#7A5838', 'rgba(0,0,0,0.06)', 0.3);
        }
      }
    }
  },

  drawPlant(ctx, item, def) {
    var x = item.x + 0.5, y = item.y + 0.5;
    var pos = this.iso(x, y);

    // Shadow
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 3, 8, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();

    // White pot
    this.drawIsoBox(ctx, x-0.2, y-0.2, 0, 0.4, 0.4, 5, '#f0f0f0', '#ddd', '#e5e5e5', 'rgba(0,0,0,0.06)');

    // Pot rim
    this.drawIsoBox(ctx, x-0.22, y-0.22, 5, 0.44, 0.44, 0.8, '#f5f5f5', '#e8e8e8', '#eee', null);

    // Soil
    this.drawIsoPoly(ctx, [[x-0.18,y-0.18,5.8],[x+0.18,y-0.18,5.8],[x+0.18,y+0.18,5.8],[x-0.18,y+0.18,5.8]], '#5a3a20', null, 0);

    if (def.isPalm) {
      // Trunk
      this.drawIsoBox(ctx, x-0.06, y-0.06, 5.8, 0.12, 0.12, 18, '#8B7355', '#7a6345', '#806950', null);
      // Palm fronds
      var frondColors = ['#2D8A27', '#3A9A32', '#4AAA42', '#2D7A27'];
      for (var a = 0; a < 7; a++) {
        var angle = a * Math.PI * 2 / 7;
        var fpos = this.iso(x, y, 24);
        var endX = fpos.x + Math.cos(angle) * 22;
        var endY = fpos.y + Math.sin(angle) * 12 - 5;
        ctx.beginPath();
        ctx.moveTo(fpos.x, fpos.y);
        ctx.quadraticCurveTo(fpos.x + Math.cos(angle) * 12, fpos.y + Math.sin(angle) * 6 - 10, endX, endY);
        ctx.strokeStyle = frondColors[a % frondColors.length];
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    } else {
      // Bush foliage
      var foliageZ = 8;
      var fp = this.iso(x, y, foliageZ);
      ctx.fillStyle = '#3A8A32';
      ctx.beginPath(); ctx.arc(fp.x, fp.y - 6, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2D7A27';
      ctx.beginPath(); ctx.arc(fp.x - 5, fp.y - 2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(fp.x + 5, fp.y - 2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4AAA42';
      ctx.beginPath(); ctx.arc(fp.x + 2, fp.y - 9, 4, 0, Math.PI * 2); ctx.fill();
    }
  },

  drawScreen(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var cx = x + w / 2, cy = y + d / 2;

    // Stand
    this.drawIsoBox(ctx, cx-0.06, cy-0.06, 0, 0.12, 0.12, def.drawHeight - 5, '#555', '#444', '#4a4a4a', null);

    // Screen bezel
    this.drawIsoPoly(ctx, [
      [cx-0.7, cy, def.drawHeight-5],
      [cx+0.7, cy, def.drawHeight-5],
      [cx+0.7, cy, def.drawHeight+8],
      [cx-0.7, cy, def.drawHeight+8]
    ], '#1a1a1a', '#111', 0.5);

    // Screen (blue glow)
    this.drawIsoPoly(ctx, [
      [cx-0.62, cy, def.drawHeight-4],
      [cx+0.62, cy, def.drawHeight-4],
      [cx+0.62, cy, def.drawHeight+7],
      [cx-0.62, cy, def.drawHeight+7]
    ], '#4488cc', '#336699', 0.3);
  },

  drawWhiteboard(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;

    // Wall-mounted whiteboard (vertical, on y=0 wall)
    var bx = x, by = y;
    var bw = w;
    var bz = 20; // height on wall

    // Gray frame
    this.drawIsoPoly(ctx, [
      [bx, by, bz],
      [bx+bw, by, bz],
      [bx+bw, by, bz+18],
      [bx, by, bz+18]
    ], '#888', '#777', 0.8);

    // White surface
    this.drawIsoPoly(ctx, [
      [bx+0.08, by, bz+0.8],
      [bx+bw-0.08, by, bz+0.8],
      [bx+bw-0.08, by, bz+17],
      [bx+0.08, by, bz+17]
    ], '#fff', '#e0e0e0', 0.5);

    // Subtle content hint (some lines)
    this.drawIsoLine(ctx, [bx+0.3, by, bz+5], [bx+bw-0.3, by, bz+5], '#ddd', 0.3);
    this.drawIsoLine(ctx, [bx+0.3, by, bz+8], [bx+bw*0.7, by, bz+8], '#e8e8e8', 0.3);
    this.drawIsoLine(ctx, [bx+0.3, by, bz+11], [bx+bw-0.5, by, bz+11], '#ddd', 0.3);

    // Marker tray
    this.drawIsoBox(ctx, bx+0.2, by-0.08, bz-0.5, bw-0.4, 0.1, 0.5, '#e0e0e0', '#ccc', '#d5d5d5', null);

    // Label above whiteboard
    var labelPos = this.iso(bx + bw / 2, by, bz + 20);
    ctx.font = 'bold 9px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(52,152,219,0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('📋 Tableau collaboratif', labelPos.x, labelPos.y - 2);
    ctx.font = '7px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(52,152,219,0.55)';
    ctx.fillText('Cliquez pour ouvrir', labelPos.x, labelPos.y + 8);
  },

  drawZoneOverlay(ctx, item, def) {
    var w = item.width || def.width;
    var h = item.height || def.height;

    // Light overlay
    for (var dy = 0; dy < h; dy++) {
      for (var dx = 0; dx < w; dx++) {
        this.drawIsoPoly(ctx,
          [[item.x+dx, item.y+dy, 0.2],[item.x+dx+1, item.y+dy, 0.2],[item.x+dx+1, item.y+dy+1, 0.2],[item.x+dx, item.y+dy+1, 0.2]],
          'rgba(100,160,200,0.06)', null, 0
        );
      }
    }

    // Zone label
    if (item.zone) {
      var lp = this.iso(item.x + w/2, item.y + h/2, 1);

      // Circle background
      ctx.beginPath();
      ctx.arc(lp.x, lp.y - 6, 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(74,111,165,0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(74,111,165,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Number
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.fillStyle = '#4a6fa5';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.zone, lp.x, lp.y - 6);

      // Zone name
      if (item.zoneName) {
        ctx.font = '10px "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(74,111,165,0.7)';
        ctx.fillText(item.zoneName, lp.x, lp.y + 10);
      }
    }
  },

  drawPodium(ctx, item, def) {
    var x = item.x, y = item.y;
    // Base
    this.drawIsoBox(ctx, x+0.1, y+0.1, 0, 0.8, 0.8, 14, def.topColor, this.darken(def.color, 0.1), def.color, 'rgba(0,0,0,0.08)');
    // Slanted top surface
    this.drawIsoBox(ctx, x+0.05, y+0.05, 14, 0.9, 0.9, 2, def.topColor, this.darken(def.color, 0.1), def.color, 'rgba(0,0,0,0.06)');
    // Front panel (darker)
    this.drawIsoPoly(ctx, [[x+0.1,y+0.9,14],[x+0.9,y+0.9,14],[x+0.9,y+0.9,4],[x+0.1,y+0.9,4]], this.darken(def.color, 0.2), 'rgba(0,0,0,0.06)', 0.3);
  },

  drawProjector(ctx, item, def) {
    var x = item.x + 0.5, y = item.y + 0.5;
    // Tripod legs
    var base = this.iso(x, y, 0);
    for (var a = 0; a < 3; a++) {
      var angle = a * Math.PI * 2 / 3 - Math.PI / 2;
      var lx = base.x + Math.cos(angle) * 6;
      var ly = base.y + Math.sin(angle) * 3;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y - 20);
      ctx.lineTo(lx, ly);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Body
    this.drawIsoBox(ctx, x-0.15, y-0.15, 18, 0.3, 0.3, 4, '#444', '#333', '#3a3a3a', null);
    // Lens
    var lpos = this.iso(x, y, 22);
    ctx.beginPath();
    ctx.arc(lpos.x, lpos.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#88aaff';
    ctx.fill();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();
  },

  drawWaterCooler(ctx, item, def) {
    var x = item.x + 0.5, y = item.y + 0.5;
    // Base cabinet
    this.drawIsoBox(ctx, x-0.25, y-0.25, 0, 0.5, 0.5, 10, '#e0e0e0', '#ccc', '#d5d5d5', 'rgba(0,0,0,0.06)');
    // Water tank (blue tinted)
    this.drawIsoBox(ctx, x-0.18, y-0.18, 10, 0.36, 0.36, 8, 'rgba(173,216,230,0.7)', 'rgba(135,206,235,0.5)', 'rgba(150,210,240,0.6)', 'rgba(0,0,0,0.08)');
    // Cap
    this.drawIsoBox(ctx, x-0.12, y-0.12, 18, 0.24, 0.24, 1, '#ddd', '#ccc', '#d5d5d5', null);
  },

  drawLamp(ctx, item, def) {
    var x = item.x + 0.5, y = item.y + 0.5;
    // Base disc
    this.drawIsoBox(ctx, x-0.2, y-0.2, 0, 0.4, 0.4, 0.8, '#aaa', '#999', '#a0a0a0', null);
    // Pole
    this.drawIsoBox(ctx, x-0.04, y-0.04, 0.8, 0.08, 0.08, 24, '#bbb', '#aaa', '#b0b0b0', null);
    // Lamp shade
    var top = this.iso(x, y, 25);
    ctx.beginPath();
    ctx.ellipse(top.x, top.y, 8, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f5e6c8';
    ctx.fill();
    ctx.strokeStyle = '#d4c5a8';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Glow
    ctx.beginPath();
    ctx.ellipse(top.x, top.y + 3, 12, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,240,200,0.08)';
    ctx.fill();
  },

  drawStandingDesk(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var legH = 16;
    // Tall legs
    this.drawIsoBox(ctx, x+0.1, y+0.05, 0, 0.08, 0.06, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+w-0.18, y+0.05, 0, 0.08, 0.06, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+0.1, y+d-0.11, 0, 0.08, 0.06, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+w-0.18, y+d-0.11, 0, 0.08, 0.06, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    // Table top
    this.drawIsoBox(ctx, x, y, legH, w, d, 1.5, def.topColor, this.darken(def.color, 0.1), def.color, 'rgba(0,0,0,0.08)');
    // Monitor on top
    var mx = x + 0.3, my = y + 0.1;
    this.drawIsoPoly(ctx, [[mx,my,legH+1.5],[mx+0.6,my,legH+1.5],[mx+0.6,my,legH+9],[mx,my,legH+9]], '#2a2a2a', '#1a1a1a', 0.5);
    this.drawIsoPoly(ctx, [[mx+0.04,my,legH+2],[mx+0.56,my,legH+2],[mx+0.56,my,legH+8.5],[mx+0.04,my,legH+8.5]], '#4488cc', '#336699', 0.3);
  },

  drawDoor(ctx, item, def) {
    var x = item.x, y = item.y;
    var time = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;

    // Door frame (dark arch)
    this.drawIsoBox(ctx, x+0.1, y+0.1, 0, 0.8, 0.8, 28, '#5A3A7A', '#4A2A6A', '#503070', null);

    // Door surface (lighter purple)
    this.drawIsoPoly(ctx, [
      [x+0.15, y+0.5, 2],
      [x+0.85, y+0.5, 2],
      [x+0.85, y+0.5, 26],
      [x+0.15, y+0.5, 26]
    ], '#7B52A0', '#6A4290', 0.5);

    // Door arch top
    var archPos = this.iso(x+0.5, y+0.5, 27);
    ctx.beginPath();
    ctx.ellipse(archPos.x, archPos.y, 10, 5, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = '#5A3A7A';
    ctx.fill();

    // Portal glow effect (animated)
    var glowAlpha = 0.3 + Math.sin(time * 3) * 0.15;
    var portalPos = this.iso(x+0.5, y+0.5, 14);
    ctx.beginPath();
    ctx.ellipse(portalPos.x, portalPos.y, 8, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(155,89,182,' + glowAlpha + ')';
    ctx.fill();

    // Sparkle particles
    for (var sp = 0; sp < 4; sp++) {
      var sparkAngle = time * 2 + sp * Math.PI / 2;
      var sparkR = 5 + Math.sin(time * 4 + sp) * 2;
      var spx = portalPos.x + Math.cos(sparkAngle) * sparkR;
      var spy = portalPos.y + Math.sin(sparkAngle) * sparkR * 0.6;
      ctx.beginPath();
      ctx.arc(spx, spy, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,160,255,' + (0.5 + Math.sin(time * 5 + sp) * 0.3) + ')';
      ctx.fill();
    }

    // Door handle
    var handlePos = this.iso(x+0.75, y+0.5, 14);
    ctx.beginPath();
    ctx.arc(handlePos.x, handlePos.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#D4A017';
    ctx.fill();

    // Label (linked room name if set)
    ctx.font = 'bold 8px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(200,160,255,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText(item.doorLabel || '🚪 Portail', portalPos.x, portalPos.y + 20);
  },

  drawClock(ctx, item, def) {
    var x = item.x + 0.5, y = item.y + 0.5;
    var time = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;

    // Wall mount (on y=0 wall)
    var cz = 35;
    var cpos = this.iso(x, y, cz);

    // Clock face
    ctx.beginPath();
    ctx.arc(cpos.x, cpos.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f5f5';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Hour marks
    for (var h = 0; h < 12; h++) {
      var angle = h * Math.PI / 6 - Math.PI / 2;
      var mx = cpos.x + Math.cos(angle) * 8;
      var my = cpos.y + Math.sin(angle) * 8;
      ctx.beginPath();
      ctx.arc(mx, my, 0.8, 0, Math.PI * 2);
      ctx.fillStyle = '#333';
      ctx.fill();
    }

    // Hour hand
    var hourAngle = (time / 3600 % 12) * Math.PI / 6 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cpos.x, cpos.y);
    ctx.lineTo(cpos.x + Math.cos(hourAngle) * 5, cpos.y + Math.sin(hourAngle) * 5);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Minute hand
    var minAngle = (time / 60 % 60) * Math.PI / 30 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cpos.x, cpos.y);
    ctx.lineTo(cpos.x + Math.cos(minAngle) * 7, cpos.y + Math.sin(minAngle) * 7);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cpos.x, cpos.y, 1, 0, Math.PI * 2);
    ctx.fillStyle = '#e74c3c';
    ctx.fill();
  },

  drawConfPhone(ctx, item, def) {
    var x = item.x + 0.5, y = item.y + 0.5;

    // Base (triangular speaker phone shape)
    var pts = [];
    for (var a = 0; a < 3; a++) {
      var angle = a * Math.PI * 2 / 3 - Math.PI / 2;
      pts.push([x + Math.cos(angle) * 0.35, y + Math.sin(angle) * 0.35, 11]);
    }
    this.drawIsoPoly(ctx, pts, '#3a3a3a', '#222', 0.5);

    // Raised center
    this.drawIsoBox(ctx, x-0.15, y-0.15, 10, 0.3, 0.3, 2, '#4a4a4a', '#333', '#3a3a3a', null);

    // Small LED indicator
    var ledPos = this.iso(x, y, 12.5);
    ctx.beginPath();
    ctx.arc(ledPos.x, ledPos.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#2ecc71';
    ctx.fill();

    // Speaker holes
    for (var sh = 0; sh < 6; sh++) {
      var sa = sh * Math.PI / 3;
      var shp = this.iso(x + Math.cos(sa) * 0.2, y + Math.sin(sa) * 0.2, 12.5);
      ctx.beginPath();
      ctx.arc(shp.x, shp.y, 0.8, 0, Math.PI * 2);
      ctx.fillStyle = '#222';
      ctx.fill();
    }
  },

  drawCollabSpace(ctx, item, def) {
    var w = item.width || def.width;
    var h = item.height || def.height;
    // Subtle green-tinted overlay
    for (var dy = 0; dy < h; dy++) {
      for (var dx = 0; dx < w; dx++) {
        this.drawIsoPoly(ctx,
          [[item.x+dx, item.y+dy, 0.2],[item.x+dx+1, item.y+dy, 0.2],[item.x+dx+1, item.y+dy+1, 0.2],[item.x+dx, item.y+dy+1, 0.2]],
          'rgba(46,204,113,0.06)', null, 0
        );
      }
    }
    // Border dashes
    this.drawIsoLine(ctx, [item.x, item.y, 0.3], [item.x+w, item.y, 0.3], 'rgba(46,204,113,0.3)', 1.5);
    this.drawIsoLine(ctx, [item.x+w, item.y, 0.3], [item.x+w, item.y+h, 0.3], 'rgba(46,204,113,0.3)', 1.5);
    this.drawIsoLine(ctx, [item.x+w, item.y+h, 0.3], [item.x, item.y+h, 0.3], 'rgba(46,204,113,0.3)', 1.5);
    this.drawIsoLine(ctx, [item.x, item.y+h, 0.3], [item.x, item.y, 0.3], 'rgba(46,204,113,0.3)', 1.5);
    // Label
    var lp = this.iso(item.x + w/2, item.y + h/2, 1);
    // Background pill for label
    ctx.fillStyle = 'rgba(46,204,113,0.15)';
    var pillW = 80, pillH = 26;
    ctx.beginPath();
    ctx.roundRect(lp.x - pillW/2, lp.y - 14, pillW, pillH, 6);
    ctx.fill();

    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(46,204,113,0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('🤝 Espace collaboratif', lp.x, lp.y - 2);
    ctx.font = '7px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(46,204,113,0.55)';
    ctx.fillText('Cliquez pour partager', lp.x, lp.y + 8);
  },

  // ===== UTILITIES =====

  hexToRgb(hex) {
    var n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 0xFF, g: (n >> 8) & 0xFF, b: n & 0xFF };
  },

  darken(hex, amt) {
    if (hex.indexOf('rgba') === 0 || hex.indexOf('rgb') === 0) return hex;
    var c = this.hexToRgb(hex);
    return 'rgb(' + Math.max(0, c.r * (1 - amt) | 0) + ',' + Math.max(0, c.g * (1 - amt) | 0) + ',' + Math.max(0, c.b * (1 - amt) | 0) + ')';
  },

  lighten(hex, amt) {
    if (hex.indexOf('rgba') === 0 || hex.indexOf('rgb') === 0) return hex;
    var c = this.hexToRgb(hex);
    return 'rgb(' + Math.min(255, c.r + 255 * amt | 0) + ',' + Math.min(255, c.g + 255 * amt | 0) + ',' + Math.min(255, c.b + 255 * amt | 0) + ')';
  },
};
