// Persistence: rooms (and their durable content) survive a full process restart.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { RoomManager } = require('../server/room-manager');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'iso-persist-'));
}

describe('Persistence — rooms survive a restart', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} });

  test('room config, furniture, tables, notes and whiteboards are restored', () => {
    // --- First "process": create and populate a room ---
    const rm1 = new RoomManager({ persist: true, persistDir: dir });
    const room = rm1.createRoom('persist1', { name: 'Atelier', environment: 'open-space', gridSize: 24 });
    const token = room.creatorToken;
    rm1.joinRoom('persist1', 's1', { pseudo: 'Alice', colors: {}, isCreator: true });
    rm1.addFurniture('persist1', 's1', { type: 'plant', x: 5, y: 5 });
    const tbl = rm1.createTable('persist1', 's1', { name: 'Table A', x: 8, y: 8 });
    rm1.updateTableNotes('persist1', tbl.table.id, 'Notes importantes');
    rm1.createWhiteboard('persist1', 's1', { x: 3, y: 3, radius: 4 });
    // Force a synchronous write (bypass debounce) then drop from memory.
    rm1.flush();
    rm1.destroy();

    // The snapshot file must exist on disk.
    expect(fs.existsSync(path.join(dir, 'persist1.json'))).toBe(true);

    // --- Second "process": fresh manager, same data dir ---
    const rm2 = new RoomManager({ persist: true, persistDir: dir });
    const restored = rm2.getRoom('persist1');
    expect(restored).toBeTruthy();
    expect(restored.name).toBe('Atelier');
    expect(restored.gridSize).toBe(24);
    expect(restored.creatorToken).toBe(token); // creator can still reclaim the room
    expect(restored.participants.size).toBe(0); // live state reset
    expect(restored.furniture.some((f) => f.type === 'plant')).toBe(true);
    expect(restored.tables.size).toBe(1);
    const noteEntry = Array.from(restored.tableNotes.values())[0];
    expect(noteEntry.content).toBe('Notes importantes');
    expect(restored.whiteboards.size).toBe(1);
    rm2.destroy();
  });

  test('returning creator reclaims admin via token after restart', () => {
    const rm1 = new RoomManager({ persist: true, persistDir: dir });
    rm1.createRoom('persist2', { name: 'R', environment: 'bureau', gridSize: 20 });
    const first = rm1.joinRoom('persist2', 'a', { pseudo: 'Bob', colors: {}, isCreator: true });
    rm1.flush(); rm1.destroy();

    const rm2 = new RoomManager({ persist: true, persistDir: dir });
    const r = rm2.joinRoom('persist2', 'b', { pseudo: 'Bob', colors: {}, creatorToken: first.creatorToken });
    expect(r.participant.role).toBe('creator');
    expect(r.participant.isAdmin).toBe(true);
    rm2.destroy();
  });

  test('closed/destroyed room is removed from disk', () => {
    const rm1 = new RoomManager({ persist: true, persistDir: dir });
    rm1.createRoom('persist3', { name: 'R', environment: 'bureau', gridSize: 20 });
    rm1.persistence.flushAll(); // force the debounced create-save to disk
    expect(fs.existsSync(path.join(dir, 'persist3.json'))).toBe(true);
    rm1._destroyRoom('persist3');
    expect(fs.existsSync(path.join(dir, 'persist3.json'))).toBe(false);
    rm1.destroy();
  });
});
