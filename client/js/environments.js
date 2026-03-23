// Environment definitions: furniture and decor for each environment type

const Environments = {
  // Furniture types with their rendering properties
  furnitureTypes: {
    desk: {
      name: 'Bureau',
      width: 2, height: 1, // grid cells
      solid: true,
      color: '#8B6914',
      topColor: '#A07828',
      drawHeight: 12,
    },
    chair: {
      name: 'Chaise',
      width: 1, height: 1,
      solid: false, // can walk through
      color: '#555',
      topColor: '#666',
      drawHeight: 8,
    },
    plant: {
      name: 'Plante',
      width: 1, height: 1,
      solid: true,
      color: '#2D5A27',
      topColor: '#3A7A32',
      drawHeight: 18,
      isPlant: true,
    },
    partition: {
      name: 'Cloison',
      width: 1, height: 3,
      solid: true,
      color: '#888',
      topColor: '#999',
      drawHeight: 25,
    },
    largeTable: {
      name: 'Grande table',
      width: 4, height: 2,
      solid: true,
      color: '#6B4F2E',
      topColor: '#8B6B3E',
      drawHeight: 12,
    },
    screen: {
      name: 'Écran',
      width: 2, height: 1,
      solid: true,
      color: '#222',
      topColor: '#333',
      drawHeight: 30,
      isScreen: true,
    },
    stage: {
      name: 'Estrade',
      width: 4, height: 3,
      solid: false,
      color: '#5A3E28',
      topColor: '#7A5E48',
      drawHeight: 6,
      isStage: true,
    },
    couch: {
      name: 'Canapé',
      width: 2, height: 1,
      solid: true,
      color: '#6B4570',
      topColor: '#8B6590',
      drawHeight: 10,
    },
    coffeeTable: {
      name: 'Table basse',
      width: 1, height: 1,
      solid: true,
      color: '#8B6914',
      topColor: '#A07828',
      drawHeight: 6,
    },
  },

  // Environment presets
  presets: {
    'bureau': {
      name: 'Bureau',
      floorColor1: '#3a4a5c',
      floorColor2: '#344458',
      furniture: (gridSize) => {
        const items = [];
        const margin = 3;
        // Desks in rows
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            items.push({
              type: 'desk',
              x: margin + col * 5,
              y: margin + row * 5,
            });
            items.push({
              type: 'chair',
              x: margin + col * 5,
              y: margin + row * 5 + 2,
            });
          }
        }
        // Plants in corners
        items.push({ type: 'plant', x: 1, y: 1 });
        items.push({ type: 'plant', x: gridSize - 2, y: 1 });
        items.push({ type: 'plant', x: 1, y: gridSize - 2 });
        // Estrade
        items.push({ type: 'stage', x: Math.floor(gridSize / 2) - 2, y: 1 });
        return items;
      },
    },
    'open-space': {
      name: 'Open Space',
      floorColor1: '#3c5048',
      floorColor2: '#365048',
      furniture: (gridSize) => {
        const items = [];
        // Island clusters
        for (let cluster = 0; cluster < 2; cluster++) {
          const bx = 3 + cluster * 8;
          const by = 3;
          items.push({ type: 'desk', x: bx, y: by });
          items.push({ type: 'desk', x: bx + 2, y: by });
          items.push({ type: 'chair', x: bx, y: by + 2 });
          items.push({ type: 'chair', x: bx + 2, y: by + 2 });
        }
        // Relaxation area
        items.push({ type: 'couch', x: 2, y: gridSize - 5 });
        items.push({ type: 'coffeeTable', x: 4, y: gridSize - 4 });
        // Plants scattered
        items.push({ type: 'plant', x: 1, y: 1 });
        items.push({ type: 'plant', x: gridSize - 2, y: gridSize - 2 });
        items.push({ type: 'plant', x: Math.floor(gridSize / 2), y: 1 });
        items.push({ type: 'plant', x: 1, y: Math.floor(gridSize / 2) });
        // Estrade
        items.push({ type: 'stage', x: Math.floor(gridSize / 2) - 2, y: Math.floor(gridSize / 2) - 1 });
        return items;
      },
    },
    'salle-de-conference': {
      name: 'Salle de Conférence',
      floorColor1: '#3a3a5c',
      floorColor2: '#34345a',
      furniture: (gridSize) => {
        const items = [];
        // Large central table
        items.push({
          type: 'largeTable',
          x: Math.floor(gridSize / 2) - 2,
          y: Math.floor(gridSize / 2) - 1,
        });
        // Chairs around table
        const tx = Math.floor(gridSize / 2) - 2;
        const ty = Math.floor(gridSize / 2) - 1;
        for (let i = 0; i < 4; i++) {
          items.push({ type: 'chair', x: tx + i, y: ty - 1 });
          items.push({ type: 'chair', x: tx + i, y: ty + 3 });
        }
        // Screen at the front
        items.push({ type: 'screen', x: Math.floor(gridSize / 2) - 1, y: 1 });
        // Estrade at front
        items.push({ type: 'stage', x: Math.floor(gridSize / 2) - 2, y: 2 });
        // Plants
        items.push({ type: 'plant', x: 1, y: 1 });
        items.push({ type: 'plant', x: gridSize - 2, y: 1 });
        return items;
      },
    },
  },

  getFurniture(envType, gridSize) {
    const preset = this.presets[envType];
    if (!preset) return [];
    return preset.furniture(gridSize);
  },

  getPreset(envType) {
    return this.presets[envType] || this.presets['bureau'];
  },
};
