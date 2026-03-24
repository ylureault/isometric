// Comprehensive unit + edge case tests for room-manager
// Covers ALL methods, error paths, boundary values, and adversarial inputs

const CONSTANTS = require('../shared/constants');

let rm;
beforeEach(() => {
  const RM = require('../server/room-manager');
  RM.rooms = new Map();
  for (const [, tid] of RM._cleanupTimers) clearTimeout(tid);
  RM._cleanupTimers = new Map();
  rm = RM;
});

afterEach(() => {
  for (const [, tid] of rm._cleanupTimers) clearTimeout(tid);
  rm._cleanupTimers.clear();
});

// Helper: create room + join creator
function setupRoom(roomId = 'r1', gridSize = 20) {
  rm.createRoom(roomId, { name: 'Test', gridSize });
  rm.joinRoom(roomId, 'creator', { pseudo: 'Alice', colors: {}, isCreator: true });
}

// ===== createRoom =====
describe('createRoom', () => {
  test('returns room with correct properties', () => {
    const room = rm.createRoom('r1', { name: 'My Room', gridSize: 30, environment: 'bureau' });
    expect(room.id).toBe('r1');
    expect(room.name).toBe('My Room');
    expect(room.gridSize).toBe(30);
    expect(room.environment).toBe('bureau');
  });

  test('duplicate room returns null', () => {
    rm.createRoom('r1', { name: 'A' });
    expect(rm.createRoom('r1', { name: 'B' })).toBeNull();
  });

  test('max rooms limit', () => {
    for (let i = 0; i < CONSTANTS.MAX_ROOMS; i++) {
      rm.createRoom(`r${i}`, { name: `R${i}` });
    }
    expect(rm.createRoom('overflow', { name: 'X' })).toBeNull();
  });

  test('missing name defaults to "Room"', () => {
    const room = rm.createRoom('r1', {});
    expect(room.name).toBe('Room');
  });

  test('very long name truncated to 60 chars', () => {
    const room = rm.createRoom('r1', { name: 'A'.repeat(200) });
    expect(room.name.length).toBe(60);
  });

  test('invalid environment defaults to open-space', () => {
    const room = rm.createRoom('r1', { name: 'T', environment: 'mars' });
    expect(room.environment).toBe('open-space');
  });

  test('gridSize NaN defaults', () => {
    const room = rm.createRoom('r1', { name: 'T', gridSize: NaN });
    expect(room.gridSize).toBe(CONSTANTS.GRID_DEFAULT);
  });

  test('gridSize string parsed', () => {
    const room = rm.createRoom('r1', { name: 'T', gridSize: '50' });
    expect(room.gridSize).toBe(50);
  });

  test('room has all required Maps', () => {
    const room = rm.createRoom('r1', { name: 'T' });
    expect(room.participants).toBeInstanceOf(Map);
    expect(room.tables).toBeInstanceOf(Map);
    expect(room.whiteboards).toBeInstanceOf(Map);
    expect(room.votes).toBeInstanceOf(Map);
    expect(room.timers).toBeInstanceOf(Map);
  });
});

