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
      name: 'Zone', width: 4, height: 4, solid: false,
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
      floorColor1: '#c8c8c8',
      floorColor2: '#b8b8b8',
      wallColor: '#e8e0d8',
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
        return items;
      },
    },
    'open-space': {
      name: 'Open Space',
      floorColor1: '#a8b0a0',
      floorColor2: '#98a890',
      wallColor: '#e0e0e0',
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
      floorColor1: '#b0b0b8',
      floorColor2: '#a0a0a8',
      wallColor: '#d8d0c8',
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
      floorColor1: '#c0c0c0',
      floorColor2: '#b0b0b0',
      wallColor: '#e0d8d0',
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

  getFurniture(envType, gridSize) {
    const preset = this.presets[envType];
    if (!preset) return this.presets['bureau'].furniture(gridSize);
    return preset.furniture(gridSize);
  },

  getPreset(envType) {
    return this.presets[envType] || this.presets['bureau'];
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
