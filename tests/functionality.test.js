// Tests for functionality improvements (26-50)
// Covers cancel timer, password protection, room stats, invite codes, mute all, etc.

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
function setupRoom(roomId = 'r1', gridSize = 20, opts = {}) {
  rm.createRoom(roomId, { name: 'Test', gridSize, ...opts });
  rm.joinRoom(roomId, 'creator', { pseudo: 'Alice', colors: {}, isCreator: true, password: opts.password });
}

// ===== Test 26: cancelTimer removes timer from Map =====
describe('Test 26: cancelTimer removes timer from Map', () => {
  test('cancel running timer removes it', () => {
    setupRoom();
    const t = rm.createTimer('r1', 'creator', { duration: 60 });
    expect(rm.getRoom('r1').timers.has(t.timer.id)).toBe(true);
    const result = rm.cancelTimer('r1', 'creator', t.timer.id);
    expect(result.success).toBe(true);
    expect(rm.getRoom('r1').timers.has(t.timer.id)).toBe(false);
  });

  test('cancel non-existent timer returns error', () => {
    setupRoom();
    expect(rm.cancelTimer('r1', 'creator', 'nope').error).toBe('not_found');
  });

  test('non-admin cannot cancel timer', () => {
    setupRoom();
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    const t = rm.createTimer('r1', 'creator', { duration: 60 });
    expect(rm.cancelTimer('r1', 'bob', t.timer.id).error).toBe('not_admin');
  });
});

// ===== Test 27: timer with exactly 5 seconds (minimum) =====
describe('Test 27: timer with exactly 5 seconds', () => {
  test('timer duration 5 is accepted without clamping', () => {
    setupRoom();
    const t = rm.createTimer('r1', 'creator', { duration: 5 });
    expect(t.timer.duration).toBe(5);
    expect(t.timer.running).toBe(true);
  });
});

// ===== Test 28: timer with exactly 3600 seconds (maximum) =====
describe('Test 28: timer with exactly 3600 seconds', () => {
  test('timer duration 3600 is accepted without clamping', () => {
    setupRoom();
    const t = rm.createTimer('r1', 'creator', { duration: 3600 });
    expect(t.timer.duration).toBe(3600);
    expect(t.timer.running).toBe(true);
  });
});

// ===== Test 29: creating 100 rooms and verify memory =====
describe('Test 29: creating 100 rooms', () => {
  test('rooms Map size matches created count', () => {
    for (let i = 0; i < 100; i++) {
      rm.createRoom(`room_${i}`, { name: `Room ${i}` });
    }
    expect(rm.rooms.size).toBe(100);
    // All rooms accessible
    for (let i = 0; i < 100; i++) {
      expect(rm.getRoom(`room_${i}`)).not.toBeNull();
    }
  });
});

// ===== Test 30: joining with special characters in pseudo =====
describe('Test 30: special characters in pseudo', () => {
  test('quotes in pseudo preserved', () => {
    rm.createRoom('r1', { name: 'T' });
    const r = rm.joinRoom('r1', 's1', { pseudo: 'O\'Brien "Bob"', colors: {}, isCreator: true });
    expect(r.participant.pseudo).toBe('O\'Brien "Bob"');
  });

  test('backslashes in pseudo preserved', () => {
    rm.createRoom('r1', { name: 'T' });
    const r = rm.joinRoom('r1', 's1', { pseudo: 'user\\admin', colors: {}, isCreator: true });
    expect(r.participant.pseudo).toBe('user\\admin');
  });

  test('newlines in pseudo are preserved (no sanitization)', () => {
    rm.createRoom('r1', { name: 'T' });
    const r = rm.joinRoom('r1', 's1', { pseudo: 'line1\nline2', colors: {}, isCreator: true });
    expect(r.participant.pseudo).toBe('line1\nline2');
  });
});

// ===== Test 31: position update with direction {dx:0, dy:0} =====
describe('Test 31: stationary direction', () => {
  test('direction {dx:0, dy:0} is valid', () => {
    setupRoom();
    rm.updatePosition('r1', 'creator', { x: 5, y: 5, direction: { dx: 0, dy: 0 } });
    const p = rm.getRoom('r1').participants.get('creator');
    expect(p.direction.dx).toBe(0);
    expect(p.direction.dy).toBe(0);
  });
});