// ===== joinRoom =====
describe('joinRoom', () => {
  test('empty pseudo defaults to Anonyme', () => {
    rm.createRoom('r1', { name: 'T' });
    const r = rm.joinRoom('r1', 's1', { pseudo: '', colors: {}, isCreator: true });
    expect(r.participant.pseudo).toBe('Anonyme');
  });

  test('null pseudo defaults to Anonyme', () => {
    rm.createRoom('r1', { name: 'T' });
    const r = rm.joinRoom('r1', 's1', { pseudo: null, colors: {}, isCreator: true });
    expect(r.participant.pseudo).toBe('Anonyme');
  });

  test('pseudo truncated to 30 chars', () => {
    rm.createRoom('r1', { name: 'T' });
    const r = rm.joinRoom('r1', 's1', { pseudo: 'X'.repeat(100), colors: {}, isCreator: true });
    expect(r.participant.pseudo.length).toBe(30);
  });

  test('emoji pseudo preserved', () => {
    rm.createRoom('r1', { name: 'T' });
    const r = rm.joinRoom('r1', 's1', { pseudo: '🎮 Joueur', colors: {}, isCreator: true });
    expect(r.participant.pseudo).toBe('🎮 Joueur');
  });

  test('RTL text pseudo preserved', () => {
    rm.createRoom('r1', { name: 'T' });
    const r = rm.joinRoom('r1', 's1', { pseudo: 'مرحبا', colors: {}, isCreator: true });
    expect(r.participant.pseudo).toBe('مرحبا');
  });

  test('XSS payload in pseudo stored as-is', () => {
    rm.createRoom('r1', { name: 'T' });
    const xss = '<script>alert(1)</script>';
    const r = rm.joinRoom('r1', 's1', { pseudo: xss, colors: {}, isCreator: true });
    expect(r.participant.pseudo).toBe(xss);
  });

  test('invalid colors get defaults', () => {
    rm.createRoom('r1', { name: 'T' });
    const r = rm.joinRoom('r1', 's1', { pseudo: 'A', colors: { skin: 'not-a-color' }, isCreator: true });
    expect(r.participant.colors.skin).toBe(CONSTANTS.DEFAULT_COLORS.skin);
  });

  test('valid hex colors preserved', () => {
    rm.createRoom('r1', { name: 'T' });
    const r = rm.joinRoom('r1', 's1', { pseudo: 'A', colors: { skin: '#FF0000' }, isCreator: true });
    expect(r.participant.colors.skin).toBe('#FF0000');
  });

  test('non-creator cannot be creator if creator exists', () => {
    rm.createRoom('r1', { name: 'T' });
    rm.joinRoom('r1', 'c', { pseudo: 'Creator', colors: {}, isCreator: true });
    const r = rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {}, isCreator: true });
    expect(r.participant.role).toBe('participant');
  });

  test('creator rejoin: same pseudo reconnects as creator', () => {
    rm.createRoom('r1', { name: 'T' });
    rm.joinRoom('r1', 'c1', { pseudo: 'Alice', colors: {}, isCreator: true });
    rm.markDisconnected('r1', 'c1');
    const r = rm.joinRoom('r1', 'c2', { pseudo: 'Alice', colors: {} });
    expect(r.participant.role).toBe('creator');
    expect(r.participant.isAdmin).toBe(true);
  });

  test('position with x/y provided is clamped', () => {
    rm.createRoom('r1', { name: 'T', gridSize: 20 });
    const r = rm.joinRoom('r1', 's1', { pseudo: 'A', colors: {}, isCreator: true, x: 100, y: -5 });
    expect(r.participant.x).toBe(19.5);
    expect(r.participant.y).toBe(0);
  });

  test('closed room returns error', () => {
    rm.createRoom('r1', { name: 'T' });
    rm.joinRoom('r1', 'c', { pseudo: 'A', colors: {}, isCreator: true });
    rm.closeRoom('r1', 'c');
    const r = rm.joinRoom('r1', 's2', { pseudo: 'B', colors: {} });
    expect(r.error).toBe('room_closed');
  });
});

// ===== leaveRoom =====
describe('leaveRoom', () => {
  test('non-existent room returns null', () => {
    expect(rm.leaveRoom('nope', 's1')).toBeNull();
  });

  test('non-existent socket returns null', () => {
    rm.createRoom('r1', { name: 'T' });
    expect(rm.leaveRoom('r1', 'nope')).toBeNull();
  });

  test('leaving clears table association', () => {
    setupRoom();
    rm.createTable('r1', 'creator', { name: 'T1', x: 10, y: 10 });
    const room = rm.getRoom('r1');
    const table = [...room.tables.values()][0];
    table.participants.add('creator');
    room.participants.get('creator').tableId = table.id;
    rm.leaveRoom('r1', 'creator');
    expect(table.participants.has('creator')).toBe(false);
  });

  test('leaving clears raised hand', () => {
    setupRoom();
    rm.toggleRaisedHand('r1', 'creator');
    rm.leaveRoom('r1', 'creator');
    const room = rm.getRoom('r1');
    expect(room.raisedHands.has('creator')).toBe(false);
  });

  test('leaving clears active screen share', () => {
    setupRoom();
    const room = rm.getRoom('r1');
    room.activeScreenShare = { socketId: 'creator' };
    rm.leaveRoom('r1', 'creator');
    expect(room.activeScreenShare).toBeNull();
  });
});

