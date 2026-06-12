// Environment definitions: furniture and decor for each environment type

const Environments = {
  furnitureTypes: {
    desk: {
      name: 'Bureau', width: 2, height: 1, solid: true,
      color: '#C8A96E', topColor: '#DFC088', drawHeight: 12,
    },
    chair: {
      name: 'Chaise', width: 1, height: 1, solid: false,
      color: '#3a3a3a', topColor: '#4a4a4a', drawHeight: 10,
    },
    plant: {
      name: 'Plante', width: 1, height: 1, solid: true,
      color: '#2D8A27', topColor: '#3A9A32', drawHeight: 20, isPlant: true,
    },
    palmTree: {
      name: 'Palmier', width: 1, height: 1, solid: true,
      color: '#1D7A17', topColor: '#2A8A22', drawHeight: 32, isPlant: true, isPalm: true,
    },
    partition: {
      name: 'Cloison vitrée', width: 1, height: 3, solid: true,
      color: '#b0c4d8', topColor: '#c8daea', drawHeight: 30, isPartition: true,
    },
    largeTable: {
      name: 'Grande table', width: 4, height: 2, solid: true,
      color: '#2a2a2a', topColor: '#3a3a3a', drawHeight: 12,
    },
    roundTable: {
      name: 'Table ronde', width: 2, height: 2, solid: true,
      color: '#e8e8e8', topColor: '#f5f5f5', drawHeight: 11, isRound: true,
    },
    screen: {
      name: 'Écran', width: 2, height: 1, solid: true,
      color: '#1a1a1a', topColor: '#2a2a2a', drawHeight: 35, isScreen: true,
    },
    stage: {
      name: 'Estrade', width: 5, height: 3, solid: false,
      color: '#B08050', topColor: '#C89868', drawHeight: 6, isStage: true,
    },
    couch: {
      name: 'Canapé', width: 2, height: 1, solid: true,
      color: '#E87830', topColor: '#F09048', drawHeight: 12,
    },
    coffeeTable: {
      name: 'Table basse', width: 1, height: 1, solid: true,
      color: '#e0e0e0', topColor: '#f0f0f0', drawHeight: 5,
    },
    bookshelf: {
      name: 'Bibliothèque', width: 2, height: 1, solid: true,
      color: '#f0f0f0', topColor: '#fafafa', drawHeight: 32,
    },
    whiteboard: {
      name: 'Tableau blanc', width: 2, height: 1, solid: true,
      color: '#f5f5f5', topColor: '#ffffff', drawHeight: 35, isWhiteboard: true,
    },
    carpet: {
      name: 'Tapis', width: 3, height: 3, solid: false,
      color: '#c8b090', topColor: '#d8c0a0', drawHeight: 0, isCarpet: true,
    },
    postItBoard: {
      name: 'Tableau Post-it', width: 1, height: 2, solid: true,
      color: '#c4a06a', topColor: '#d4b07a', drawHeight: 35, isPostItBoard: true,
    },
    zoneMarker: {
      name: 'Zone de discussion', width: 4, height: 4, solid: false,
      color: 'rgba(100,160,200,0.12)', topColor: 'rgba(100,160,200,0.2)', drawHeight: 0, isZone: true,
    },
    smallStage: {
      name: 'Petite estrade', width: 3, height: 2, solid: false,
      color: '#B08050', topColor: '#C89868', drawHeight: 6, isStage: true,
    },
    podium: {
      name: 'Pupitre', width: 1, height: 1, solid: true,
      color: '#8B6B3E', topColor: '#A0804A', drawHeight: 18, isPodium: true,
    },
    projector: {
      name: 'Projecteur', width: 1, height: 1, solid: true,
      color: '#333', topColor: '#444', drawHeight: 28, isProjector: true,
    },
    waterCooler: {
      name: 'Fontaine à eau', width: 1, height: 1, solid: true,
      color: '#87CEEB', topColor: '#ADD8E6', drawHeight: 16, isWaterCooler: true,
    },
    filingCabinet: {
      name: 'Classeur', width: 1, height: 1, solid: true,
      color: '#808080', topColor: '#909090', drawHeight: 20,
    },
    standingDesk: {
      name: 'Bureau debout', width: 2, height: 1, solid: true,
      color: '#C8A96E', topColor: '#DFC088', drawHeight: 18, isStandingDesk: true,
    },
    collabSpace: {
      name: 'Espace collab', width: 4, height: 4, solid: false,
      color: 'rgba(46,204,113,0.12)', topColor: 'rgba(46,204,113,0.2)', drawHeight: 0, isCollabSpace: true,
    },
    largeCarpet: {
      name: 'Grand tapis', width: 5, height: 5, solid: false,
      color: '#b08080', topColor: '#c09090', drawHeight: 0, isCarpet: true,
    },
    lamp: {
      name: 'Lampadaire', width: 1, height: 1, solid: true,
      color: '#C0C0C0', topColor: '#D0D0D0', drawHeight: 28, isLamp: true,
    },
    door: {
      name: 'Porte / Portail', width: 1, height: 1, solid: false,
      color: '#9B59B6', topColor: '#A66BBE', drawHeight: 30, isDoor: true,
    },
    conferencePhone: {
      name: 'Téléphone conf.', width: 1, height: 1, solid: true,
      color: '#2a2a2a', topColor: '#3a3a3a', drawHeight: 10, isConfPhone: true,
    },
    trashBin: {
      name: 'Corbeille', width: 1, height: 1, solid: true,
      color: '#606060', topColor: '#707070', drawHeight: 8,
    },
    clock: {
      name: 'Horloge murale', width: 1, height: 1, solid: true,
      color: '#f5f5f5', topColor: '#ffffff', drawHeight: 30, isClock: true,
    },
  },

  presets: {
    'bureau': {
      name: 'Bureau',
      floorColor1: '#b9c2ad',
      floorColor2: '#aeb8a1',
      wallColor: '#f0ebdd', // warm cream wall (wellness palette)
      furniture: (gs) => {
        const items = [];
        const m = 3;
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            items.push({ type: 'desk', x: m + col * 5, y: m + row * 5 });
            items.push({ type: 'chair', x: m + col * 5, y: m + row * 5 + 2 });
          }
        }
        items.push({ type: 'plant', x: 1, y: 1 });
        items.push({ type: 'plant', x: gs - 2, y: 1 });
        items.push({ type: 'plant', x: 1, y: gs - 2 });
        items.push({ type: 'plant', x: gs - 2, y: gs - 2 });
        items.push({ type: 'bookshelf', x: gs - 4, y: 2 });
        items.push({ type: 'stage', x: Math.floor(gs / 2) - 2, y: 1 });
        items.push({ type: 'screen', x: Math.floor(gs / 2) - 1, y: 0 });
        // Whiteboard on back-right wall (y=0)
        items.push({ type: 'whiteboard', x: gs - 4, y: 0 });
        // Post-it board on back-left wall (x=0)
        items.push({ type: 'postItBoard', x: 0, y: Math.floor(gs / 2) });
        // #42 Small rug near first desk cluster
        items.push({ type: 'carpet', x: 2, y: 5 });
        return items;
      },
    },
    'open-space': {
      name: 'Open Space',
      floorColor1: '#aec3a4',
      floorColor2: '#a2b898',
      wallColor: '#f0ebdd',
      furniture: (gs) => {
        const items = [];
        const cx = Math.floor(gs / 2);
        for (let i = 0; i < 2; i++) {
          const bx = 3 + i * Math.max(6, Math.floor(gs / 3)); const by = 3;
          if (bx + 3 < gs - 1) {
            items.push({ type: 'desk', x: bx, y: by });
            items.push({ type: 'desk', x: bx + 2, y: by });
            items.push({ type: 'chair', x: bx, y: by + 2 });
            items.push({ type: 'chair', x: bx + 2, y: by + 2 });
          }
        }
        // Lounge area — placed far from center
        items.push({ type: 'couch', x: 2, y: gs - 3 });
        items.push({ type: 'couch', x: 5, y: gs - 3 });
        items.push({ type: 'coffeeTable', x: 4, y: gs - 2 });
        items.push({ type: 'plant', x: 1, y: 1 });
        items.push({ type: 'palmTree', x: gs - 2, y: gs - 2 });
        items.push({ type: 'plant', x: cx, y: 1 });
        items.push({ type: 'plant', x: 1, y: cx });
        // Stage below center
        items.push({ type: 'stage', x: cx - 2, y: cx + 2 });
        items.push({ type: 'whiteboard', x: gs - 4, y: 0 });
        items.push({ type: 'postItBoard', x: 0, y: cx });
        return items;
      },
    },
    'salle-de-conference': {
      name: 'Salle de Conférence',
      floorColor1: '#b4c1ac',
      floorColor2: '#a8b6a0',
      wallColor: '#f0ebdd', // warm cream wall (wellness palette)
      furniture: (gs) => {
        const items = [];
        const cx = Math.floor(gs / 2);
        // Table placed BELOW center so spawn point (cx, cx) is clear
        items.push({ type: 'largeTable', x: cx - 2, y: cx + 2 });
        for (let i = 0; i < 4; i++) {
          items.push({ type: 'chair', x: cx - 2 + i, y: cx + 1 });
          items.push({ type: 'chair', x: cx - 2 + i, y: cx + 4 });
        }
        items.push({ type: 'screen', x: cx - 1, y: 1 });
        items.push({ type: 'stage', x: cx - 2, y: 2 });
        // Whiteboard on back-right wall
        items.push({ type: 'whiteboard', x: cx + 2, y: 0 });
        // Post-it board on back-left wall
        items.push({ type: 'postItBoard', x: 0, y: cx + 2 });
        items.push({ type: 'plant', x: 1, y: 1 });
        items.push({ type: 'plant', x: gs - 2, y: 1 });
        items.push({ type: 'plant', x: 1, y: gs - 2 });
        items.push({ type: 'plant', x: gs - 2, y: gs - 2 });
        return items;
      },
    },
    'coworking': {
      name: 'Espace Coworking',
      floorColor1: '#b9c2ad',
      floorColor2: '#adb8a0',
      wallColor: '#f0ebdd',
      furniture: (gs) => {
        const items = [];
        const cx = Math.floor(gs / 2);
        // Zone 1 — Brainstorm (top-left)
        items.push({ type: 'zoneMarker', x: 2, y: 2, zone: 1, zoneName: 'Brainstorm' });
        items.push({ type: 'roundTable', x: 3, y: 3 });
        items.push({ type: 'chair', x: 2, y: 3 });
        items.push({ type: 'chair', x: 5, y: 3 });
        items.push({ type: 'chair', x: 3, y: 2 });
        items.push({ type: 'chair', x: 3, y: 5 });
        items.push({ type: 'whiteboard', x: 2, y: 1 });

        // Zone 2 — Focus (top-right)
        items.push({ type: 'zoneMarker', x: cx + 2, y: 2, zone: 2, zoneName: 'Focus' });
        for (let i = 0; i < 3; i++) {
          items.push({ type: 'desk', x: cx + 2, y: 3 + i * 2 });
          items.push({ type: 'chair', x: cx + 4, y: 3 + i * 2 });
        }
        items.push({ type: 'partition', x: cx + 1, y: 2 });

        // Zone 3 — Détente (bottom-left)
        items.push({ type: 'zoneMarker', x: 2, y: cx + 2, zone: 3, zoneName: 'Détente' });
        items.push({ type: 'couch', x: 3, y: cx + 3 });
        items.push({ type: 'couch', x: 3, y: cx + 5 });
        items.push({ type: 'coffeeTable', x: 5, y: cx + 4 });
        items.push({ type: 'palmTree', x: 2, y: cx + 2 });

        // Zone 4 — Présentation (bottom-right)
        items.push({ type: 'zoneMarker', x: cx + 2, y: cx + 2, zone: 4, zoneName: 'Présentation' });
        items.push({ type: 'stage', x: cx + 3, y: cx + 3 });
        items.push({ type: 'screen', x: cx + 4, y: cx + 2 });

        // Déco
        items.push({ type: 'plant', x: 1, y: 1 });
        items.push({ type: 'plant', x: gs - 2, y: 1 });
        items.push({ type: 'plant', x: 1, y: gs - 2 });
        items.push({ type: 'plant', x: gs - 2, y: gs - 2 });
        items.push({ type: 'bookshelf', x: cx - 1, y: 1 });

        return items;
      },
    },
  },

  // Place `count` chairs in a ring of given radius around (cx, cy).
  _ring(cx, cy, radius, count, type) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * radius);
      const y = Math.round(cy + Math.sin(a) * radius * 0.85); // slightly squashed for iso feel
      const key = x + ',' + y;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ type: type || 'chair', x, y });
    }
    return out;
  },

  // ===== Facilitation formats (preconfigured for real-world workshops) =====
  facilitationPresets: {
    'world-cafe': {
      name: 'World Café',
      floorColor1: '#bcae93', floorColor2: '#b0a487', wallColor: '#efe7d8',
      description: 'Petites tables rondes avec paperboard — conversations qui essaiment.',
      furniture: (gs) => {
        const items = [];
        // L'estrade : seul endroit d'où l'on parle à toute la salle
        items.push({ type: 'smallStage', x: Math.max(1, Math.floor(gs / 2) - 1), y: 0 });
        const clamp = (v) => Math.max(1, Math.min(gs - 2, v));
        // A grid of café tables, each with 4 seats + a paperboard alongside.
        const cols = gs >= 26 ? 3 : 2;
        const rows = gs >= 26 ? 3 : 2;
        const stepX = Math.floor(gs / (cols + 1));
        const stepY = Math.floor(gs / (rows + 1));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const tx = clamp((c + 1) * stepX - 1);
            const ty = clamp((r + 1) * stepY - 1);
            items.push({ type: 'roundTable', x: tx, y: ty });
            items.push({ type: 'chair', x: clamp(tx - 1), y: ty });
            items.push({ type: 'chair', x: clamp(tx + 2), y: ty });
            items.push({ type: 'chair', x: tx, y: clamp(ty - 1) });
            items.push({ type: 'chair', x: tx, y: clamp(ty + 2) });
            items.push({ type: 'postItBoard', x: clamp(tx + 2), y: clamp(ty + 2) });
          }
        }
        // Restitution wall + greenery.
        items.push({ type: 'whiteboard', x: Math.floor(gs / 2) - 1, y: 0 });
        items.push({ type: 'plant', x: 1, y: 1 });
        items.push({ type: 'palmTree', x: gs - 2, y: 1 });
        items.push({ type: 'plant', x: 1, y: gs - 2 });
        items.push({ type: 'palmTree', x: gs - 2, y: gs - 2 });
        return items;
      },
    },
    'forum-ouvert': {
      name: 'Forum Ouvert',
      floorColor1: '#b4bca8', floorColor2: '#a8b09c', wallColor: '#ece4d6',
      description: 'Grand cercle d\'ouverture + zones de thèmes en marché des idées.',
      furniture: function (gs) {
        const items = [];
        // L'estrade : seul endroit d'où l'on parle à toute la salle
        items.push({ type: 'smallStage', x: Math.max(1, Math.floor(gs / 2) - 1), y: 0 });
        const clamp = (v) => Math.max(1, Math.min(gs - 2, v));
        const cx = Math.floor(gs / 2), cy = Math.floor(gs / 2);
        // Opening circle of chairs (the marketplace).
        const ringR = Math.max(3, Math.floor(gs / 4));
        const seats = Math.min(20, Math.max(10, Math.floor(gs * 0.9)));
        Environments._ring(cx, cy, ringR, seats, 'chair').forEach((c) => {
          c.x = clamp(c.x); c.y = clamp(c.y); items.push(c);
        });
        // Theme breakout zones in the four corners, each with a paperboard.
        const z = Math.max(2, Math.floor(gs / 6));
        const corners = [
          { x: 1, y: 1, name: 'Thème 1' },
          { x: gs - z - 1, y: 1, name: 'Thème 2' },
          { x: 1, y: gs - z - 1, name: 'Thème 3' },
          { x: gs - z - 1, y: gs - z - 1, name: 'Thème 4' },
        ];
        corners.forEach((co, i) => {
          items.push({ type: 'zoneMarker', x: co.x, y: co.y, zone: i + 1, zoneName: co.name });
          items.push({ type: 'postItBoard', x: clamp(co.x + 1), y: clamp(co.y) });
          items.push({ type: 'roundTable', x: clamp(co.x + 1), y: clamp(co.y + 1) });
        });
        // Agenda wall.
        items.push({ type: 'whiteboard', x: cx - 1, y: 0 });
        items.push({ type: 'podium', x: cx + 2, y: 1 });
        return items;
      },
    },
    'fishbowl': {
      name: 'Fishbowl',
      floorColor1: '#b6c4cf', floorColor2: '#aab8c4', wallColor: '#e8eef3',
      description: 'Cercle intérieur qui débat, cercle extérieur qui écoute — une chaise libre pour entrer.',
      furniture: (gs) => {
        const items = [];
        // L'estrade : seul endroit d'où l'on parle à toute la salle
        items.push({ type: 'smallStage', x: Math.max(1, Math.floor(gs / 2) - 1), y: 0 });
        const cx = gs / 2, cy = gs / 2 + 1;
        // Cercle intérieur : 5 chaises (dont la « chaise libre »)
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          items.push({ type: 'chair', x: Math.round(cx + Math.cos(a) * 2.2), y: Math.round(cy + Math.sin(a) * 2.2) });
        }
        // Cercle extérieur : 12 chaises d'écoute
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          items.push({ type: 'chair', x: Math.round(cx + Math.cos(a) * 5.2), y: Math.round(cy + Math.sin(a) * 5.2) });
        }
        items.push({ type: 'zoneMarker', x: Math.round(cx) - 2, y: Math.round(cy) - 2 });
        items.push({ type: 'whiteboard', x: 1, y: 1 });
        items.push({ type: 'plant', x: 1, y: gs - 2 });
        items.push({ type: 'plant', x: gs - 2, y: gs - 2 });
        return items;
      },
    },
    '1-2-4-all': {
      name: '1-2-4-Tous',
      floorColor1: '#c7bfa6', floorColor2: '#bbb29a', wallColor: '#f0ead9',
      description: 'Réflexion solo, puis duos, puis quatuors, puis tous ensemble — zones progressives.',
      furniture: (gs) => {
        const items = [];
        // L'estrade : seul endroit d'où l'on parle à toute la salle
        items.push({ type: 'smallStage', x: Math.max(1, Math.floor(gs / 2) - 1), y: 0 });
        // Zone « 1 » : réflexion solo
        for (let i = 0; i < 4; i++) items.push({ type: 'chair', x: 2 + i * 2, y: 3 });
        items.push({ type: 'zoneMarker', x: 1, y: 2 });
        // Zone « 2 » : duos face à face
        for (let i = 0; i < 3; i++) {
          items.push({ type: 'chair', x: gs - 5, y: 2 + i * 3 });
          items.push({ type: 'chair', x: gs - 3, y: 2 + i * 3 });
        }
        items.push({ type: 'zoneMarker', x: gs - 6, y: 1 });
        // Zone « 4 » : deux tables de quatre
        items.push({ type: 'roundTable', x: 3, y: gs - 7 });
        items.push({ type: 'chair', x: 2, y: gs - 7 }); items.push({ type: 'chair', x: 5, y: gs - 7 });
        items.push({ type: 'chair', x: 3, y: gs - 8 }); items.push({ type: 'chair', x: 3, y: gs - 5 });
        items.push({ type: 'roundTable', x: gs - 6, y: gs - 7 });
        items.push({ type: 'chair', x: gs - 7, y: gs - 7 }); items.push({ type: 'chair', x: gs - 4, y: gs - 7 });
        items.push({ type: 'chair', x: gs - 6, y: gs - 8 }); items.push({ type: 'chair', x: gs - 6, y: gs - 5 });
        items.push({ type: 'zoneMarker', x: 2, y: gs - 8 });
        items.push({ type: 'zoneMarker', x: gs - 7, y: gs - 8 });
        // « Tous » : grand tapis central de restitution
        items.push({ type: 'largeCarpet', x: Math.floor(gs / 2) - 2, y: Math.floor(gs / 2) - 2 });
        items.push({ type: 'whiteboard', x: 1, y: Math.floor(gs / 2) });
        return items;
      },
    },
    'cercle': {
      name: 'Cercle (codéveloppement)',
      floorColor1: '#b8b0a0', floorColor2: '#aca492', wallColor: '#efe8da',
      description: 'Cercle de parole resserré autour d\'un paperboard — codir, codév, rétro.',
      furniture: function (gs) {
        const items = [];
        // L'estrade : seul endroit d'où l'on parle à toute la salle
        items.push({ type: 'smallStage', x: Math.max(1, Math.floor(gs / 2) - 1), y: 0 });
        const clamp = (v) => Math.max(1, Math.min(gs - 2, v));
        const cx = Math.floor(gs / 2), cy = Math.floor(gs / 2);
        items.push({ type: 'carpet', x: clamp(cx - 1), y: clamp(cy - 1) });
        const ringR = Math.max(3, Math.floor(gs / 5));
        Environments._ring(cx, cy, ringR, Math.min(14, Math.max(8, Math.floor(gs * 0.7))), 'chair')
          .forEach((c) => { c.x = clamp(c.x); c.y = clamp(c.y); items.push(c); });
        // Two paperboards for the "client" of the session.
        items.push({ type: 'whiteboard', x: cx - 1, y: 0 });
        items.push({ type: 'postItBoard', x: 0, y: cy });
        items.push({ type: 'plant', x: 1, y: 1 });
        items.push({ type: 'palmTree', x: gs - 2, y: gs - 2 });
        return items;
      },
    },
  },

  getFurniture(envType, gridSize) {
    const preset = this.presets[envType] || this.facilitationPresets[envType];
    var items = preset ? preset.furniture(gridSize) : this.presets['bureau'].furniture(gridSize);
    // Ensure every item has a unique ID
    for (var i = 0; i < items.length; i++) {
      if (!items[i].id) items[i].id = 'furn_init_' + i + '_' + items[i].type;
    }
    return items;
  },

  getPreset(envType) {
    return this.presets[envType] || this.facilitationPresets[envType] || this.presets['bureau'];
  },

  isSolidAt(envType, gridSize, gx, gy) {
    const furniture = this.getFurniture(envType, gridSize);
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    for (const item of furniture) {
      const def = this.furnitureTypes[item.type];
      if (!def || !def.solid) continue;
      if (ix >= item.x && ix < item.x + def.width && iy >= item.y && iy < item.y + def.height) return true;
    }
    return false;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Environments;
}