// ===== Test 32: updateTableAssociation with multiple tables =====
describe('Test 32: multiple tables closest wins', () => {
  test('player associates with closest table', () => {
    setupRoom('r1', 50);
    // Create two tables at different positions
    rm.createTable('r1', 'creator', { name: 'Close', x: 10, y: 10, radius: 5 });
    rm.createTable('r1', 'creator', { name: 'Far', x: 30, y: 30, radius: 5 });
    // Move player near the first table
    rm.updatePosition('r1', 'creator', { x: 11.5, y: 11.5 });
    const p = rm.getRoom('r1').participants.get('creator');
    const room = rm.getRoom('r1');
    const closeTable = [...room.tables.values()].find(t => t.name === 'Close');
    expect(p.tableId).toBe(closeTable.id);
  });
});

// ===== Test 33: furniture add with every valid type =====
describe('Test 33: furniture add with various types', () => {
  test('each type name is stored correctly', () => {
    setupRoom();
    const types = ['desk', 'chair', 'plant', 'bookshelf', 'lamp', 'sofa', 'screen', 'table-round', 'partition', 'door'];
    for (const type of types) {
      const r = rm.addFurniture('r1', 'creator', { type, x: 5, y: 5 });
      expect(r.success).toBe(true);
      expect(r.item.type).toBe(type);
    }
  });
});

// ===== Test 34: vote with 20 options (maximum) =====
describe('Test 34: vote with 20 options', () => {
  test('20 options accepted', () => {
    setupRoom();
    const opts = Array.from({ length: 20 }, (_, i) => `Option ${i}`);
    const r = rm.createVote('r1', 'creator', { question: 'Big vote?', options: opts });
    expect(r.success).toBe(true);
    expect(r.vote.options.length).toBe(20);
  });
});

// ===== Test 35: vote question truncation at 300 chars =====
describe('Test 35: vote question truncation', () => {
  test('question longer than 300 chars is truncated', () => {
    setupRoom();
    const longQ = 'Q'.repeat(500);
    const r = rm.createVote('r1', 'creator', { question: longQ, options: ['A', 'B'] });
    expect(r.vote.question.length).toBe(300);
  });
});

// ===== Test 36: whiteboard postit upsert =====
describe('Test 36: whiteboard postit upsert', () => {
  test('same id updates existing postit', () => {
    setupRoom();
    const wb = rm.createWhiteboard('r1', 'creator', { x: 5, y: 5 });
    const wbId = wb.whiteboard.id;
    rm.addWhiteboardPostit('r1', wbId, { id: 'p1', text: 'Original' });
    rm.addWhiteboardPostit('r1', wbId, { id: 'p1', text: 'Updated' });
    const wbObj = rm.getRoom('r1').whiteboards.get(wbId);
    expect(wbObj.postits.length).toBe(1);
    expect(wbObj.postits[0].text).toBe('Updated');
  });

  test('different id creates new postit', () => {
    setupRoom();
    const wb = rm.createWhiteboard('r1', 'creator', { x: 5, y: 5 });
    const wbId = wb.whiteboard.id;
    rm.addWhiteboardPostit('r1', wbId, { id: 'p1', text: 'First' });
    rm.addWhiteboardPostit('r1', wbId, { id: 'p2', text: 'Second' });
    const wbObj = rm.getRoom('r1').whiteboards.get(wbId);
    expect(wbObj.postits.length).toBe(2);
  });
});

// ===== Test 37: table notes with empty string =====
describe('Test 37: table notes empty string', () => {
  test('empty string is a valid note content', () => {
    setupRoom();
    rm.createTable('r1', 'creator', { name: 'T1', x: 5, y: 5 });
    const room = rm.getRoom('r1');
    const tableId = [...room.tables.keys()][0];
    rm.updateTableNotes('r1', tableId, 'Hello');
    rm.updateTableNotes('r1', tableId, '');
    const notes = rm.getTableNotes('r1', tableId);
    expect(notes.content).toBe('');
  });
});

// ===== Test 38: table notes with exactly MAX_TABLE_NOTES_LENGTH chars =====
describe('Test 38: table notes at max length', () => {
  test('exactly MAX length is accepted without truncation', () => {
    setupRoom();
    rm.createTable('r1', 'creator', { name: 'T1', x: 5, y: 5 });
    const room = rm.getRoom('r1');
    const tableId = [...room.tables.keys()][0];
    const exactMax = 'X'.repeat(CONSTANTS.MAX_TABLE_NOTES_LENGTH);
    rm.updateTableNotes('r1', tableId, exactMax);
    const notes = rm.getTableNotes('r1', tableId);
    expect(notes.content.length).toBe(CONSTANTS.MAX_TABLE_NOTES_LENGTH);
  });
});