// ===== updatePosition =====
describe('updatePosition', () => {
  beforeEach(() => setupRoom('r1', 20));

  test('NaN x is ignored', () => {
    rm.updatePosition('r1', 'creator', { x: NaN, y: 5 });
    const p = rm.getRoom('r1').participants.get('creator');
    expect(isFinite(p.x)).toBe(true);
    expect(p.y).toBe(5);
  });

  test('Infinity x is ignored', () => {
    rm.updatePosition('r1', 'creator', { x: Infinity, y: 5 });
    const p = rm.getRoom('r1').participants.get('creator');
    expect(p.x).toBeLessThan(20);
  });

  test('-Infinity y is ignored', () => {
    rm.updatePosition('r1', 'creator', { x: 5, y: -Infinity });
    const p = rm.getRoom('r1').participants.get('creator');
    expect(isFinite(p.y)).toBe(true);
  });

  test('negative position clamped to 0', () => {
    rm.updatePosition('r1', 'creator', { x: -100, y: -50 });
    const p = rm.getRoom('r1').participants.get('creator');
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  test('position beyond grid clamped to gs-0.5', () => {
    rm.updatePosition('r1', 'creator', { x: 9999, y: 9999 });
    const p = rm.getRoom('r1').participants.get('creator');
    expect(p.x).toBe(19.5);
    expect(p.y).toBe(19.5);
  });

  test('exact boundary 0 is valid', () => {
    rm.updatePosition('r1', 'creator', { x: 0, y: 0 });
    const p = rm.getRoom('r1').participants.get('creator');
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  test('string x is ignored', () => {
    const old = rm.getRoom('r1').participants.get('creator').x;
    rm.updatePosition('r1', 'creator', { x: 'hello', y: 5 });
    const p = rm.getRoom('r1').participants.get('creator');
    expect(p.x).toBe(old);
  });

  test('direction dx/dy clamped to [-1,1]', () => {
    rm.updatePosition('r1', 'creator', { x: 5, y: 5, direction: { dx: 100, dy: -50 } });
    const p = rm.getRoom('r1').participants.get('creator');
    expect(p.direction.dx).toBe(1);
    expect(p.direction.dy).toBe(-1);
  });

  test('non-existent room returns null', () => {
    expect(rm.updatePosition('nope', 'creator', { x: 5, y: 5 })).toBeNull();
  });

  test('non-existent socket returns null', () => {
    expect(rm.updatePosition('r1', 'nope', { x: 5, y: 5 })).toBeNull();
  });

  test('walkPhase NaN defaults to 0', () => {
    rm.updatePosition('r1', 'creator', { walkPhase: NaN });
    const p = rm.getRoom('r1').participants.get('creator');
    expect(p.walkPhase).toBe(0);
  });
});

// ===== Tables =====
describe('Tables', () => {
  beforeEach(() => setupRoom());

  test('non-admin cannot create table', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    expect(rm.createTable('r1', 'bob', { name: 'T' }).error).toBe('not_admin');
  });

  test('table limit enforced', () => {
    for (let i = 0; i < CONSTANTS.MAX_TABLES_PER_ROOM; i++) {
      rm.createTable('r1', 'creator', { name: `T${i}`, x: 5, y: 5 });
    }
    expect(rm.createTable('r1', 'creator', { name: 'Overflow' }).error).toBe('too_many_tables');
  });

  test('table coordinates clamped', () => {
    const r = rm.createTable('r1', 'creator', { name: 'T', x: 999, y: -10 });
    expect(r.table.x).toBe(19);
    expect(r.table.y).toBe(0);
  });

  test('table width/height clamped 1-10', () => {
    const r = rm.createTable('r1', 'creator', { name: 'T', x: 5, y: 5, width: 0, height: 50 });
    expect(r.table.width).toBe(3); // 0 is falsy → default 3
    expect(r.table.height).toBe(10);
  });

  test('delete non-existent table returns error', () => {
    expect(rm.deleteTable('r1', 'creator', 'nope').error).toBe('table_not_found');
  });

  test('delete table clears participant tableId', () => {
    const r = rm.createTable('r1', 'creator', { name: 'T', x: 10, y: 10 });
    const room = rm.getRoom('r1');
    const table = room.tables.get(r.table.id);
    table.participants.add('creator');
    room.participants.get('creator').tableId = r.table.id;
    rm.deleteTable('r1', 'creator', r.table.id);
    expect(room.participants.get('creator').tableId).toBeNull();
  });

  test('rename table validates name type', () => {
    const r = rm.createTable('r1', 'creator', { name: 'T', x: 5, y: 5 });
    expect(rm.renameTable('r1', 'creator', r.table.id, 123).error).toBe('invalid_name');
    expect(rm.renameTable('r1', 'creator', r.table.id, 'New Name').success).toBe(true);
  });

  test('move table clamps coordinates', () => {
    const r = rm.createTable('r1', 'creator', { name: 'T', x: 5, y: 5 });
    rm.moveTable('r1', 'creator', r.table.id, -5, 999);
    const room = rm.getRoom('r1');
    const table = room.tables.get(r.table.id);
    expect(table.x).toBe(0);
    expect(table.y).toBe(19);
  });
});

// ===== Furniture =====
describe('Furniture', () => {
  beforeEach(() => setupRoom());

  test('non-admin cannot add furniture', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    expect(rm.addFurniture('r1', 'bob', { type: 'desk', x: 5, y: 5 }).error).toBe('not_admin');
  });

  test('furniture limit enforced', () => {
    for (let i = 0; i < CONSTANTS.MAX_FURNITURE_PER_ROOM; i++) {
      rm.addFurniture('r1', 'creator', { type: 'desk', x: 5, y: 5 });
    }
    expect(rm.addFurniture('r1', 'creator', { type: 'desk', x: 5, y: 5 }).error).toBe('too_many_furniture');
  });

  test('furniture coordinates clamped', () => {
    const r = rm.addFurniture('r1', 'creator', { type: 'desk', x: -10, y: 999 });
    expect(r.item.x).toBe(0);
    expect(r.item.y).toBe(19);
  });

  test('furniture type truncated', () => {
    const r = rm.addFurniture('r1', 'creator', { type: 'X'.repeat(100), x: 5, y: 5 });
    expect(r.item.type.length).toBe(50);
  });

  test('remove with invalid id type returns error', () => {
    expect(rm.removeFurniture('r1', 'creator', 123).error).toBe('invalid_id');
  });

  test('remove non-existent furniture succeeds (filter)', () => {
    expect(rm.removeFurniture('r1', 'creator', 'nope').success).toBe(true);
  });
});

// ===== Timers =====
describe('Timers', () => {
  beforeEach(() => setupRoom());

  test('non-admin cannot create timer', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    expect(rm.createTimer('r1', 'bob', { duration: 60 }).error).toBe('not_admin');
  });

  test('duration below 5 clamped to 5', () => {
    const r = rm.createTimer('r1', 'creator', { duration: 1 });
    expect(r.timer.duration).toBe(5);
  });

  test('duration above 3600 clamped to 3600', () => {
    const r = rm.createTimer('r1', 'creator', { duration: 99999 });
    expect(r.timer.duration).toBe(3600);
  });

  test('duration NaN defaults to 300', () => {
    const r = rm.createTimer('r1', 'creator', { duration: NaN });
    expect(r.timer.duration).toBe(300);
  });

  test('duration float is rounded', () => {
    const r = rm.createTimer('r1', 'creator', { duration: 60.7 });
    expect(r.timer.duration).toBe(61);
  });

  test('timer limit enforced', () => {
    for (let i = 0; i < CONSTANTS.MAX_TIMERS_PER_ROOM; i++) {
      rm.createTimer('r1', 'creator', { duration: 60 });
    }
    expect(rm.createTimer('r1', 'creator', { duration: 60 }).error).toBe('too_many_timers');
  });

  test('pause non-existent timer returns error', () => {
    expect(rm.pauseTimer('r1', 'creator', 'nope').error).toBe('not_found');
  });

  test('pause requires admin', () => {
    const t = rm.createTimer('r1', 'creator', { duration: 60 });
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    expect(rm.pauseTimer('r1', 'bob', t.timer.id).error).toBe('not_admin');
  });

  test('pause toggles paused state', () => {
    const t = rm.createTimer('r1', 'creator', { duration: 60 });
    rm.pauseTimer('r1', 'creator', t.timer.id);
    expect(t.timer.paused).toBe(true);
    rm.pauseTimer('r1', 'creator', t.timer.id);
    expect(t.timer.paused).toBe(false);
  });

  test('pause remaining never negative', () => {
    const t = rm.createTimer('r1', 'creator', { duration: 5 });
    // Simulate timer started long ago
    t.timer.startedAt = Date.now() - 999999;
    rm.pauseTimer('r1', 'creator', t.timer.id);
    expect(t.timer.remaining).toBe(0);
  });

  test('invalid timerId type returns error', () => {
    expect(rm.pauseTimer('r1', 'creator', 123).error).toBe('invalid_timer_id');
  });
});

// ===== Admin =====
describe('Admin operations', () => {
  beforeEach(() => setupRoom());

  test('promote non-existent target', () => {
    expect(rm.promoteAdmin('r1', 'creator', 'nope').error).toBe('participant_not_found');
  });

  test('non-admin cannot promote', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.joinRoom('r1', 'carol', { pseudo: 'Carol', colors: {} });
    expect(rm.promoteAdmin('r1', 'bob', 'carol').error).toBe('not_admin');
  });

  test('promote already admin', () => {
    expect(rm.promoteAdmin('r1', 'creator', 'creator').error).toBe('already_admin');
  });

  test('demote requires creator role', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.promoteAdmin('r1', 'creator', 'bob');
    rm.joinRoom('r1', 'carol', { pseudo: 'Carol', colors: {} });
    // Bob is admin but not creator
    expect(rm.demoteAdmin('r1', 'bob', 'carol').error).toBe('not_creator');
  });

  test('cannot demote creator', () => {
    expect(rm.demoteAdmin('r1', 'creator', 'creator').error).toBe('cannot_demote_creator');
  });

  test('kick: admin cannot kick creator', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.promoteAdmin('r1', 'creator', 'bob');
    expect(rm.kickParticipant('r1', 'bob', 'creator').error).toBe('cannot_kick_creator');
  });

  test('kick: creator cannot be kicked (even by self)', () => {
    // cannot_kick_creator check comes before cannot_kick_self
    expect(rm.kickParticipant('r1', 'creator', 'creator').error).toBe('cannot_kick_creator');
  });

  test('kick: non-admin cannot kick', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.joinRoom('r1', 'carol', { pseudo: 'Carol', colors: {} });
    expect(rm.kickParticipant('r1', 'bob', 'carol').error).toBe('not_admin');
  });

  test('closeRoom: only creator can close', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    expect(rm.closeRoom('r1', 'bob').error).toBe('not_creator');
    expect(rm.closeRoom('r1', 'creator').success).toBe(true);
  });
});

