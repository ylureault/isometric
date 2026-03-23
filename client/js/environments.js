// Environment definitions: furniture and decor for each environment type

const Environments = {
  furnitureTypes: {
    desk: {
      name: 'Bureau', width: 2, height: 1, solid: true,
      color: '#8B6914', topColor: '#A07828', drawHeight: 12,
    },
    chair: {
      name: 'Chaise', width: 1, height: 1, solid: false,
      color: '#555', topColor: '#666', drawHeight: 8,
    },
    plant: {
      name: 'Plante', width: 1, height: 1, solid: true,
      color: '#2D5A27', topColor: '#3A7A32', drawHeight: 18, isPlant: true,
    },
    palmTree: {
      name: 'Palmier', width: 1, height: 1, solid: true,
      color: '#1D4A17', topColor: '#2A6A22', drawHeight: 28, isPlant: true, isPalm: true,
    },
    partition: {
      name: 'Cloison', width: 1, height: 3, solid: true,
      color: '#6a7a8a', topColor: '#7a8a9a', drawHeight: 25,
    },
    largeTable: {
      name: 'Grande table', width: 4, height: 2, solid: true,
      color: '#6B4F2E', topColor: '#8B6B3E', drawHeight: 12,
    },
    roundTable: {
      name: 'Table ronde', width: 2, height: 2, solid: true,
      color: '#7B5B2E', topColor: '#9B7B4E', drawHeight: 11, isRound: true,
    },
    screen: {
      name: 'Écran', width: 2, height: 1, solid: true,
      color: '#222', topColor: '#333', drawHeight: 30, isScreen: true,
    },
    stage: {
      name: 'Estrade', width: 5, height: 3, solid: false,
      color: '#5A3E28', topColor: '#7A5E48', drawHeight: 6, isStage: true,
    },
    couch: {
      name: 'Canapé', width: 2, height: 1, solid: true,
      color: '#6B4570', topColor: '#8B6590', drawHeight: 10,
    },
    coffeeTable: {
      name: 'Table basse', width: 1, height: 1, solid: true,
      color: '#8B6914', topColor: '#A07828', drawHeight: 6,
    },
    bookshelf: {
      name: 'Bibliothèque', width: 2, height: 1, solid: true,
      color: '#5A3E1E', topColor: '#7A5E3E', drawHeight: 28,
    },
    whiteboard: {
      name: 'Tableau blanc', width: 2, height: 1, solid: true,
      color: '#ddd', topColor: '#f0f0f0', drawHeight: 30, isWhiteboard: true,
    },
    carpet: {
      name: 'Tapis', width: 3, height: 3, solid: false,
      color: '#8B4513', topColor: '#A0522D', drawHeight: 0, isCarpet: true,
    },
    zoneMarker: {
      name: 'Zone', width: 4, height: 4, solid: false,
      color: 'rgba(126,184,218,0.15)', topColor: 'rgba(126,184,218,0.25)', drawHeight: 0, isZone: true,
    },
  },

  presets: {
    'bureau': {
      name: 'Bureau',
      floorColor1: '#3a4a5c',
      floorColor2: '#344458',
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
        return items;
      },
    },
    'open-space': {
      name: 'Open Space',
      floorColor1: '#3c5048',
      floorColor2: '#365048',
      furniture: (gs) => {
        const items = [];
        for (let i = 0; i < 2; i++) {
          const bx = 3 + i * 8; const by = 3;
          items.push({ type: 'desk', x: bx, y: by });
          items.push({ type: 'desk', x: bx + 2, y: by });
          items.push({ type: 'chair', x: bx, y: by + 2 });
          items.push({ type: 'chair', x: bx + 2, y: by + 2 });
        }
        items.push({ type: 'couch', x: 2, y: gs - 5 });
        items.push({ type: 'couch', x: 5, y: gs - 5 });
        items.push({ type: 'coffeeTable', x: 4, y: gs - 4 });
        items.push({ type: 'plant', x: 1, y: 1 });
        items.push({ type: 'palmTree', x: gs - 2, y: gs - 2 });
        items.push({ type: 'plant', x: Math.floor(gs / 2), y: 1 });
        items.push({ type: 'plant', x: 1, y: Math.floor(gs / 2) });
        items.push({ type: 'stage', x: Math.floor(gs / 2) - 2, y: Math.floor(gs / 2) - 1 });
        return items;
      },
    },
    'salle-de-conference': {
      name: 'Salle de Conférence',
      floorColor1: '#3a3a5c',
      floorColor2: '#34345a',
      furniture: (gs) => {
        const items = [];
        const cx = Math.floor(gs / 2);
        items.push({ type: 'largeTable', x: cx - 2, y: cx - 1 });
        for (let i = 0; i < 4; i++) {
          items.push({ type: 'chair', x: cx - 2 + i, y: cx - 2 });
          items.push({ type: 'chair', x: cx - 2 + i, y: cx + 2 });
        }
        items.push({ type: 'screen', x: cx - 1, y: 1 });
        items.push({ type: 'stage', x: cx - 2, y: 2 });
        items.push({ type: 'whiteboard', x: cx + 3, y: cx - 1 });
        items.push({ type: 'plant', x: 1, y: 1 });
        items.push({ type: 'plant', x: gs - 2, y: 1 });
        items.push({ type: 'plant', x: 1, y: gs - 2 });
        items.push({ type: 'plant', x: gs - 2, y: gs - 2 });
        return items;
      },
    },
    'coworking': {
      name: 'Espace Coworking',
      floorColor1: '#3a4858',
      floorColor2: '#344252',
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
};