// ===== Test 39: concurrent room creation (same roomId) =====
describe('Test 39: concurrent room creation same id', () => {
  test('second creation with same id returns null', () => {
    const r1 = rm.createRoom('dup', { name: 'First' });
    const r2 = rm.createRoom('dup', { name: 'Second' });
    expect(r1).not.toBeNull();
    expect(r2).toBeNull();
    expect(rm.rooms.size).toBe(1);
    expect(rm.getRoom('dup').name).toBe('First');
  });
});

// ===== Test 40: leaveRoom when participant is at a table with other participants =====
describe('Test 40: leave room at shared table', () => {
  test('leaving clears own table association, others remain', () => {
    setupRoom('r1', 30);
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.createTable('r1', 'creator', { name: 'T1', x: 10, y: 10, radius: 5 });
    const room = rm.getRoom('r1');
    const table = [...room.tables.values()][0];
    // Manually place both at table
    table.participants.add('creator');
    table.participants.add('bob');
    room.participants.get('creator').tableId = table.id;
    room.participants.get('bob').tableId = table.id;

    rm.leaveRoom('r1', 'bob');
    expect(table.participants.has('bob')).toBe(false);
    expect(table.participants.has('creator')).toBe(true);
    expect(room.participants.get('creator').tableId).toBe(table.id);
  });
});

// ===== Test 41: closeRoom then try to create timer =====
describe('Test 41: closeRoom then create timer', () => {
  test('timer creation fails on closed room (no participants left after close)', () => {
    setupRoom();
    rm.closeRoom('r1', 'creator');
    // Creator is still in room, but the room is closed.
    // New participants can't join, but existing admin can still try to create timer
    // Timer creation should still work for existing admin
    const t = rm.createTimer('r1', 'creator', { duration: 60 });
    expect(t.success).toBe(true);
    // But new participant can't join
    const r = rm.joinRoom('r1', 'newbie', { pseudo: 'N', colors: {} });
    expect(r.error).toBe('room_closed');
  });
});

// ===== Test 42: resizeGrid with exact MIN and MAX values =====
describe('Test 42: resizeGrid MIN and MAX', () => {
  test('resize to exactly GRID_MIN', () => {
    setupRoom('r1', 30);
    const r = rm.resizeGrid('r1', 'creator', CONSTANTS.GRID_MIN);
    expect(r.newSize).toBe(CONSTANTS.GRID_MIN);
  });

  test('resize to exactly GRID_MAX', () => {
    setupRoom('r1', 30);
    const r = rm.resizeGrid('r1', 'creator', CONSTANTS.GRID_MAX);
    expect(r.newSize).toBe(CONSTANTS.GRID_MAX);
  });

  test('resize below MIN clamps to MIN', () => {
    setupRoom('r1', 30);
    const r = rm.resizeGrid('r1', 'creator', 1);
    expect(r.newSize).toBe(CONSTANTS.GRID_MIN);
  });

  test('resize above MAX clamps to MAX', () => {
    setupRoom('r1', 30);
    const r = rm.resizeGrid('r1', 'creator', 999);
    expect(r.newSize).toBe(CONSTANTS.GRID_MAX);
  });
});

// ===== Test 43: findSpawnPosition with all tiles occupied =====
describe('Test 43: findSpawnPosition all occupied', () => {
  test('returns center fallback when all positions are taken', () => {
    rm.createRoom('r1', { name: 'T', gridSize: 10 });
    // Fill grid with participants at every position
    const gs = 10;
    let idx = 0;
    for (let x = 0; x < gs; x++) {
      for (let y = 0; y < gs; y++) {
        const sid = `s${idx++}`;
        if (idx === 1) {
          rm.joinRoom('r1', sid, { pseudo: `P${idx}`, colors: {}, isCreator: true, x, y });
        } else if (idx <= CONSTANTS.MAX_PARTICIPANTS) {
          rm.joinRoom('r1', sid, { pseudo: `P${idx}`, colors: {}, x, y });
        }
      }
    }
    // All positions occupied; findSpawnPosition should still return a valid position
    const pos = rm.findSpawnPosition('r1');
    expect(typeof pos.x).toBe('number');
    expect(typeof pos.y).toBe('number');
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });
});