// ===== Votes =====
describe('Votes', () => {
  beforeEach(() => setupRoom());

  test('create vote requires admin', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    expect(rm.createVote('r1', 'bob', { question: 'Q?', options: ['A', 'B'] }).error).toBe('not_admin');
  });

  test('vote requires >= 2 options', () => {
    expect(rm.createVote('r1', 'creator', { question: 'Q?', options: ['A'] }).error).toBe('invalid_options');
  });

  test('vote requires <= 20 options', () => {
    const opts = Array.from({ length: 21 }, (_, i) => `O${i}`);
    expect(rm.createVote('r1', 'creator', { question: 'Q?', options: opts }).error).toBe('invalid_options');
  });

  test('cast vote: already voted', () => {
    const v = rm.createVote('r1', 'creator', { question: 'Q?', options: ['A', 'B'] });
    rm.castVote('r1', 'creator', v.vote.id, 0);
    expect(rm.castVote('r1', 'creator', v.vote.id, 1).error).toBe('already_voted');
  });

  test('cast vote: invalid option index', () => {
    const v = rm.createVote('r1', 'creator', { question: 'Q?', options: ['A', 'B'] });
    expect(rm.castVote('r1', 'creator', v.vote.id, 99).error).toBe('invalid_option');
    expect(rm.castVote('r1', 'creator', v.vote.id, -1).error).toBe('invalid_option');
  });

  test('cast vote: ended vote', () => {
    const v = rm.createVote('r1', 'creator', { question: 'Q?', options: ['A', 'B'] });
    rm.endVote('r1', v.vote.id);
    expect(rm.castVote('r1', 'creator', v.vote.id, 0).error).toBe('vote_not_found');
  });

  test('vote limit enforced', () => {
    for (let i = 0; i < CONSTANTS.MAX_VOTES_PER_ROOM; i++) {
      rm.createVote('r1', 'creator', { question: `Q${i}?`, options: ['A', 'B'] });
    }
    expect(rm.createVote('r1', 'creator', { question: 'Overflow?', options: ['A', 'B'] }).error).toBe('too_many_votes');
  });
});

