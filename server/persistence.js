// Persistence: durable JSON snapshot store for rooms (one file per room).
// Atomic writes (tmp + rename), debounced per room, no external dependencies.
// Disabled transparently in test/ephemeral mode so the suite never touches disk.

const fs = require('fs');
const path = require('path');

const DEBOUNCE_MS = 1500;

class Persistence {
  constructor(opts) {
    opts = opts || {};
    this.enabled = opts.enabled !== false;
    this.dir = opts.dir || path.join(__dirname, '..', 'data', 'rooms');
    this._pending = new Map(); // roomId -> { timer, getSnapshot }
    if (this.enabled) {
      try {
        fs.mkdirSync(this.dir, { recursive: true });
      } catch (e) {
        console.error('[persistence] cannot create data dir, disabling:', e.message);
        this.enabled = false;
      }
    }
  }

  _file(roomId) {
    return path.join(this.dir, encodeURIComponent(roomId) + '.json');
  }

  // Load every persisted room. Returns an array of snapshot objects.
  loadAll() {
    if (!this.enabled) return [];
    let files;
    try {
      files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.json'));
    } catch (e) {
      return [];
    }
    const out = [];
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(this.dir, f), 'utf8');
        const snap = JSON.parse(raw);
        if (snap && snap.id) out.push(snap);
      } catch (e) {
        console.error('[persistence] skipping corrupt file', f, e.message);
      }
    }
    return out;
  }

  // Schedule a debounced atomic save. getSnapshot() is called at flush time so
  // the very latest state is written (not a stale copy captured at call time).
  save(roomId, getSnapshot) {
    if (!this.enabled) return;
    let entry = this._pending.get(roomId);
    if (entry) {
      entry.getSnapshot = getSnapshot;
      return; // timer already running
    }
    entry = { getSnapshot, timer: null };
    entry.timer = setTimeout(() => {
      this._pending.delete(roomId);
      this._writeNow(roomId, entry.getSnapshot);
    }, DEBOUNCE_MS);
    if (entry.timer.unref) entry.timer.unref();
    this._pending.set(roomId, entry);
  }

  _writeNow(roomId, getSnapshot) {
    if (!this.enabled) return;
    let snap;
    try { snap = getSnapshot(); } catch (e) { return; }
    if (!snap) return;
    const file = this._file(roomId);
    const tmp = file + '.' + process.pid + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(snap), 'utf8');
      fs.renameSync(tmp, file); // atomic on the same filesystem
    } catch (e) {
      console.error('[persistence] write failed for', roomId, e.message);
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  }

  remove(roomId) {
    if (!this.enabled) return;
    const entry = this._pending.get(roomId);
    if (entry) { clearTimeout(entry.timer); this._pending.delete(roomId); }
    try { fs.unlinkSync(this._file(roomId)); } catch (e) { /* already gone */ }
  }

  // Flush all pending writes immediately (call on graceful shutdown).
  flushAll() {
    if (!this.enabled) return;
    for (const [roomId, entry] of this._pending) {
      clearTimeout(entry.timer);
      this._writeNow(roomId, entry.getSnapshot);
    }
    this._pending.clear();
  }
}

module.exports = Persistence;