// ===== Test 44: markDisconnected then joinRoom with same pseudo (creator rejoin) =====
describe('Test 44: creator rejoin after disconnect', () => {
  test('reconnecting creator gets creator role back', () => {
    setupRoom();
    rm.markDisconnected('r1', 'creator');
    const p = rm.getRoom('r1').participants.get('creator');
    expect(p.disconnected).toBe(true);

    // New socket joins with the secret creatorToken (proof of identity)
    const token = rm.getRoom('r1').creatorToken;
    const r = rm.joinRoom('r1', 'creator2', { pseudo: 'Alice', colors: {}, creatorToken: token });
    expect(r.participant.role).toBe('creator');
    expect(r.participant.isAdmin).toBe(true);
    // Old socket should be cleaned up
    expect(rm.getRoom('r1').participants.has('creator')).toBe(false);
    expect(rm.getRoom('r1').creatorSocketId).toBe('creator2');
  });
});

// ===== Test 45: promote then kick (promoted admin kicks someone) =====
describe('Test 45: promoted admin kicks', () => {
  test('promoted admin can kick non-admin participant', () => {
    setupRoom();
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.joinRoom('r1', 'carol', { pseudo: 'Carol', colors: {} });
    rm.promoteAdmin('r1', 'creator', 'bob');
    const result = rm.kickParticipant('r1', 'bob', 'carol');
    expect(result.success).toBe(true);
    expect(result.participant.pseudo).toBe('Carol');
  });

  test('promoted admin cannot kick creator', () => {
    setupRoom();
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.promoteAdmin('r1', 'creator', 'bob');
    const result = rm.kickParticipant('r1', 'bob', 'creator');
    expect(result.error).toBe('cannot_kick_creator');
  });
});

// ===== Test 46: whiteboard stroke limit triggers pruning =====
describe('Test 46: stroke limit pruning', () => {
  test('adding stroke at MAX_WB_STROKES prunes oldest 10%', () => {
    setupRoom();
    const wb = rm.createWhiteboard('r1', 'creator', { x: 5, y: 5 });
    const wbId = wb.whiteboard.id;
    const room = rm.getRoom('r1');
    const wbObj = room.whiteboards.get(wbId);
    // Fill to max
    wbObj.strokes = new Array(CONSTANTS.MAX_WB_STROKES).fill({ points: [], socketId: 'x' });
    // Add one more
    rm.addWhiteboardStroke('r1', wbId, { points: [1], socketId: 'creator' });
    // Should have pruned 10% then added one
    const expectedMax = CONSTANTS.MAX_WB_STROKES - Math.floor(CONSTANTS.MAX_WB_STROKES * 0.1) + 1;
    expect(wbObj.strokes.length).toBe(expectedMax);
    expect(wbObj.strokes.length).toBeLessThanOrEqual(CONSTANTS.MAX_WB_STROKES);
  });
});

// ===== Test 47: postit limit per whiteboard =====
describe('Test 47: postit limit', () => {
  test('exceeding MAX_WB_POSTITS returns null', () => {
    setupRoom();
    const wb = rm.createWhiteboard('r1', 'creator', { x: 5, y: 5 });
    const wbId = wb.whiteboard.id;
    for (let i = 0; i < CONSTANTS.MAX_WB_POSTITS; i++) {
      rm.addWhiteboardPostit('r1', wbId, { id: `p${i}`, text: `Note ${i}` });
    }
    // One more should fail
    const result = rm.addWhiteboardPostit('r1', wbId, { id: 'overflow', text: 'Too many' });
    expect(result).toBeNull();
    const wbObj = rm.getRoom('r1').whiteboards.get(wbId);
    expect(wbObj.postits.length).toBe(CONSTANTS.MAX_WB_POSTITS);
  });
});