// ===== Whiteboards =====
describe('Whiteboards', () => {
  beforeEach(() => setupRoom());

  test('create whiteboard requires admin', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    expect(rm.createWhiteboard('r1', 'bob', { x: 5, y: 5 }).error).toBe('not_admin');
  });

  test('whiteboard limit', () => {
    for (let i = 0; i < CONSTANTS.MAX_WHITEBOARDS_PER_ROOM; i++) {
      rm.createWhiteboard('r1', 'creator', { x: 5, y: 5 });
    }
    expect(rm.createWhiteboard('r1', 'creator', { x: 5, y: 5 }).error).toBe('too_many_whiteboards');
  });

  test('stroke limit triggers pruning', () => {
    const wb = rm.createWhiteboard('r1', 'creator', { x: 5, y: 5 });
    const room = rm.getRoom('r1');
    const wbObj = [...room.whiteboards.values()][0];
    wbObj.strokes = new Array(CONSTANTS.MAX_WB_STROKES).fill({ points: [] });
    rm.addWhiteboardStroke('r1', wbObj.id, { points: [], socketId: 'creator' });
    expect(wbObj.strokes.length).toBeLessThanOrEqual(CONSTANTS.MAX_WB_STROKES);
  });

  test('clear whiteboard requires admin', () => {
    const wb = rm.createWhiteboard('r1', 'creator', { x: 5, y: 5 });
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    const wbObj = [...rm.getRoom('r1').whiteboards.values()][0];
    expect(rm.clearWhiteboard('r1', 'bob', wbObj.id).error).toBe('not_admin');
  });

  test('undo stroke removes last by socketId', () => {
    const wb = rm.createWhiteboard('r1', 'creator', { x: 5, y: 5 });
    const wbObj = [...rm.getRoom('r1').whiteboards.values()][0];
    rm.addWhiteboardStroke('r1', wbObj.id, { points: [1], socketId: 'creator' });
    rm.addWhiteboardStroke('r1', wbObj.id, { points: [2], socketId: 'other' });
    rm.addWhiteboardStroke('r1', wbObj.id, { points: [3], socketId: 'creator' });
    const result = rm.undoWhiteboardStroke('r1', wbObj.id, 'creator');
    expect(result).not.toBeNull();
    expect(wbObj.strokes.length).toBe(2);
  });
});

