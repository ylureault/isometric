// Engine: main game loop, input handling, camera, rendering orchestration

const Engine = {
  canvas: null,
  ctx: null,
  minimapCanvas: null,
  minimapCtx: null,

  // Player state
  player: {
    x: 10,
    y: 10,
    direction: { dx: 0, dy: 1 },
    walkPhase: 0,
    isWalking: false,
    pseudo: '',
    colors: { ...CONSTANTS.DEFAULT_COLORS },
  },

  // Camera
  camera: {
    x: 0,
    y: 0,
  },

  // Input state
  keys: {},

  // Room config
  roomConfig: {
    name: 'Room',
    environment: 'bureau',
    gridSize: 20,
    isCreator: false,
  },

  // Stars background
  stars: [],

  // Time
  lastTime: 0,

  init() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    this.parseRoomConfig();
    this.resize();
    this.generateStars();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Initialize board
    Board.init(this.roomConfig.gridSize, this.roomConfig.environment);

    // Place player at center of grid
    this.player.x = Math.floor(this.roomConfig.gridSize / 2);
    this.player.y = Math.floor(this.roomConfig.gridSize / 2);

    // Setup avatar configuration
    UI.initAvatarConfig((config) => {
      this.player.pseudo = config.pseudo;
      this.player.colors = config.colors;
      this.start();
    });

    // Update HUD room name
    document.getElementById('hud-room-name').textContent = this.roomConfig.name;
  },

  parseRoomConfig() {
    const params = new URLSearchParams(window.location.search);
    this.roomConfig.name = params.get('name') || 'Room';
    this.roomConfig.environment = params.get('env') || 'bureau';
    this.roomConfig.gridSize = Math.min(
      CONSTANTS.GRID_MAX,
      Math.max(CONSTANTS.GRID_MIN, parseInt(params.get('size')) || CONSTANTS.GRID_DEFAULT)
    );
    this.roomConfig.isCreator = params.get('creator') === 'true';
  },

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  generateStars() {
    this.stars = [];
    for (let i = 0; i < 80; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.5 + 0.2,
        twinkleSpeed: Math.random() * 2 + 1,
      });
    }
  },

  onKeyDown(e) {
    this.keys[e.code] = true;

    // Prevent scrolling with arrow keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  },

  onKeyUp(e) {
    this.keys[e.code] = false;
  },

  start() {
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  },

  loop(timestamp) {
    const dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    this.update(dt);
    this.render(timestamp);

    requestAnimationFrame((t) => this.loop(t));
  },

  update(dt) {
    // Movement input
    let dx = 0;
    let dy = 0;

    if (this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['KeyZ']) dy = -1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) dy = 1;
    if (this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['KeyQ']) dx = -1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) dx = 1;

    const isMoving = dx !== 0 || dy !== 0;

    if (isMoving) {
      // Normalize diagonal movement
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;

      const speed = CONSTANTS.MOVE_SPEED * 60; // Convert to per-second
      const newX = this.player.x + dx * speed * dt;
      const newY = this.player.y + dy * speed * dt;

      // Check collision for X movement
      if (!Board.isSolid(newX, this.player.y) && Board.isInBounds(newX, this.player.y)) {
        this.player.x = newX;
      }
      // Check collision for Y movement
      if (!Board.isSolid(this.player.x, newY) && Board.isInBounds(this.player.x, newY)) {
        this.player.y = newY;
      }

      // Clamp to bounds
      this.player.x = Math.max(0.5, Math.min(Board.gridSize - 0.5, this.player.x));
      this.player.y = Math.max(0.5, Math.min(Board.gridSize - 0.5, this.player.y));

      this.player.direction = { dx, dy };
      this.player.isWalking = true;
      this.player.walkPhase += CONSTANTS.ANIMATION_SPEED * 60 * dt;
    } else {
      this.player.isWalking = false;
    }

    // Camera follows player smoothly
    const targetCamX = this.canvas.width / 2;
    const targetCamY = this.canvas.height / 2;
    const playerScreen = Board.iso(this.player.x, this.player.y);
    this.camera.x += (targetCamX - playerScreen.x - this.camera.x) * 0.1;
    this.camera.y += (targetCamY - playerScreen.y - this.camera.y) * 0.1;

    // Update HUD
    UI.updateHUD(
      this.roomConfig.name,
      this.player.x,
      this.player.y,
      1 // Phase 1: single player
    );
  },

  render(timestamp) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, w, h);

    // Stars background
    this.drawStars(ctx, w, h, timestamp);

    // Board glow effect
    this.drawBoardGlow(ctx, w, h);

    const ox = this.camera.x;
    const oy = this.camera.y;

    // Draw grid
    Board.drawGrid(ctx, ox, oy, this.player.x, this.player.y);

    // Collect all drawable entities for depth sorting
    const entities = [];

    // Furniture
    for (const item of Board.furniture) {
      const def = Environments.furnitureTypes[item.type];
      const sortY = item.x + item.y + (def ? (def.width + def.height) / 2 : 0);
      entities.push({
        type: 'furniture',
        item,
        sortKey: sortY,
      });
    }

    // Player
    entities.push({
      type: 'player',
      sortKey: this.player.x + this.player.y,
    });

    // Sort by depth
    entities.sort((a, b) => a.sortKey - b.sortKey);

    // Render entities
    for (const entity of entities) {
      if (entity.type === 'furniture') {
        Board.drawFurnitureItem(ctx, entity.item, ox, oy);
      } else if (entity.type === 'player') {
        const onStage = Board.isOnStage(
          Math.floor(this.player.x),
          Math.floor(this.player.y)
        );
        Character.draw(ctx, this.player.x, this.player.y, ox, oy, {
          colors: this.player.colors,
          direction: this.player.direction,
          walkPhase: this.player.walkPhase,
          isWalking: this.player.isWalking,
          pseudo: this.player.pseudo,
          isOnStage: onStage,
        });
      }
    }

    // Proximity radius indicator
    this.drawProximityRadius(ctx, ox, oy);

    // Minimap
    Board.drawMinimap(
      this.minimapCtx,
      this.minimapCanvas.width,
      this.minimapCanvas.height,
      this.player.x,
      this.player.y
    );
  },

  drawStars(ctx, w, h, timestamp) {
    for (const star of this.stars) {
      const alpha = star.alpha * (0.5 + 0.5 * Math.sin(timestamp / 1000 * star.twinkleSpeed));
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * h * 0.4, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
      ctx.fill();
    }
  },

  drawBoardGlow(ctx, w, h) {
    const centerScreen = Board.iso(Board.gridSize / 2, Board.gridSize / 2);
    const gx = centerScreen.x + this.camera.x;
    const gy = centerScreen.y + this.camera.y;

    const gradient = ctx.createRadialGradient(gx, gy, 50, gx, gy, 400);
    gradient.addColorStop(0, 'rgba(126, 184, 218, 0.04)');
    gradient.addColorStop(1, 'rgba(126, 184, 218, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  },

  drawProximityRadius(ctx, ox, oy) {
    const pos = Board.iso(this.player.x, this.player.y);
    const sx = pos.x + ox;
    const sy = pos.y + oy;

    // Audio proximity radius (ellipse in isometric)
    const radiusTiles = CONSTANTS.AUDIO_RADIUS;
    const tw = Board.tileWidth * Math.cos(Math.PI / 6);
    const radiusX = radiusTiles * tw * 0.5;
    const radiusY = radiusTiles * Board.tileHeight * 0.5;

    ctx.beginPath();
    ctx.ellipse(sx, sy, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(126, 184, 218, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Filled with very subtle color
    ctx.fillStyle = 'rgba(126, 184, 218, 0.03)';
    ctx.fill();
  },
};

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
  Engine.init();
});
