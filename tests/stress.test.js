// Stress tests: simulates high-load scenarios
// Tests room-manager under concurrent load without socket.io overhead

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

function setupRoom(roomId = 'stress', gridSize = 100) {
  rm.createRoom(roomId, { name: 'Stress Test', gridSize });
  rm.joinRoom(roomId, 'creator', { pseudo: 'Admin', colors: {}, isCreator: true });
}

describe('Stress: Mass join', () => {
  test('fill room to MAX_PARTICIPANTS', () => {
    setupRoom();
    for (let i = 1; i < CONSTANTS.MAX_PARTICIPANTS; i++) {
      const r = rm.joinRoom('stress', `s${i}`, { pseudo: `P${i}`, colors: {} });
      expect(r.participant).toBeDefined();
    }
    const room = rm.getRoom('stress');
    expect(room.participants.size).toBe(CONSTANTS.MAX_PARTICIPANTS);
  });

  test('51st participant rejected', () => {
    setupRoom();
    for (let i = 1; i < CONSTANTS.MAX_PARTICIPANTS; i++) {
      rm.joinRoom('stress', `s${i}`, { pseudo: `P${i}`, colors: {} });
    }
    const r = rm.joinRoom('stress', 'overflow', { pseudo: 'Overflow', colors: {} });
    expect(r.error).toBe('room_full');
  });

  test('participants list has correct count', () => {
    setupRoom();
    for (let i = 1; i < 30; i++) {
      rm.joinRoom('stress', `s${i}`, { pseudo: `P${i}`, colors: {} });
    }
    const list = rm.getParticipantsList('stress');
    expect(list.length).toBe(30);
  });
});