// ===== Theme =====
describe('Theme', () => {
  beforeEach(() => setupRoom());

  test('update theme requires admin', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    expect(rm.updateTheme('r1', 'bob', { mode: 'light' }).error).toBe('not_admin');
  });

  test('theme update only allowed keys', () => {
    rm.updateTheme('r1', 'creator', { mode: 'light', hackerKey: 'evil' });
    const room = rm.getRoom('r1');
    expect(room.theme.mode).toBe('light');
    expect(room.theme.hackerKey).toBeUndefined();
  });

  test('theme rejects too-long values', () => {
    rm.updateTheme('r1', 'creator', { mode: 'X'.repeat(100) });
    const room = rm.getRoom('r1');
    expect(room.theme.mode).toBe('dark'); // unchanged
  });
});

// ===== Environment & Grid =====
describe('Environment & Grid', () => {
  beforeEach(() => setupRoom('r1', 30));

  test('change environment requires admin', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    expect(rm.changeEnvironment('r1', 'bob', 'bureau').error).toBe('not_admin');
  });

  test('resize grid repositions out-of-bounds participants', () => {
    rm.updatePosition('r1', 'creator', { x: 25, y: 25 });
    const r = rm.resizeGrid('r1', 'creator', 15);
    expect(r.repositioned).toContain('creator');
    const p = rm.getRoom('r1').participants.get('creator');
    expect(p.x).toBeLessThan(15);
    expect(p.y).toBeLessThan(15);
  });

  test('resize requires admin', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    expect(rm.resizeGrid('r1', 'bob', 50).error).toBe('not_admin');
  });

  test('resize clamps to valid range', () => {
    const r = rm.resizeGrid('r1', 'creator', 5);
    expect(r.newSize).toBe(CONSTANTS.GRID_MIN);
  });
});

