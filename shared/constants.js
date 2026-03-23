// Shared constants for the isometric collaborative space

const CONSTANTS = {
  // Grid
  GRID_MIN: 20,
  GRID_MAX: 200,
  GRID_DEFAULT: 20,
  TILE_WIDTH: 40,
  TILE_HEIGHT: 20,

  // Room
  MAX_PARTICIPANTS: 20,

  // Audio
  AUDIO_RADIUS: 5, // tiles
  AUDIO_FADE_START: 3, // tiles — volume starts fading

  // Movement
  MOVE_SPEED: 0.06, // tiles per frame
  ANIMATION_SPEED: 0.12,

  // Network
  POSITION_SEND_RATE: 15, // max messages per second
  INTERPOLATION_DELAY: 80, // ms — smooth interpolation buffer
  RECONNECT_TIMEOUT: 30000, // ms — 30 seconds before full disconnect
  NOTIFICATION_DURATION: 3000, // ms

  // Environments
  ENVIRONMENTS: ['bureau', 'open-space', 'salle-de-conference'],

  // Character defaults
  DEFAULT_COLORS: {
    skin: '#FFDCB5',
    hair: '#4A3728',
    shirt: '#5B8DBE',
    pants: '#3D5A80',
    shoes: '#2B2B2B',
  },

  // Directions
  DIRECTIONS: {
    UP: { dx: 0, dy: -1 },
    DOWN: { dx: 0, dy: 1 },
    LEFT: { dx: -1, dy: 0 },
    RIGHT: { dx: 1, dy: 0 },
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONSTANTS;
}
