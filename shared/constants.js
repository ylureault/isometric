// Shared constants for the isometric collaborative space

const CONSTANTS = {
  GRID_MIN: 10,
  GRID_MAX: 100,
  GRID_DEFAULT: 20,
  TILE_WIDTH: 64,
  TILE_HEIGHT: 32,

  ZOOM_MIN: 0.3,
  ZOOM_MAX: 3.0,
  ZOOM_DEFAULT: 1.2,
  ZOOM_STEP: 0.1,

  MAX_PARTICIPANTS: 20,

  AUDIO_RADIUS: 3,
  AUDIO_FADE_START: 1.5,

  MOVE_SPEED: 0.07,
  ANIMATION_SPEED: 0.12,

  POSITION_SEND_RATE: 15,
  INTERPOLATION_DELAY: 80,
  RECONNECT_TIMEOUT: 30000,
  NOTIFICATION_DURATION: 3500,

  ENVIRONMENTS: ['bureau', 'open-space', 'salle-de-conference', 'coworking'],

  DEFAULT_COLORS: {
    skin: '#FFDCB5',
    hair: '#4A3728',
    shirt: '#5B8DBE',
    pants: '#3D5A80',
    shoes: '#2B2B2B',
  },

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