// ===== Raised Hands =====
describe('Raised Hands', () => {
  beforeEach(() => setupRoom());

  test('toggle hand twice returns to false', () => {
    rm.toggleRaisedHand('r1', 'creator');
    expect(rm.toggleRaisedHand('r1', 'creator').handRaised).toBe(false);
  });

  test('lower all hands requires admin', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    expect(rm.lowerAllHands('r1', 'bob').error).toBe('not_admin');
  });

  test('lower all hands clears everyone', () => {
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.toggleRaisedHand('r1', 'creator');
    rm.toggleRaisedHand('r1', 'bob');
    rm.lowerAllHands('r1', 'creator');
    const room = rm.getRoom('r1');
    expect(room.raisedHands.size).toBe(0);
  });
});

// ===== Mute =====
describe('Mute', () => {
  beforeEach(() => setupRoom());

  test('set muted', () => {
    expect(rm.setMuted('r1', 'creator', true).isMuted).toBe(true);
    expect(rm.setMuted('r1', 'creator', false).isMuted).toBe(false);
  });

  test('non-existent returns null', () => {
    expect(rm.setMuted('r1', 'nope', true)).toBeNull();
    expect(rm.setMuted('nope', 'creator', true)).toBeNull();
  });
});

// ===== Table Notes =====
describe('Table Notes', () => {
  beforeEach(() => {
    setupRoom();
    rm.createTable('r1', 'creator', { name: 'T1', x: 5, y: 5 });
  });

  test('update and get notes', () => {
    const room = rm.getRoom('r1');
    const tableId = [...room.tables.keys()][0];
    rm.updateTableNotes('r1', tableId, 'Hello world');
    const notes = rm.getTableNotes('r1', tableId);
    expect(notes.content).toBe('Hello world');
  });

  test('notes truncated to max length', () => {
    const room = rm.getRoom('r1');
    const tableId = [...room.tables.keys()][0];
    rm.updateTableNotes('r1', tableId, 'X'.repeat(20000));
    const notes = rm.getTableNotes('r1', tableId);
    expect(notes.content.length).toBe(CONSTANTS.MAX_TABLE_NOTES_LENGTH);
  });

  test('non-string content returns null', () => {
    const room = rm.getRoom('r1');
    const tableId = [...room.tables.keys()][0];
    expect(rm.updateTableNotes('r1', tableId, 123)).toBeNull();
  });
});

// ===== getRoomInfo / getParticipantsList =====
describe('Info methods', () => {
  test('getRoomInfo for non-existent room', () => {
    expect(rm.getRoomInfo('nope')).toBeNull();
  });

  test('getParticipantsList for non-existent room', () => {
    expect(rm.getParticipantsList('nope')).toEqual([]);
  });

  test('getRoom for non-existent room', () => {
    expect(rm.getRoom('nope')).toBeNull();
  });

  test('findSpawnPosition for non-existent room', () => {
    const pos = rm.findSpawnPosition('nope');
    expect(pos.x).toBe(10);
    expect(pos.y).toBe(10);
  });
});

// ===== markDisconnected / markReconnected =====
describe('Disconnect/Reconnect', () => {
  test('markDisconnected non-existent room', () => {
    expect(rm.markDisconnected('nope', 's1')).toBeNull();
  });

  test('markDisconnected non-existent socket', () => {
    rm.createRoom('r1', { name: 'T' });
    expect(rm.markDisconnected('r1', 'nope')).toBeNull();
  });

  test('markReconnected non-existent', () => {
    expect(rm.markReconnected('nope', 's1')).toBeNull();
    rm.createRoom('r1', { name: 'T' });
    expect(rm.markReconnected('r1', 'nope')).toBeNull();
  });
});