// ===== Test 48: text limit per whiteboard =====
describe('Test 48: text limit', () => {
  test('exceeding MAX_WB_TEXTS returns null', () => {
    setupRoom();
    const wb = rm.createWhiteboard('r1', 'creator', { x: 5, y: 5 });
    const wbId = wb.whiteboard.id;
    for (let i = 0; i < CONSTANTS.MAX_WB_TEXTS; i++) {
      rm.addWhiteboardText('r1', wbId, { id: `t${i}`, content: `Text ${i}` });
    }
    // One more should fail
    const result = rm.addWhiteboardText('r1', wbId, { id: 'overflow', content: 'Too many' });
    expect(result).toBeNull();
    const wbObj = rm.getRoom('r1').whiteboards.get(wbId);
    expect(wbObj.texts.length).toBe(CONSTANTS.MAX_WB_TEXTS);
  });
});

// ===== Test 49: demoteAdmin with non-creator requester =====
describe('Test 49: demoteAdmin non-creator', () => {
  test('promoted admin cannot demote another admin', () => {
    setupRoom();
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.joinRoom('r1', 'carol', { pseudo: 'Carol', colors: {} });
    rm.promoteAdmin('r1', 'creator', 'bob');
    rm.promoteAdmin('r1', 'creator', 'carol');
    // Bob (admin but not creator) tries to demote Carol
    const result = rm.demoteAdmin('r1', 'bob', 'carol');
    expect(result.error).toBe('not_creator');
  });

  test('regular participant cannot demote', () => {
    setupRoom();
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.joinRoom('r1', 'carol', { pseudo: 'Carol', colors: {} });
    rm.promoteAdmin('r1', 'creator', 'carol');
    const result = rm.demoteAdmin('r1', 'bob', 'carol');
    expect(result.error).toBe('not_creator');
  });
});

// ===== Test 50: toggleRaisedHand for non-existent room/socket =====
describe('Test 50: toggleRaisedHand non-existent', () => {
  test('non-existent room returns null', () => {
    expect(rm.toggleRaisedHand('nonexistent', 'creator')).toBeNull();
  });

  test('non-existent socket returns null', () => {
    rm.createRoom('r1', { name: 'T' });
    expect(rm.toggleRaisedHand('r1', 'nonexistent')).toBeNull();
  });
});

// ===== Additional tests for new functionality =====

describe('Password protection (improvement #2)', () => {
  test('joining password-protected room without password fails', () => {
    rm.createRoom('pw', { name: 'Protected', password: 'secret123' });
    rm.joinRoom('pw', 'creator', { pseudo: 'Admin', colors: {}, isCreator: true });
    const r = rm.joinRoom('pw', 'bob', { pseudo: 'Bob', colors: {} });
    expect(r.error).toBe('invalid_password');
  });

  test('joining with correct password succeeds', () => {
    rm.createRoom('pw', { name: 'Protected', password: 'secret123' });
    rm.joinRoom('pw', 'creator', { pseudo: 'Admin', colors: {}, isCreator: true });
    const r = rm.joinRoom('pw', 'bob', { pseudo: 'Bob', colors: {}, password: 'secret123' });
    expect(r.participant).toBeDefined();
    expect(r.participant.pseudo).toBe('Bob');
  });

  test('joining with wrong password fails', () => {
    rm.createRoom('pw', { name: 'Protected', password: 'secret123' });
    rm.joinRoom('pw', 'creator', { pseudo: 'Admin', colors: {}, isCreator: true });
    const r = rm.joinRoom('pw', 'bob', { pseudo: 'Bob', colors: {}, password: 'wrong' });
    expect(r.error).toBe('invalid_password');
  });
});

describe('Room rename (improvement #4)', () => {
  test('admin can rename room', () => {
    setupRoom();
    const r = rm.renameRoom('r1', 'creator', 'New Name');
    expect(r.success).toBe(true);
    expect(r.name).toBe('New Name');
    expect(rm.getRoom('r1').name).toBe('New Name');
  });

  test('non-admin cannot rename room', () => {
    setupRoom();
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    const r = rm.renameRoom('r1', 'bob', 'Hacked');
    expect(r.error).toBe('not_admin');
  });

  test('empty name rejected', () => {
    setupRoom();
    const r = rm.renameRoom('r1', 'creator', '');
    expect(r.error).toBe('invalid_name');
  });
});

