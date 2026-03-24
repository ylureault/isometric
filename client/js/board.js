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

    // Legs (dark metal)
    this.drawIsoBox(ctx, x+0.1, y+0.05, 0, 0.1, 0.08, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+w-0.2, y+0.05, 0, 0.1, 0.08, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+0.1, y+d-0.13, 0, 0.1, 0.08, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+w-0.2, y+d-0.13, 0, 0.1, 0.08, legH, '#2a2a2a', '#1a1a1a', '#222', null);

    // Table top
    this.drawIsoBox(ctx, x, y, legH, w, d, topH, def.topColor, this.darken(def.color, 0.1), def.color, 'rgba(0,0,0,0.08)');

    // Wood grain texture lines on desk top
    ctx.save();
    ctx.globalAlpha = 0.06;
    for (var gi = 0; gi < 4; gi++) {
      var gy = y + 0.15 + gi * (d - 0.3) / 4;
      this.drawIsoLine(ctx, [x + 0.1, gy, legH + topH + 0.1], [x + w - 0.1, gy, legH + topH + 0.1], '#000', 0.4);
    }
    ctx.restore();

    // Monitor
    var mz = legH + topH;
    var mx = x + 0.3, my = y + 0.15;
    // Monitor stand base
    this.drawIsoBox(ctx, mx+0.15, my, mz, 0.35, 0.15, 0.5, '#3a3a3a', '#2a2a2a', '#333', null);
    // Monitor stand pole
    this.drawIsoBox(ctx, mx+0.27, my+0.02, mz+0.5, 0.1, 0.08, 4.5, '#444', '#333', '#3a3a3a', null);
    // Monitor bezel
    this.drawIsoPoly(ctx, [[mx,my,mz+5],[mx+0.65,my,mz+5],[mx+0.65,my,mz+12],[mx,my,mz+12]], '#2a2a2a', '#1a1a1a', 0.5);
    // Monitor screen
    this.drawIsoPoly(ctx, [[mx+0.04,my,mz+5.5],[mx+0.61,my,mz+5.5],[mx+0.61,my,mz+11.5],[mx+0.04,my,mz+11.5]], '#4488cc', '#336699', 0.3);
    // Screen reflection highlight
    ctx.save();
    ctx.globalAlpha = 0.12;
    var sp1 = this.iso(mx+0.06, my, mz+9);
    var sp2 = this.iso(mx+0.25, my, mz+11);
    ctx.beginPath();
    ctx.moveTo(sp1.x, sp1.y);
    ctx.lineTo(sp2.x, sp2.y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Keyboard
    this.drawIsoBox(ctx, x+0.3, y+0.5, mz, 0.6, 0.25, 0.3, '#e0e0e0', '#ccc', '#d5d5d5', 'rgba(0,0,0,0.06)');
    // Keyboard key lines
    ctx.save();
    ctx.globalAlpha = 0.05;
    for (var ki = 0; ki < 3; ki++) {
      this.drawIsoLine(ctx, [x+0.35, y+0.53+ki*0.07, mz+0.35], [x+0.85, y+0.53+ki*0.07, mz+0.35], '#000', 0.3);
    }
    ctx.restore();

    // Mouse
    this.drawIsoBox(ctx, x+0.75, y+0.58, mz, 0.12, 0.08, 0.3, '#e8e8e8', '#d0d0d0', '#ddd', null);
  },

  drawChair(ctx, item, def) {
    var x = item.x + 0.25, y = item.y + 0.25;
    var seatH = 7;

    // Wheel detail — 5 small casters
    var cx = x + 0.25, cy = y + 0.25;
    for (var wi = 0; wi < 5; wi++) {
      var wa = wi * Math.PI * 2 / 5;
      var wx = cx + Math.cos(wa) * 0.18;
      var wy = cy + Math.sin(wa) * 0.18;
      var wp = this.iso(wx, wy, 0);
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#333';
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
    // Base star
    this.drawIsoBox(ctx, x+0.05, y+0.05, 0.3, 0.4, 0.4, 0.6, '#444', '#333', '#3a3a3a', null);
    // Pole (chrome)
    this.drawIsoBox(ctx, x+0.17, y+0.17, 0.9, 0.12, 0.12, seatH - 2, '#666', '#555', '#5a5a5a', null);
    // Pole highlight
    ctx.save();
    ctx.globalAlpha = 0.15;
    var pp1 = this.iso(x+0.29, y+0.17, 1.5);
    var pp2 = this.iso(x+0.29, y+0.17, seatH - 1.5);
    ctx.beginPath();
    ctx.moveTo(pp1.x, pp1.y);
    ctx.lineTo(pp2.x, pp2.y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    // Seat with cushion shading
    this.drawIsoBox(ctx, x-0.02, y-0.02, seatH, 0.55, 0.55, 1.2, '#5a6d7a', '#4a5d6a', '#506370', null);
    // Cushion highlight
    ctx.save();
    ctx.globalAlpha = 0.08;
    this.drawIsoPoly(ctx, [[x+0.05,y+0.05,seatH+1.25],[x+0.35,y+0.05,seatH+1.25],[x+0.35,y+0.35,seatH+1.25],[x+0.05,y+0.35,seatH+1.25]], '#fff', null, 0);
    ctx.restore();
    // Backrest with curve suggestion
    this.drawIsoBox(ctx, x, y-0.02, seatH + 1.2, 0.5, 0.06, 8, '#5a6d7a', '#4a5d6a', '#506370', null);
    // Backrest padding highlight
    ctx.save();
    ctx.globalAlpha = 0.06;
    this.drawIsoPoly(ctx, [[x+0.08,y-0.02,seatH+3],[x+0.42,y-0.02,seatH+3],[x+0.42,y-0.02,seatH+8],[x+0.08,y-0.02,seatH+8]], '#fff', null, 0);
    ctx.restore();
    // Armrests
    this.drawIsoBox(ctx, x, y+0.05, seatH + 3, 0.06, 0.35, 0.5, '#4a5d6a', '#3a4d5a', '#455560', null);
    this.drawIsoBox(ctx, x+0.44, y+0.05, seatH + 3, 0.06, 0.35, 0.5, '#4a5d6a', '#3a4d5a', '#455560', null);
    // Armrest pads
    this.drawIsoBox(ctx, x-0.01, y+0.05, seatH + 3.5, 0.08, 0.35, 0.3, '#606d7a', '#506070', '#586878', null);
    this.drawIsoBox(ctx, x+0.43, y+0.05, seatH + 3.5, 0.08, 0.35, 0.3, '#606d7a', '#506070', '#586878', null);
  },

  drawCouch(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var h = def.drawHeight;

    // Small feet
    this.drawIsoBox(ctx, x+0.1, y+0.1, 0, 0.1, 0.1, 1, '#888', '#777', '#808080', null);
    this.drawIsoBox(ctx, x+w-0.2, y+0.1, 0, 0.1, 0.1, 1, '#888', '#777', '#808080', null);
    this.drawIsoBox(ctx, x+0.1, y+d-0.2, 0, 0.1, 0.1, 1, '#888', '#777', '#808080', null);
    this.drawIsoBox(ctx, x+w-0.2, y+d-0.2, 0, 0.1, 0.1, 1, '#888', '#777', '#808080', null);

    // Couch base
    this.drawIsoBox(ctx, x+0.15, y+0.15, 1, w-0.3, d-0.3, h * 0.55, def.topColor, this.darken(def.color, 0.15), def.color, 'rgba(0,0,0,0.05)');
    // Backrest with curved top appearance
    this.drawIsoBox(ctx, x+0.15, y, 1 + h * 0.55, w-0.3, 0.22, h * 0.5, this.darken(def.color, 0.03), this.darken(def.color, 0.18), this.darken(def.color, 0.08), null);
    // Backrest top roll
    this.drawIsoBox(ctx, x+0.18, y, 1 + h * 0.55 + h * 0.5, w-0.36, 0.18, 1, this.lighten(def.color, 0.05), this.darken(def.color, 0.1), def.color, null);

    // Cushion divider lines (stitching detail)
    var numCushions = Math.max(2, Math.floor(w));
    for (var ci = 1; ci < numCushions; ci++) {
      var cx = x + 0.15 + ci * (w - 0.3) / numCushions;
      this.drawIsoLine(ctx, [cx, y + 0.15, 1 + h*0.55 + 0.3], [cx, y + d - 0.15, 1 + h*0.55 + 0.3], 'rgba(0,0,0,0.08)', 0.6);
    }
    // Cushion top stitching
    for (var si = 0; si < numCushions; si++) {
      var sx1 = x + 0.15 + si * (w - 0.3) / numCushions + (w - 0.3) / numCushions * 0.5;
      this.drawIsoLine(ctx, [sx1, y + 0.2, 1 + h*0.55 + 0.4], [sx1, y + d - 0.2, 1 + h*0.55 + 0.4], 'rgba(0,0,0,0.04)', 0.3);
    }

    // Armrests — rounded shape
    this.drawIsoBox(ctx, x, y+0.1, 1 + h*0.4, 0.22, d-0.2, h*0.35, this.darken(def.color, 0.06), this.darken(def.color, 0.18), this.darken(def.color, 0.1), null);
    this.drawIsoBox(ctx, x+w-0.22, y+0.1, 1 + h*0.4, 0.22, d-0.2, h*0.35, this.darken(def.color, 0.06), this.darken(def.color, 0.18), this.darken(def.color, 0.1), null);
    // Armrest top rolls
    this.drawIsoBox(ctx, x+0.02, y+0.12, 1 + h*0.4 + h*0.35, 0.18, d-0.24, 0.8, this.lighten(def.color, 0.03), this.darken(def.color, 0.08), this.darken(def.color, 0.02), null);
    this.drawIsoBox(ctx, x+w-0.2, y+0.12, 1 + h*0.4 + h*0.35, 0.18, d-0.24, 0.8, this.lighten(def.color, 0.03), this.darken(def.color, 0.08), this.darken(def.color, 0.02), null);

    // Subtle cushion highlights
    ctx.save();
    ctx.globalAlpha = 0.05;
    for (var hi = 0; hi < numCushions; hi++) {
      var hx = x + 0.2 + hi * (w - 0.3) / numCushions;
      var hw = (w - 0.3) / numCushions - 0.1;
      this.drawIsoPoly(ctx, [[hx,y+0.2,1+h*0.56],[hx+hw,y+0.2,1+h*0.56],[hx+hw,y+d*0.5,1+h*0.56],[hx,y+d*0.5,1+h*0.56]], '#fff', null, 0);
    }
    ctx.restore();
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

    // Chairs around the table (context)
    var numChairs = Math.min(4, Math.max(2, Math.floor(w)));
    for (var ci = 0; ci < numChairs; ci++) {
      var chairAngle = ci * Math.PI * 2 / numChairs + Math.PI / 4;
      var chairDist = w * 0.55;
      var chairX = cx + Math.cos(chairAngle) * chairDist - 0.25;
      var chairY = cy + Math.sin(chairAngle) * chairDist - 0.25;
      // Simple chair silhouette
      this.drawIsoBox(ctx, chairX+0.05, chairY+0.05, 0, 0.4, 0.4, 0.5, '#555', '#444', '#4a4a4a', null);
      this.drawIsoBox(ctx, chairX+0.12, chairY+0.12, 0.5, 0.15, 0.15, 5.5, '#666', '#555', '#5a5a5a', null);
      this.drawIsoBox(ctx, chairX, chairY, 6, 0.5, 0.5, 0.8, '#5a6d7a', '#4a5d6a', '#506370', null);
      // Mini backrest facing table center
      var backAngle = chairAngle + Math.PI;
      var backX = chairX + 0.25 + Math.cos(backAngle) * 0.22;
      var backY = chairY + 0.25 + Math.sin(backAngle) * 0.22;
      this.drawIsoBox(ctx, backX - 0.2, backY - 0.03, 6.8, 0.4, 0.06, 5, '#5a6d7a', '#4a5d6a', '#506370', null);
    }

    // Base foot
    var baseP = this.iso(cx, cy, 0);
    ctx.beginPath();
    ctx.ellipse(baseP.x, baseP.y, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#bbb';
    ctx.fill();
    // Center pole
    this.drawIsoBox(ctx, cx-0.08, cy-0.08, 0.5, 0.16, 0.16, legH - 0.5, '#c8c8c8', '#b8b8b8', '#c0c0c0', null);
    // Pole highlight
    ctx.save();
    ctx.globalAlpha = 0.12;
    var pp1 = this.iso(cx+0.08, cy-0.08, 1);
    var pp2 = this.iso(cx+0.08, cy-0.08, legH - 1);
    ctx.beginPath();
    ctx.moveTo(pp1.x, pp1.y);
    ctx.lineTo(pp2.x, pp2.y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    // Table top (12-gon for smoother circle)
    var r = w * 0.45;
    var pts = [];
    for (var a = 0; a < 12; a++) {
      var angle = a * Math.PI * 2 / 12;
      pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, legH + 1]);
    }
    this.drawIsoPoly(ctx, pts, def.topColor, 'rgba(0,0,0,0.08)', 0.5);
    // Table edge shadow
    var edgePts = [];
    for (var a2 = 0; a2 < 12; a2++) {
      var angle2 = a2 * Math.PI * 2 / 12;
      edgePts.push([cx + Math.cos(angle2) * r, cy + Math.sin(angle2) * r, legH + 0.5]);
    }
    ctx.save();
    ctx.globalAlpha = 0.04;
    this.drawIsoPoly(ctx, edgePts, '#000', null, 0);
    ctx.restore();
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
      // Shelf depth shadow
      ctx.save();
      ctx.globalAlpha = 0.04;
      this.drawIsoPoly(ctx, [[x+0.05,y,sz+0.3],[x+w-0.05,y,sz+0.3],[x+w-0.05,y+d*0.3,sz+0.3],[x+0.05,y+d*0.3,sz+0.3]], '#000', null, 0);
      ctx.restore();
    }

    // Books on shelves — varied sizes, some horizontal, with labels
    var bookColors = ['#c0392b','#2980b9','#8e6e47','#e67e22','#27ae60','#8e44ad','#2c3e50','#d4a04a'];
    var bi = 0;
    // Use deterministic seed based on position
    var seed = (item.x * 7 + item.y * 13) | 0;
    for (var row = 0; row < shelves; row++) {
      var bz = (row + 1) * h / (shelves + 1) + 0.5;
      var shelfH = h / (shelves + 1) - 2;
      var bx = x + 0.08;
      var placedHorizontal = false;
      while (bx < x + w - 0.2) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        var rand = (seed % 1000) / 1000;
        var bw = 0.1 + rand * 0.15;
        var bh = shelfH * (0.65 + rand * 0.35);

        // Occasionally place a horizontal book stack
        if (!placedHorizontal && rand > 0.75 && bx > x + w * 0.4) {
          // Horizontal books
          for (var hb = 0; hb < 2; hb++) {
            var hbc = bookColors[(bi + hb) % bookColors.length];
            this.drawIsoBox(ctx, bx, y, bz + hb * 1.2, 0.3, d * 0.65, 1, hbc, this.darken(hbc, 0.15), this.darken(hbc, 0.05), null);
          }
          bx += 0.34;
          bi += 2;
          placedHorizontal = true;
          continue;
        }

        var bc = bookColors[bi % bookColors.length];
        // Book body
        this.drawIsoBox(ctx, bx, y + d * 0.05, bz, bw, d * 0.7, bh, bc, this.darken(bc, 0.2), this.darken(bc, 0.1), null);
        // Spine label — subtle lighter stripe
        if (rand > 0.3) {
          ctx.save();
          ctx.globalAlpha = 0.2;
          this.drawIsoPoly(ctx, [
            [bx + bw * 0.25, y + d * 0.05, bz + bh * 0.3],
            [bx + bw * 0.75, y + d * 0.05, bz + bh * 0.3],
            [bx + bw * 0.75, y + d * 0.05, bz + bh * 0.5],
            [bx + bw * 0.25, y + d * 0.05, bz + bh * 0.5]
          ], '#fff', null, 0);
          ctx.restore();
        }
        bx += bw + 0.02;
        bi++;
      }
    }
  },

  drawPartition(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var h = def.drawHeight;

    // Floor mounting plates
    this.drawIsoBox(ctx, x-0.02, y-0.02, 0, 0.12, 0.12, 0.3, '#888', '#777', '#808080', null);
    this.drawIsoBox(ctx, x-0.02, y+d-0.06, 0, 0.12, 0.12, 0.3, '#888', '#777', '#808080', null);

    // Frame posts (brushed aluminum)
    this.drawIsoBox(ctx, x, y, 0.3, 0.08, 0.08, h - 0.3, '#b0c0c8', '#9aaab0', '#a5b5bd', null);
    this.drawIsoBox(ctx, x, y+d-0.04, 0.3, 0.08, 0.08, h - 0.3, '#b0c0c8', '#9aaab0', '#a5b5bd', null);
    // Post highlights
    ctx.save();
    ctx.globalAlpha = 0.1;
    this.drawIsoLine(ctx, [x+0.08, y, 1], [x+0.08, y, h-1], '#fff', 0.6);
    this.drawIsoLine(ctx, [x+0.08, y+d-0.04, 1], [x+0.08, y+d-0.04, h-1], '#fff', 0.6);
    ctx.restore();

    // Glass panel (frosted semi-transparent)
    ctx.save();
    ctx.globalAlpha = 0.18;
    this.drawIsoPoly(ctx, [[x,y+0.08,1.5],[x,y+d-0.04,1.5],[x,y+d-0.04,h-1],[x,y+0.08,h-1]], '#b8e0ec', '#98c8d8', 0.8);
    ctx.restore();

    // Frame lines
    this.drawIsoLine(ctx, [x,y,0.3], [x,y,h], '#a8c0c8', 1.5);
    this.drawIsoLine(ctx, [x,y+d,0.3], [x,y+d,h], '#a8c0c8', 1.5);
    this.drawIsoLine(ctx, [x,y,h], [x,y+d,h], '#a8c0c8', 1);
    this.drawIsoLine(ctx, [x,y,1.5], [x,y+d,1.5], '#a8c0c8', 0.8);
    this.drawIsoLine(ctx, [x,y,h*0.5], [x,y+d,h*0.5], '#b0c8d0', 0.3);

    // Main reflection highlight (diagonal streak)
    ctx.save();
    ctx.globalAlpha = 0.07;
    this.drawIsoPoly(ctx, [[x,y+0.2,3],[x,y+d*0.5,3],[x,y+d*0.4,h-2],[x,y+0.1,h-2]], '#fff', null, 0);
    ctx.restore();
    // Secondary small highlight
    ctx.save();
    ctx.globalAlpha = 0.04;
    this.drawIsoPoly(ctx, [[x,y+d*0.6,4],[x,y+d*0.8,4],[x,y+d*0.75,h*0.6],[x,y+d*0.55,h*0.6]], '#fff', null, 0);
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

        // Wood grain lines on stage tiles
        ctx.save();
        ctx.globalAlpha = 0.06;
        for (var gi = 0; gi < 3; gi++) {
          var gy = ty + 0.2 + gi * 0.25;
          this.drawIsoLine(ctx, [tx + 0.05, gy, h + 0.1], [tx + 0.95, gy, h + 0.1], '#5a3a1a', 0.3);
        }
        ctx.restore();

        // Front edge with step highlight
        if (dy === def.height - 1) {
          this.drawIsoPoly(ctx, [[tx,ty+1,h],[tx+1,ty+1,h],[tx+1,ty+1,0],[tx,ty+1,0]], '#8A6848', 'rgba(0,0,0,0.06)', 0.3);
          // Step lip highlight
          ctx.save();
          ctx.globalAlpha = 0.1;
          this.drawIsoPoly(ctx, [[tx,ty+1,h],[tx+1,ty+1,h],[tx+1,ty+1,h-1],[tx,ty+1,h-1]], '#fff', null, 0);
          ctx.restore();
          // Front edge grain
          ctx.save();
          ctx.globalAlpha = 0.05;
          for (var fgi = 0; fgi < 2; fgi++) {
            this.drawIsoLine(ctx, [tx+0.1, ty+1, h*0.3+fgi*h*0.3], [tx+0.9, ty+1, h*0.3+fgi*h*0.3], '#3a2a1a', 0.3);
          }
          ctx.restore();
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

    // Shadow — soft radial
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 3, 10, 5, 0, 0, Math.PI * 2);
    var shGrad = ctx.createRadialGradient(pos.x, pos.y + 3, 0, pos.x, pos.y + 3, 10);
    shGrad.addColorStop(0, 'rgba(0,0,0,0.1)');
    shGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shGrad;
    ctx.fill();
    ctx.restore();

    // White pot body — tapered
    this.drawIsoBox(ctx, x-0.18, y-0.18, 0, 0.36, 0.36, 2, '#e8e8e8', '#d5d5d5', '#ddd', 'rgba(0,0,0,0.05)');
    this.drawIsoBox(ctx, x-0.2, y-0.2, 2, 0.4, 0.4, 3, '#f0f0f0', '#ddd', '#e5e5e5', 'rgba(0,0,0,0.05)');

    // Decorative pot rim with lip
    this.drawIsoBox(ctx, x-0.24, y-0.24, 5, 0.48, 0.48, 0.5, '#f8f8f8', '#eee', '#f2f2f2', null);
    this.drawIsoBox(ctx, x-0.23, y-0.23, 5.5, 0.46, 0.46, 0.4, '#f5f5f5', '#e8e8e8', '#eee', null);
    // Pot rim accent line
    ctx.save();
    ctx.globalAlpha = 0.08;
    this.drawIsoPoly(ctx, [[x-0.24,y-0.24,5.2],[x+0.24,y-0.24,5.2],[x+0.24,y+0.24,5.2],[x-0.24,y+0.24,5.2]], '#000', null, 0);
    ctx.restore();

    // Soil with texture
    this.drawIsoPoly(ctx, [[x-0.18,y-0.18,5.9],[x+0.18,y-0.18,5.9],[x+0.18,y+0.18,5.9],[x-0.18,y+0.18,5.9]], '#5a3a20', null, 0);
    // Soil specks
    var sp = this.iso(x-0.05, y+0.05, 6);
    ctx.fillStyle = '#6a4a2a';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 1, 0, Math.PI * 2); ctx.fill();
    sp = this.iso(x+0.08, y-0.03, 6);
    ctx.fillStyle = '#4a2a10';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 0.8, 0, Math.PI * 2); ctx.fill();

    if (def.isPalm) {
      // Trunk with bark texture
      this.drawIsoBox(ctx, x-0.06, y-0.06, 5.9, 0.12, 0.12, 18, '#8B7355', '#7a6345', '#806950', null);
      // Bark ring marks
      ctx.save();
      ctx.globalAlpha = 0.12;
      for (var bi = 0; bi < 5; bi++) {
        var bz = 7 + bi * 3.2;
        this.drawIsoLine(ctx, [x-0.06, y-0.06, bz], [x+0.06, y-0.06, bz], '#5a4030', 0.4);
      }
      ctx.restore();

      // Palm fronds with leaf detail
      var frondColors = ['#2D8A27', '#349A2E', '#3FA83A', '#2D7A27', '#45B545'];
      for (var a = 0; a < 7; a++) {
        var angle = a * Math.PI * 2 / 7;
        var fpos = this.iso(x, y, 24);
        var endX = fpos.x + Math.cos(angle) * 22;
        var endY = fpos.y + Math.sin(angle) * 12 - 5;
        var midX = fpos.x + Math.cos(angle) * 12;
        var midY = fpos.y + Math.sin(angle) * 6 - 10;
        // Main frond stroke
        ctx.beginPath();
        ctx.moveTo(fpos.x, fpos.y);
        ctx.quadraticCurveTo(midX, midY, endX, endY);
        ctx.strokeStyle = frondColors[a % frondColors.length];
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // Leaf sub-fronds
        ctx.lineWidth = 0.8;
        for (var lf = 0.3; lf < 1; lf += 0.2) {
          var px = fpos.x + (midX - fpos.x) * lf + (endX - midX) * Math.max(0, lf - 0.5);
          var py = fpos.y + (midY - fpos.y) * lf + (endY - midY) * Math.max(0, lf - 0.5);
          var perp = angle + Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(perp) * 4, py + Math.sin(perp) * 2);
          ctx.strokeStyle = frondColors[(a + 1) % frondColors.length];
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - Math.cos(perp) * 4, py - Math.sin(perp) * 2);
          ctx.stroke();
        }
      }
    } else {
      // Bush foliage — multiple leaf clusters with color variation
      var foliageZ = 8;
      var fp = this.iso(x, y, foliageZ);

      // Large background leaves
      var leafColors = ['#2D7A27', '#348A30', '#3A9A35', '#45AA40', '#2E8028'];
      ctx.fillStyle = leafColors[0];
      ctx.beginPath(); ctx.arc(fp.x, fp.y - 6, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = leafColors[1];
      ctx.beginPath(); ctx.arc(fp.x - 5, fp.y - 2, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = leafColors[2];
      ctx.beginPath(); ctx.arc(fp.x + 5, fp.y - 2, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = leafColors[3];
      ctx.beginPath(); ctx.arc(fp.x + 2, fp.y - 10, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = leafColors[4];
      ctx.beginPath(); ctx.arc(fp.x - 3, fp.y - 8, 4, 0, Math.PI * 2); ctx.fill();

      // Individual leaf shapes
      ctx.save();
      for (var li = 0; li < 6; li++) {
        var la = li * Math.PI * 2 / 6 + 0.3;
        var lr = 8 + (li % 2) * 3;
        var lx = fp.x + Math.cos(la) * lr * 0.6;
        var ly = fp.y - 5 + Math.sin(la) * lr * 0.3;
        ctx.fillStyle = leafColors[li % leafColors.length];
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 3.5, 1.8, la * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Top highlight
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.arc(fp.x - 1, fp.y - 9, 4, 0, Math.PI * 2); ctx.fill();
    }
  },

  drawScreen(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var cx = x + w / 2, cy = y + d / 2;

    // Stand base plate
    this.drawIsoBox(ctx, cx-0.2, cy-0.15, 0, 0.4, 0.3, 0.5, '#444', '#333', '#3a3a3a', null);
    // Stand pole
    this.drawIsoBox(ctx, cx-0.05, cy-0.05, 0.5, 0.1, 0.1, def.drawHeight - 5.5, '#555', '#444', '#4a4a4a', null);
    // Pole highlight
    ctx.save();
    ctx.globalAlpha = 0.12;
    var sp1 = this.iso(cx+0.05, cy-0.05, 2);
    var sp2 = this.iso(cx+0.05, cy-0.05, def.drawHeight - 6);
    ctx.beginPath();
    ctx.moveTo(sp1.x, sp1.y);
    ctx.lineTo(sp2.x, sp2.y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    // Screen bezel
    this.drawIsoPoly(ctx, [
      [cx-0.7, cy, def.drawHeight-5],
      [cx+0.7, cy, def.drawHeight-5],
      [cx+0.7, cy, def.drawHeight+8],
      [cx-0.7, cy, def.drawHeight+8]
    ], '#1a1a1a', '#111', 0.5);

    // Screen content
    this.drawIsoPoly(ctx, [
      [cx-0.62, cy, def.drawHeight-4],
      [cx+0.62, cy, def.drawHeight-4],
      [cx+0.62, cy, def.drawHeight+7],
      [cx-0.62, cy, def.drawHeight+7]
    ], '#4488cc', '#336699', 0.3);

    // Screen glow effect
    ctx.save();
    var glowP = this.iso(cx, cy, def.drawHeight + 1.5);
    ctx.beginPath();
    ctx.ellipse(glowP.x, glowP.y, 18, 10, 0, 0, Math.PI * 2);
    var glowGrad = ctx.createRadialGradient(glowP.x, glowP.y, 0, glowP.x, glowP.y, 18);
    glowGrad.addColorStop(0, 'rgba(68,136,204,0.06)');
    glowGrad.addColorStop(1, 'rgba(68,136,204,0)');
    ctx.fillStyle = glowGrad;
    ctx.fill();
    ctx.restore();

    // Screen reflection highlight
    ctx.save();
    ctx.globalAlpha = 0.1;
    var rp1 = this.iso(cx-0.5, cy, def.drawHeight+5);
    var rp2 = this.iso(cx-0.2, cy, def.drawHeight+6.5);
    ctx.beginPath();
    ctx.moveTo(rp1.x, rp1.y);
    ctx.lineTo(rp2.x, rp2.y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Status LED
    var ledP = this.iso(cx + 0.5, cy, def.drawHeight - 4.5);
    ctx.beginPath();
    ctx.arc(ledP.x, ledP.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#2ecc71';
    ctx.fill();
    // LED glow
    ctx.beginPath();
    ctx.arc(ledP.x, ledP.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(46,204,113,0.15)';
    ctx.fill();
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
    // Base platform
    this.drawIsoBox(ctx, x+0.05, y+0.05, 0, 0.9, 0.9, 1.5, this.darken(def.color, 0.12), this.darken(def.color, 0.2), this.darken(def.color, 0.15), null);
    // Main body with taper
    this.drawIsoBox(ctx, x+0.12, y+0.12, 1.5, 0.76, 0.76, 12.5, def.topColor, this.darken(def.color, 0.1), def.color, 'rgba(0,0,0,0.06)');
    // Top surface — reading ledge
    this.drawIsoBox(ctx, x+0.05, y+0.05, 14, 0.9, 0.9, 2, this.lighten(def.color, 0.05), this.darken(def.color, 0.08), def.color, 'rgba(0,0,0,0.05)');
    // Front panel (darker with inset)
    this.drawIsoPoly(ctx, [[x+0.15,y+0.88,14],[x+0.85,y+0.88,14],[x+0.85,y+0.88,4],[x+0.15,y+0.88,4]], this.darken(def.color, 0.2), 'rgba(0,0,0,0.06)', 0.3);
    // Front panel emblem/logo area
    ctx.save();
    ctx.globalAlpha = 0.08;
    this.drawIsoPoly(ctx, [[x+0.3,y+0.88,11],[x+0.7,y+0.88,11],[x+0.7,y+0.88,7],[x+0.3,y+0.88,7]], '#fff', null, 0);
    ctx.restore();
    // Top edge highlight
    ctx.save();
    ctx.globalAlpha = 0.1;
    this.drawIsoPoly(ctx, [[x+0.05,y+0.05,16],[x+0.95,y+0.05,16],[x+0.95,y+0.15,16],[x+0.05,y+0.15,16]], '#fff', null, 0);
    ctx.restore();
    // Microphone stub
    this.drawIsoBox(ctx, x+0.4, y+0.15, 16, 0.04, 0.04, 4, '#333', '#222', '#2a2a2a', null);
    var micP = this.iso(x+0.42, y+0.17, 20.5);
    ctx.beginPath();
    ctx.arc(micP.x, micP.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#444';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  },

  drawProjector(ctx, item, def) {
    var x = item.x + 0.5, y = item.y + 0.5;
    // Tripod legs with foot pads
    var base = this.iso(x, y, 0);
    var topP = this.iso(x, y, 18);
    for (var a = 0; a < 3; a++) {
      var angle = a * Math.PI * 2 / 3 - Math.PI / 2;
      var lx = base.x + Math.cos(angle) * 7;
      var ly = base.y + Math.sin(angle) * 3.5;
      // Leg
      ctx.beginPath();
      ctx.moveTo(topP.x, topP.y);
      ctx.lineTo(lx, ly);
      ctx.strokeStyle = '#777';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Foot pad
      ctx.beginPath();
      ctx.arc(lx, ly, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#555';
      ctx.fill();
    }
    // Center column highlight
    ctx.beginPath();
    ctx.moveTo(topP.x + 0.5, topP.y);
    ctx.lineTo(base.x + 0.5, base.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Projector body — more detailed
    this.drawIsoBox(ctx, x-0.18, y-0.18, 17.5, 0.36, 0.36, 5, '#4a4a4a', '#3a3a3a', '#444', null);
    // Body detail lines
    ctx.save();
    ctx.globalAlpha = 0.08;
    this.drawIsoLine(ctx, [x-0.18, y-0.18, 19], [x+0.18, y-0.18, 19], '#fff', 0.3);
    this.drawIsoLine(ctx, [x-0.18, y-0.18, 20], [x+0.18, y-0.18, 20], '#fff', 0.3);
    ctx.restore();
    // Vent slots on side
    ctx.save();
    ctx.globalAlpha = 0.1;
    for (var vi = 0; vi < 3; vi++) {
      this.drawIsoLine(ctx, [x+0.18, y-0.1+vi*0.08, 18.5], [x+0.18, y-0.1+vi*0.08, 21.5], '#000', 0.3);
    }
    ctx.restore();

    // Lens with glow
    var lpos = this.iso(x, y, 22.5);
    // Lens glow ring
    ctx.beginPath();
    ctx.arc(lpos.x, lpos.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(136,170,255,0.12)';
    ctx.fill();
    // Lens outer
    ctx.beginPath();
    ctx.arc(lpos.x, lpos.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#555';
    ctx.fill();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Lens inner (glass)
    ctx.beginPath();
    ctx.arc(lpos.x, lpos.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#88aaff';
    ctx.fill();
    // Lens highlight
    ctx.beginPath();
    ctx.arc(lpos.x - 0.8, lpos.y - 0.8, 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    // Power LED
    var ledP = this.iso(x - 0.1, y + 0.18, 22);
    ctx.beginPath();
    ctx.arc(ledP.x, ledP.y, 1, 0, Math.PI * 2);
    ctx.fillStyle = '#2ecc71';
    ctx.fill();
  },

  drawWaterCooler(ctx, item, def) {
    var x = item.x + 0.5, y = item.y + 0.5;
    // Base platform
    this.drawIsoBox(ctx, x-0.28, y-0.28, 0, 0.56, 0.56, 0.8, '#bbb', '#aaa', '#b5b5b5', null);
    // Base cabinet
    this.drawIsoBox(ctx, x-0.25, y-0.25, 0.8, 0.5, 0.5, 9.2, '#e0e0e0', '#ccc', '#d5d5d5', 'rgba(0,0,0,0.06)');
    // Drip tray
    this.drawIsoBox(ctx, x-0.18, y+0.2, 5, 0.36, 0.12, 0.3, '#999', '#888', '#909090', null);
    // Spigots (hot/cold)
    var sp1 = this.iso(x-0.08, y+0.26, 7);
    var sp2 = this.iso(x+0.08, y+0.26, 7);
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath(); ctx.arc(sp1.x, sp1.y, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3498db';
    ctx.beginPath(); ctx.arc(sp2.x, sp2.y, 1.5, 0, Math.PI * 2); ctx.fill();

    // Water bottle neck collar
    this.drawIsoBox(ctx, x-0.12, y-0.12, 10, 0.24, 0.24, 1.5, '#e8e8e8', '#d8d8d8', '#e0e0e0', null);
    // Water tank (blue tinted, translucent look)
    this.drawIsoBox(ctx, x-0.18, y-0.18, 11.5, 0.36, 0.36, 7, 'rgba(173,216,230,0.7)', 'rgba(135,206,235,0.5)', 'rgba(150,210,240,0.6)', 'rgba(0,0,0,0.06)');
    // Water level line
    ctx.save();
    ctx.globalAlpha = 0.15;
    this.drawIsoPoly(ctx, [[x-0.17,y-0.17,14],[x+0.17,y-0.17,14],[x+0.17,y+0.17,14],[x-0.17,y+0.17,14]], '#4aa3df', null, 0);
    ctx.restore();
    // Bottle highlight reflection
    ctx.save();
    ctx.globalAlpha = 0.15;
    var rp = this.iso(x+0.18, y-0.1, 14);
    ctx.beginPath();
    ctx.moveTo(rp.x, rp.y);
    rp = this.iso(x+0.18, y-0.1, 17);
    ctx.lineTo(rp.x, rp.y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    // Cap
    this.drawIsoBox(ctx, x-0.12, y-0.12, 18.5, 0.24, 0.24, 0.8, '#ddd', '#ccc', '#d5d5d5', null);
    // Water bubbles (subtle)
    var bub = this.iso(x+0.05, y, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.arc(bub.x, bub.y, 1, 0, Math.PI * 2); ctx.fill();
    bub = this.iso(x-0.04, y+0.03, 15);
    ctx.beginPath(); ctx.arc(bub.x, bub.y, 0.7, 0, Math.PI * 2); ctx.fill();
  },

  drawLamp(ctx, item, def) {
    var x = item.x + 0.5, y = item.y + 0.5;
    // Weighted base disc
    var baseP = this.iso(x, y, 0);
    ctx.beginPath();
    ctx.ellipse(baseP.x, baseP.y, 6, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#999';
    ctx.fill();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    this.drawIsoBox(ctx, x-0.18, y-0.18, 0, 0.36, 0.36, 1, '#aaa', '#999', '#a0a0a0', null);
    // Base highlight
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    ctx.ellipse(baseP.x, baseP.y - 2, 3, 1.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();

    // Pole (chrome look)
    this.drawIsoBox(ctx, x-0.035, y-0.035, 1, 0.07, 0.07, 23, '#c0c0c0', '#aaa', '#b5b5b5', null);
    // Pole reflection
    ctx.save();
    ctx.globalAlpha = 0.15;
    var pp1 = this.iso(x+0.035, y-0.035, 2);
    var pp2 = this.iso(x+0.035, y-0.035, 23);
    ctx.beginPath();
    ctx.moveTo(pp1.x, pp1.y);
    ctx.lineTo(pp2.x, pp2.y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    // Lamp shade — layered for depth
    var top = this.iso(x, y, 25);
    // Shade outer (darker)
    ctx.beginPath();
    ctx.ellipse(top.x, top.y, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#e8d8b8';
    ctx.fill();
    ctx.strokeStyle = '#c8b898';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Shade inner (brighter — lit)
    ctx.beginPath();
    ctx.ellipse(top.x, top.y + 1, 7, 3.5, 0, 0, Math.PI);
    ctx.fillStyle = '#f5e8d0';
    ctx.fill();
    // Shade texture ribs
    ctx.save();
    ctx.globalAlpha = 0.06;
    for (var ri = -3; ri <= 3; ri++) {
      ctx.beginPath();
      ctx.moveTo(top.x + ri * 2, top.y - 4);
      ctx.lineTo(top.x + ri * 2.5, top.y + 4);
      ctx.strokeStyle = '#8a7a5a';
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
    ctx.restore();

    // Light glow — warm radial gradient
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(top.x, top.y + 6, 18, 10, 0, 0, Math.PI * 2);
    var glowGrad = ctx.createRadialGradient(top.x, top.y + 4, 0, top.x, top.y + 6, 18);
    glowGrad.addColorStop(0, 'rgba(255,240,200,0.12)');
    glowGrad.addColorStop(0.5, 'rgba(255,240,200,0.04)');
    glowGrad.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = glowGrad;
    ctx.fill();
    ctx.restore();

    // Bulb hint
    var bulb = this.iso(x, y, 24.5);
    ctx.beginPath();
    ctx.arc(bulb.x, bulb.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,250,220,0.5)';
    ctx.fill();
  },

  drawStandingDesk(ctx, item, def) {
    var x = item.x, y = item.y;
    var w = def.width, d = def.height;
    var legH = 16;
    // Tall legs with adjustment rings
    this.drawIsoBox(ctx, x+0.1, y+0.05, 0, 0.08, 0.06, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+w-0.18, y+0.05, 0, 0.08, 0.06, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+0.1, y+d-0.11, 0, 0.08, 0.06, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    this.drawIsoBox(ctx, x+w-0.18, y+d-0.11, 0, 0.08, 0.06, legH, '#2a2a2a', '#1a1a1a', '#222', null);
    // Leg adjustment detail
    ctx.save();
    ctx.globalAlpha = 0.15;
    this.drawIsoLine(ctx, [x+0.14, y+0.05, legH*0.5], [x+0.14, y+0.05, legH*0.5+2], '#fff', 0.5);
    this.drawIsoLine(ctx, [x+w-0.14, y+0.05, legH*0.5], [x+w-0.14, y+0.05, legH*0.5+2], '#fff', 0.5);
    ctx.restore();

    // Cross bar between legs
    this.drawIsoBox(ctx, x+0.1, y+d*0.45, legH*0.4, w-0.28, 0.04, 0.04, '#333', '#222', '#2a2a2a', null);

    // Table top
    this.drawIsoBox(ctx, x, y, legH, w, d, 1.5, def.topColor, this.darken(def.color, 0.1), def.color, 'rgba(0,0,0,0.08)');
    // Wood grain on top
    ctx.save();
    ctx.globalAlpha = 0.05;
    for (var gi = 0; gi < 3; gi++) {
      this.drawIsoLine(ctx, [x+0.1, y+0.12+gi*0.1, legH+1.6], [x+w-0.1, y+0.12+gi*0.1, legH+1.6], '#000', 0.3);
    }
    ctx.restore();

    // Monitor stand
    var mx = x + 0.3, my = y + 0.1;
    this.drawIsoBox(ctx, mx+0.2, my, legH+1.5, 0.2, 0.1, 0.5, '#3a3a3a', '#2a2a2a', '#333', null);
    this.drawIsoBox(ctx, mx+0.27, my+0.02, legH+2, 0.08, 0.06, 3, '#444', '#333', '#3a3a3a', null);
    // Monitor bezel
    this.drawIsoPoly(ctx, [[mx,my,legH+5],[mx+0.6,my,legH+5],[mx+0.6,my,legH+12],[mx,my,legH+12]], '#2a2a2a', '#1a1a1a', 0.5);
    // Screen
    this.drawIsoPoly(ctx, [[mx+0.04,my,legH+5.5],[mx+0.56,my,legH+5.5],[mx+0.56,my,legH+11.5],[mx+0.04,my,legH+11.5]], '#4488cc', '#336699', 0.3);
    // Screen highlight
    ctx.save();
    ctx.globalAlpha = 0.1;
    var srp1 = this.iso(mx+0.06, my, legH+9.5);
    var srp2 = this.iso(mx+0.22, my, legH+11);
    ctx.beginPath();
    ctx.moveTo(srp1.x, srp1.y);
    ctx.lineTo(srp2.x, srp2.y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Height control panel
    this.drawIsoBox(ctx, x+w-0.35, y+d-0.08, legH+1.5, 0.15, 0.05, 0.4, '#333', '#222', '#2a2a2a', null);
    var btnP = this.iso(x+w-0.28, y+d-0.06, legH+2);
    ctx.fillStyle = '#4a4a4a';
    ctx.beginPath(); ctx.arc(btnP.x, btnP.y, 1, 0, Math.PI * 2); ctx.fill();
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

    // Connected indicator + label (save/restore to avoid leaking state)
    ctx.save();
    if (item.linkedDoorId) {
      ctx.beginPath();
      ctx.arc(portalPos.x, portalPos.y - 18, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(107,203,119,' + (0.6 + Math.sin(time * 2) * 0.3) + ')';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(portalPos.x, portalPos.y - 18, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,107,107,0.6)';
      ctx.fill();
    }
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.fillStyle = item.linkedDoorId ? 'rgba(107,203,119,0.9)' : 'rgba(200,160,255,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(item.doorLabel || (item.linkedDoorId ? 'Passage' : 'Non relié'), portalPos.x, portalPos.y + 20);
    ctx.restore();
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
    var time = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;

    // Subtle green-tinted overlay
    for (var dy = 0; dy < h; dy++) {
      for (var dx = 0; dx < w; dx++) {
        this.drawIsoPoly(ctx,
          [[item.x+dx, item.y+dy, 0.2],[item.x+dx+1, item.y+dy, 0.2],[item.x+dx+1, item.y+dy+1, 0.2],[item.x+dx, item.y+dy+1, 0.2]],
          'rgba(46,204,113,0.06)', null, 0
        );
      }
    }

    // Animated dashed border
    var dashOffset = (time * 3) % 2;
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.lineDashOffset = -dashOffset * 5;
    var corners = [
      this.iso(item.x, item.y, 0.3),
      this.iso(item.x+w, item.y, 0.3),
      this.iso(item.x+w, item.y+h, 0.3),
      this.iso(item.x, item.y+h, 0.3)
    ];
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(46,204,113,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Pulsing glow at corners
    var pulse = Math.sin(time * 3) * 0.3 + 0.7;
    for (var ci = 0; ci < 4; ci++) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(corners[ci].x, corners[ci].y, 5 * pulse, 0, Math.PI * 2);
      var cGrad = ctx.createRadialGradient(corners[ci].x, corners[ci].y, 0, corners[ci].x, corners[ci].y, 5 * pulse);
      cGrad.addColorStop(0, 'rgba(46,204,113,' + (0.2 * pulse) + ')');
      cGrad.addColorStop(1, 'rgba(46,204,113,0)');
      ctx.fillStyle = cGrad;
      ctx.fill();
      ctx.restore();
    }

    // Label with background pill
    var lp = this.iso(item.x + w/2, item.y + h/2, 1);
    ctx.fillStyle = 'rgba(46,204,113,0.15)';
    var pillW = 80, pillH = 26;
    ctx.beginPath();
    ctx.roundRect(lp.x - pillW/2, lp.y - 14, pillW, pillH, 6);
    ctx.fill();

    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(46,204,113,0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('Espace collaboratif', lp.x, lp.y - 2);
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