describe('Stress: Position update flood', () => {
  test('50 users × 100 position updates', () => {
    setupRoom('pos', 100);
    // Join 49 more users
    for (let i = 1; i < 50; i++) {
      rm.joinRoom('pos', `s${i}`, { pseudo: `P${i}`, colors: {} });
    }

    // Each user sends 100 position updates
    for (let i = 0; i < 50; i++) {
      const sid = i === 0 ? 'creator' : `s${i}`;
      for (let j = 0; j < 100; j++) {
        rm.updatePosition('pos', sid, {
          x: Math.random() * 99,
          y: Math.random() * 99,
          direction: { dx: 1, dy: 0 },
          isWalking: true,
          walkPhase: Math.random(),
        });
      }
    }

    // All positions should be valid
    const room = rm.getRoom('pos');
    for (const [, p] of room.participants) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(99.5);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(99.5);
      expect(isFinite(p.x)).toBe(true);
      expect(isFinite(p.y)).toBe(true);
    }
  });

  test('adversarial position values', () => {
    setupRoom('adv', 20);
    const badValues = [NaN, Infinity, -Infinity, -9999, 9999, null, undefined, 'abc', {}, [], true];
    for (const val of badValues) {
      rm.updatePosition('adv', 'creator', { x: val, y: val });
      const p = rm.getRoom('adv').participants.get('creator');
      expect(isFinite(p.x)).toBe(true);
      expect(isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Stress: Rapid connect/disconnect cycles', () => {
  test('100 users join and leave 3 times', () => {
    setupRoom('cycle', 100);

    for (let round = 0; round < 3; round++) {
      // Join 100 users
      for (let i = 0; i < 49; i++) {
        rm.joinRoom('cycle', `s${round}_${i}`, { pseudo: `P${i}`, colors: {} });
      }
      // Leave all
      for (let i = 0; i < 49; i++) {
        rm.leaveRoom('cycle', `s${round}_${i}`);
      }
    }

    // Only creator should remain
    const room = rm.getRoom('cycle');
    expect(room.participants.size).toBe(1);
    expect(room.participants.has('creator')).toBe(true);
  });

  test('disconnect then reconnect preserves state', () => {
    setupRoom('recon', 20);
    rm.updatePosition('recon', 'creator', { x: 15, y: 15 });
    rm.markDisconnected('recon', 'creator');
    const p = rm.getRoom('recon').participants.get('creator');
    expect(p.disconnected).toBe(true);
    expect(p.x).toBe(15);

    rm.markReconnected('recon', 'creator');
    expect(p.disconnected).toBe(false);
    expect(p.x).toBe(15);
  });
});

describe('Stress: Concurrent admin actions', () => {
  test('5 admins create timers simultaneously', () => {
    setupRoom('admin', 100);
    // Promote 4 more admins
    for (let i = 1; i <= 4; i++) {
      rm.joinRoom('admin', `a${i}`, { pseudo: `Admin${i}`, colors: {} });
      rm.promoteAdmin('admin', 'creator', `a${i}`);
    }

    // All 5 create timers
    const results = [];
    for (let i = 0; i <= 4; i++) {
      const sid = i === 0 ? 'creator' : `a${i}`;
      results.push(rm.createTimer('admin', sid, { duration: 60 }));
    }

    // All should succeed
    for (const r of results) {
      expect(r.success).toBe(true);
    }
    expect(rm.getRoom('admin').timers.size).toBe(5);
  });

  test('promote then immediately demote', () => {
    setupRoom('pd');
    rm.joinRoom('pd', 'bob', { pseudo: 'Bob', colors: {} });
    rm.promoteAdmin('pd', 'creator', 'bob');
    expect(rm.getRoom('pd').participants.get('bob').isAdmin).toBe(true);
    rm.demoteAdmin('pd', 'creator', 'bob');
    expect(rm.getRoom('pd').participants.get('bob').isAdmin).toBe(false);
  });
});

describe('Stress: Furniture operations', () => {
  test('add MAX furniture items', () => {
    setupRoom('furn', 100);
    for (let i = 0; i < CONSTANTS.MAX_FURNITURE_PER_ROOM; i++) {
      const r = rm.addFurniture('furn', 'creator', {
        type: 'desk',
        x: i % 99,
        y: Math.floor(i / 99),
      });
      expect(r.success).toBe(true);
    }
    expect(rm.getRoom('furn').furniture.length).toBe(CONSTANTS.MAX_FURNITURE_PER_ROOM);

    // One more should fail
    expect(rm.addFurniture('furn', 'creator', { type: 'desk', x: 0, y: 0 }).error).toBe('too_many_furniture');
  });

  test('remove all furniture', () => {
    setupRoom('furn2', 20);
    const ids = [];
    for (let i = 0; i < 50; i++) {
      const r = rm.addFurniture('furn2', 'creator', { type: 'desk', x: 5, y: 5 });
      ids.push(r.item.id);
    }
    for (const id of ids) {
      rm.removeFurniture('furn2', 'creator', id);
    }
    expect(rm.getRoom('furn2').furniture.length).toBe(0);
  });
});

describe('Stress: Timer operations under load', () => {
  test('create timer, pause/unpause rapidly', () => {
    setupRoom('timer');
    const t = rm.createTimer('timer', 'creator', { duration: 300 });
    const timerId = t.timer.id;

    // Rapid pause/unpause 100 times
    for (let i = 0; i < 100; i++) {
      rm.pauseTimer('timer', 'creator', timerId);
    }

    // Timer should still be valid
    const timer = rm.getRoom('timer').timers.get(timerId);
    expect(timer).toBeDefined();
    expect(timer.running).toBe(true);
    expect(isFinite(timer.remaining)).toBe(true);
    expect(timer.remaining).toBeGreaterThanOrEqual(0);
  });
});

describe('Stress: Votes under load', () => {
  test('50 users vote on same poll', () => {
    setupRoom('vote', 100);
    const v = rm.createVote('vote', 'creator', {
      question: 'Best color?',
      options: ['Red', 'Blue', 'Green'],
    });

    // 49 more users join and vote
    for (let i = 1; i < 50; i++) {
      rm.joinRoom('vote', `s${i}`, { pseudo: `P${i}`, colors: {} });
      const r = rm.castVote('vote', `s${i}`, v.vote.id, i % 3);
      expect(r.success).toBe(true);
    }

    // Creator votes too
    rm.castVote('vote', 'creator', v.vote.id, 0);

    // Verify totals
    const room = rm.getRoom('vote');
    const vote = room.votes.get(v.vote.id);
    const totalVotes = vote.options.reduce((sum, o) => sum + o.votes, 0);
    expect(totalVotes).toBe(50);
    expect(vote.voters.size).toBe(50);
  });

  test('double vote rejected', () => {
    setupRoom('dv');
    const v = rm.createVote('dv', 'creator', { question: 'Q?', options: ['A', 'B'] });
    rm.castVote('dv', 'creator', v.vote.id, 0);
    expect(rm.castVote('dv', 'creator', v.vote.id, 1).error).toBe('already_voted');
  });
});

describe('Stress: Whiteboard operations', () => {
  test('500 strokes per whiteboard', () => {
    setupRoom('wb');
    const wb = rm.createWhiteboard('wb', 'creator', { x: 5, y: 5 });
    const wbId = wb.whiteboard.id;

    for (let i = 0; i < 500; i++) {
      rm.addWhiteboardStroke('wb', wbId, {
        points: [{ x: i, y: i }],
        color: '#000',
        width: 2,
        socketId: 'creator',
      });
    }

    const room = rm.getRoom('wb');
    const wbObj = room.whiteboards.get(wbId);
    expect(wbObj.strokes.length).toBe(500);
  });

  test('postit upsert (same id updates, new id creates)', () => {
    setupRoom('pi');
    const wb = rm.createWhiteboard('pi', 'creator', { x: 5, y: 5 });
    const wbId = wb.whiteboard.id;

    // Create 10 post-its
    for (let i = 0; i < 10; i++) {
      rm.addWhiteboardPostit('pi', wbId, { id: `p${i}`, text: `Original ${i}` });
    }

    // Update 5 of them
    for (let i = 0; i < 5; i++) {
      rm.addWhiteboardPostit('pi', wbId, { id: `p${i}`, text: `Updated ${i}` });
    }

    const room = rm.getRoom('pi');
    const wbObj = room.whiteboards.get(wbId);
    expect(wbObj.postits.length).toBe(10); // not 15
    expect(wbObj.postits[0].text).toBe('Updated 0');
  });
});

describe('Stress: Multiple rooms isolation', () => {
  test('10 rooms with 10 users each, independent state', () => {
    for (let r = 0; r < 10; r++) {
      rm.createRoom(`room${r}`, { name: `Room ${r}`, gridSize: 20 });
      for (let u = 0; u < 10; u++) {
        rm.joinRoom(`room${r}`, `r${r}u${u}`, {
          pseudo: `User${u}`,
          colors: {},
          isCreator: u === 0,
        });
      }
    }

    // Each room has 10 participants
    for (let r = 0; r < 10; r++) {
      expect(rm.getRoom(`room${r}`).participants.size).toBe(10);
    }

    // Leave all from room0, others unaffected
    for (let u = 0; u < 10; u++) {
      rm.leaveRoom('room0', `r0u${u}`);
    }
    expect(rm.getRoom('room0').participants.size).toBe(0);
    expect(rm.getRoom('room1').participants.size).toBe(10);
  });
});

describe('Stress: Memory - join then leave all', () => {
  test('room cleans up after all leave', () => {
    setupRoom('mem', 100);
    // Add 49 more
    for (let i = 1; i < 50; i++) {
      rm.joinRoom('mem', `s${i}`, { pseudo: `P${i}`, colors: {} });
    }
    // Create tables, furniture, timers
    rm.createTable('mem', 'creator', { name: 'T1', x: 5, y: 5 });
    rm.addFurniture('mem', 'creator', { type: 'desk', x: 3, y: 3 });
    rm.createTimer('mem', 'creator', { duration: 60 });

    // Everyone leaves
    for (let i = 1; i < 50; i++) {
      rm.leaveRoom('mem', `s${i}`);
    }
    rm.leaveRoom('mem', 'creator');

    expect(rm.getRoom('mem').participants.size).toBe(0);
  });
});

describe('Stress: Mixed operations', () => {
  test('20 users doing different things', () => {
    setupRoom('mix', 100);
    for (let i = 1; i < 20; i++) {
      rm.joinRoom('mix', `s${i}`, { pseudo: `P${i}`, colors: {} });
    }

    // User 1-5: move around
    for (let i = 1; i <= 5; i++) {
      for (let j = 0; j < 20; j++) {
        rm.updatePosition('mix', `s${i}`, { x: Math.random() * 99, y: Math.random() * 99 });
      }
    }

    // Creator: create tables
    for (let i = 0; i < 5; i++) {
      rm.createTable('mix', 'creator', { name: `T${i}`, x: i * 10, y: i * 10 });
    }

    // Creator: add furniture
    for (let i = 0; i < 10; i++) {
      rm.addFurniture('mix', 'creator', { type: 'desk', x: i * 5, y: i * 5 });
    }

    // Creator: create vote
    rm.createVote('mix', 'creator', { question: 'Test?', options: ['A', 'B', 'C'] });

    // Users 6-10: raise hands
    for (let i = 6; i <= 10; i++) {
      rm.toggleRaisedHand('mix', `s${i}`);
    }

    // Users 11-15: set muted
    for (let i = 11; i <= 15; i++) {
      rm.setMuted('mix', `s${i}`, true);
    }

    // Verify state
    const room = rm.getRoom('mix');
    expect(room.participants.size).toBe(20);
    expect(room.tables.size).toBe(5);
    expect(room.furniture.length).toBe(10);
    expect(room.raisedHands.size).toBe(5);
    expect(room.votes.size).toBe(1);
  });
});