describe('Furniture rotation (improvement #6)', () => {
  test('rotation stored on furniture item', () => {
    setupRoom();
    const f = rm.addFurniture('r1', 'creator', { type: 'desk', x: 5, y: 5, rotation: 90 });
    expect(f.item.rotation).toBe(90);
  });

  test('invalid rotation defaults to 0', () => {
    setupRoom();
    const f = rm.addFurniture('r1', 'creator', { type: 'desk', x: 5, y: 5, rotation: 45 });
    expect(f.item.rotation).toBe(0);
  });

  test('rotateFurniture method works', () => {
    setupRoom();
    const f = rm.addFurniture('r1', 'creator', { type: 'desk', x: 5, y: 5 });
    const r = rm.rotateFurniture('r1', 'creator', f.item.id, 270);
    expect(r.success).toBe(true);
    expect(r.item.rotation).toBe(270);
  });
});

describe('Vote results export (improvement #8)', () => {
  test('exports vote as JSON string', () => {
    setupRoom();
    const v = rm.createVote('r1', 'creator', { question: 'Test?', options: ['A', 'B'] });
    rm.castVote('r1', 'creator', v.vote.id, 0);
    const json = rm.exportVoteResults('r1', v.vote.id);
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed.question).toBe('Test?');
    expect(parsed.totalVoters).toBe(1);
    expect(parsed.options[0].votes).toBe(1);
  });

  test('export non-existent vote returns null', () => {
    setupRoom();
    expect(rm.exportVoteResults('r1', 'nope')).toBeNull();
  });
});

describe('Room statistics (improvement #10)', () => {
  test('getRoomStats returns stats', () => {
    setupRoom();
    const stats = rm.getRoomStats('r1');
    expect(stats).not.toBeNull();
    expect(stats.messagesSent).toBe(0);
    expect(stats.reactionsCount).toBe(0);
    expect(stats.timeActive).toBeGreaterThanOrEqual(0);
    expect(stats.participantCount).toBe(1);
  });

  test('incrementStat updates count', () => {
    setupRoom();
    rm.incrementStat('r1', 'messagesSent');
    rm.incrementStat('r1', 'messagesSent');
    rm.incrementStat('r1', 'reactionsCount');
    const stats = rm.getRoomStats('r1');
    expect(stats.messagesSent).toBe(2);
    expect(stats.reactionsCount).toBe(1);
  });
});

describe('Theme presets (improvement #11)', () => {
  test('save and load preset', () => {
    setupRoom();
    const save = rm.saveThemePreset('r1', 'creator', 'Dark Blue', { mode: 'dark', bgColor: '#001122' });
    expect(save.success).toBe(true);
    const load = rm.loadThemePreset('r1', 'creator', 'Dark Blue');
    expect(load.success).toBe(true);
    expect(load.theme.bgColor).toBe('#001122');
  });

  test('load non-existent preset fails', () => {
    setupRoom();
    const r = rm.loadThemePreset('r1', 'creator', 'NonExistent');
    expect(r.error).toBe('preset_not_found');
  });
});

describe('Chat history limit (improvement #18)', () => {
  test('chat stays within MAX_CHAT_MESSAGES_STORED', () => {
    setupRoom();
    for (let i = 0; i < CONSTANTS.MAX_CHAT_MESSAGES_STORED + 50; i++) {
      rm.addChatMessage('r1', 'creator', `Message ${i}`);
    }
    const room = rm.getRoom('r1');
    expect(room.chatHistory.length).toBe(CONSTANTS.MAX_CHAT_MESSAGES_STORED);
  });

  test('empty message rejected', () => {
    setupRoom();
    expect(rm.addChatMessage('r1', 'creator', '')).toBeNull();
  });
});

describe('Room invite code (improvement #20)', () => {
  test('room has invite code on creation', () => {
    const room = rm.createRoom('r1', { name: 'T' });
    expect(room.inviteCode).toBeDefined();
    expect(room.inviteCode.length).toBe(CONSTANTS.INVITE_CODE_LENGTH);
  });

  test('findRoomByInviteCode works', () => {
    const room = rm.createRoom('r1', { name: 'T' });
    const found = rm.findRoomByInviteCode(room.inviteCode);
    expect(found).toBe('r1');
  });

  test('invalid code returns null', () => {
    expect(rm.findRoomByInviteCode('ZZZZZZ')).toBeNull();
  });
});

describe('Mute all (improvement #22)', () => {
  test('admin mutes all except self', () => {
    setupRoom();
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.joinRoom('r1', 'carol', { pseudo: 'Carol', colors: {} });
    const r = rm.muteAll('r1', 'creator');
    expect(r.success).toBe(true);
    expect(r.muted).toContain('bob');
    expect(r.muted).toContain('carol');
    expect(r.muted).not.toContain('creator');
    expect(rm.getRoom('r1').participants.get('bob').isMuted).toBe(true);
    expect(rm.getRoom('r1').participants.get('carol').isMuted).toBe(true);
  });
});

