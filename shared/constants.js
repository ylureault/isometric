// Shared constants for the isometric collaborative space

const CONSTANTS = {
  VERSION: '1.2.0',
  GRID_MIN: 10,
  GRID_MAX: 100,
  GRID_DEFAULT: 20,
  TILE_WIDTH: 64,
  TILE_HEIGHT: 32,

  ZOOM_MIN: 0.3,
  ZOOM_MAX: 3.0,
  ZOOM_DEFAULT: 1.2,
  ZOOM_STEP: 0.1,

  MAX_PARTICIPANTS: 50,
  MAX_ROOMS: 100,
  MAX_TABLES_PER_ROOM: 50,
  MAX_FURNITURE_PER_ROOM: 200,
  MAX_TIMERS_PER_ROOM: 20,
  MAX_WHITEBOARDS_PER_ROOM: 30,
  MAX_VOTES_PER_ROOM: 20,
  MAX_SUB_ROOMS_PER_ROOM: 20,
  MAX_COLLAB_SPACES_PER_ROOM: 20,
  MAX_WB_STROKES: 5000,
  MAX_WB_TEXTS: 500,
  MAX_WB_POSTITS: 200,
  MAX_CHAT_MESSAGES_STORED: 500,
  MAX_TABLE_NOTES_LENGTH: 10000,
  ROOM_CLEANUP_INTERVAL: 300000, // 5 minutes
  DISCONNECTED_CLEANUP_TIMEOUT: 45000,
  EMPTY_ROOM_CLEANUP_TIMEOUT: 60000,

  AUDIO_RADIUS: 3,
  AUDIO_RADIUS_MIN: 1,
  AUDIO_RADIUS_MAX: 20,
  AUDIO_FADE_START: 1.5,

  MOVE_SPEED: 0.07,
  ANIMATION_SPEED: 0.12,

  SPEAKING_THROTTLE_MS: 250,
  INVITE_CODE_LENGTH: 6,
  POSITION_SEND_RATE: 15,
  INTERPOLATION_DELAY: 80,
  RECONNECT_TIMEOUT: 45000, // grace window for flaky / mobile networks
  NOTIFICATION_DURATION: 3500,

  // Anti-abuse rate limits (events per second, per socket)
  RATE_LIMIT_POSITION: 30,
  RATE_LIMIT_STROKE: 80,
  RATE_LIMIT_GENERIC: 20,
  RATE_LIMIT_CHAT_MS: 500,
  MAX_RECONNECT_ATTEMPTS: 15,

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
