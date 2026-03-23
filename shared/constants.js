// Shared constants for the isometric collaborative space

const CONSTANTS = {
  // Grid
  GRID_MIN: 20,
  GRID_MAX: 100,
  GRID_DEFAULT: 25,
  TILE_WIDTH: 40,
  TILE_HEIGHT: 20,

  // Zoom
  ZOOM_MIN: 0.4,
  ZOOM_MAX: 2.5,
  ZOOM_DEFAULT: 1.0,
  ZOOM_STEP: 0.08,

  // Room
  MAX_PARTICIPANTS: 20,

  // Audio
  AUDIO_RADIUS: 6,
  AUDIO_FADE_START: 3,

  // Movement
  MOVE_SPEED: 0.07,
  ANIMATION_SPEED: 0.12,

  // Network
  POSITION_SEND_RATE: 15,
  INTERPOLATION_DELAY: 80,
  RECONNECT_TIMEOUT: 30000,
  NOTIFICATION_DURATION: 3500,

  // Environments
  ENVIRONMENTS: ['bureau', 'open-space', 'salle-de-conference', 'coworking'],

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