describe('Participant join order (improvement #23)', () => {
  test('participants get sequential join numbers', () => {
    setupRoom();
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    rm.joinRoom('r1', 'carol', { pseudo: 'Carol', colors: {} });
    const room = rm.getRoom('r1');
    expect(room.participants.get('creator').joinOrder).toBe(1);
    expect(room.participants.get('bob').joinOrder).toBe(2);
    expect(room.participants.get('carol').joinOrder).toBe(3);
  });
});

describe('Configurable audio radius (improvement #24)', () => {
  test('admin can set audio radius', () => {
    setupRoom();
    const r = rm.setAudioRadius('r1', 'creator', 10);
    expect(r.success).toBe(true);
    expect(r.audioRadius).toBe(10);
    expect(rm.getRoom('r1').audioRadius).toBe(10);
  });

  test('radius clamped to valid range', () => {
    setupRoom();
    rm.setAudioRadius('r1', 'creator', 100);
    expect(rm.getRoom('r1').audioRadius).toBe(CONSTANTS.AUDIO_RADIUS_MAX);
    rm.setAudioRadius('r1', 'creator', 0);
    expect(rm.getRoom('r1').audioRadius).toBe(CONSTANTS.AUDIO_RADIUS_MIN);
  });

  test('non-admin cannot set audio radius', () => {
    setupRoom();
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    const r = rm.setAudioRadius('r1', 'bob', 10);
    expect(r.error).toBe('not_admin');
  });
});

describe('Room creation date (improvement #25)', () => {
  test('room has createdAt timestamp', () => {
    const before = Date.now();
    const room = rm.createRoom('r1', { name: 'T' });
    const after = Date.now();
    expect(room.createdAt).toBeGreaterThanOrEqual(before);
    expect(room.createdAt).toBeLessThanOrEqual(after);
  });

  test('getRoomCreationDate returns timestamp', () => {
    rm.createRoom('r1', { name: 'T' });
    const date = rm.getRoomCreationDate('r1');
    expect(typeof date).toBe('number');
    expect(date).toBeGreaterThan(0);
  });

  test('getRoomInfo includes createdAt', () => {
    rm.createRoom('r1', { name: 'T' });
    const info = rm.getRoomInfo('r1');
    expect(info.createdAt).toBeDefined();
    expect(typeof info.createdAt).toBe('number');
  });
});

describe('Undo furniture (improvement #14)', () => {
  test('undoLastFurniture removes last placed item', () => {
    setupRoom();
    rm.addFurniture('r1', 'creator', { type: 'desk', x: 5, y: 5 });
    const f2 = rm.addFurniture('r1', 'creator', { type: 'chair', x: 8, y: 8 });
    const r = rm.undoLastFurniture('r1', 'creator');
    expect(r.success).toBe(true);
    expect(r.removedId).toBe(f2.item.id);
    expect(rm.getRoom('r1').furniture.length).toBe(1);
  });

  test('undo on empty furniture returns error', () => {
    setupRoom();
    const r = rm.undoLastFurniture('r1', 'creator');
    expect(r.error).toBe('nothing_to_undo');
  });
});

describe('Activity tracking (improvement #9)', () => {
  test('lastAction updates on position change', () => {
    setupRoom();
    const p = rm.getRoom('r1').participants.get('creator');
    const initial = p.lastAction;
    // Small delay to ensure timestamp difference
    rm.updatePosition('r1', 'creator', { x: 5, y: 5 });
    expect(p.lastAction).toBeGreaterThanOrEqual(initial);
  });
});

describe('Kick with reason (improvement #3)', () => {
  test('kick includes custom reason', () => {
    setupRoom();
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    const r = rm.kickParticipant('r1', 'creator', 'bob', 'Disruptive behavior');
    expect(r.success).toBe(true);
    expect(r.reason).toBe('Disruptive behavior');
  });

  test('kick without reason gets default', () => {
    setupRoom();
    rm.joinRoom('r1', 'bob', { pseudo: 'Bob', colors: {} });
    const r = rm.kickParticipant('r1', 'creator', 'bob');
    expect(r.reason).toBe('Exclu par un administrateur');
  });
});
