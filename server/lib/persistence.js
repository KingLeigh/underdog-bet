// Optional Postgres persistence (see TODO.md "Add a database layer").
//
// The in-memory maps in store.js stay the synchronous source of truth; this
// module writes through underneath them. Two tables:
//   games(id, state jsonb, updated_at)  — the current { game, wager } snapshot
//   events(game_id, type, payload, at)  — append-only record of what happened
// With no DATABASE_URL the module is inert and the server behaves exactly as
// before (in-memory only). Writes are fire-and-forget: a database hiccup
// must never stall or crash a running party.

const { gameSessions, wagerStates, restoreGame } = require('./store');

let pool = null;
let enabled = false;

const CREATE_GAMES = `
  CREATE TABLE IF NOT EXISTS games (
    id text PRIMARY KEY,
    state jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;

const CREATE_EVENTS = `
  CREATE TABLE IF NOT EXISTS events (
    id bigserial PRIMARY KEY,
    game_id text NOT NULL,
    type text NOT NULL,
    payload jsonb NOT NULL,
    at timestamptz NOT NULL DEFAULT now()
  )`;

const UPSERT_GAME = `
  INSERT INTO games (id, state, updated_at) VALUES ($1, $2::jsonb, now())
  ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`;

const INSERT_EVENT = `
  INSERT INTO events (game_id, type, payload) VALUES ($1, $2, $3::jsonb)`;

// Connect, create tables, and restore every saved game into the in-memory
// maps. `options.pool` injects a pool (tests); otherwise DATABASE_URL decides.
// Returns true when persistence is on.
async function init(options = {}) {
  const url = options.databaseUrl !== undefined ? options.databaseUrl : process.env.DATABASE_URL;

  if (options.pool) {
    pool = options.pool;
  } else if (url) {
    const { Pool } = require('pg');
    // Heroku Postgres requires TLS but presents a cert the dyno can't verify
    const local = /localhost|127\.0\.0\.1/.test(url);
    pool = new Pool({ connectionString: url, max: 5, ssl: local ? false : { rejectUnauthorized: false } });
  } else {
    console.log('Persistence off (no DATABASE_URL): games are in-memory only');
    return false;
  }

  // Create tables only when absent (re-running CREATE ... IF NOT EXISTS is a
  // no-op on real Postgres but trips the pg-mem emulator used in tests)
  const existing = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_name IN ('games', 'events')"
  );
  const have = new Set(existing.rows.map(r => r.table_name));
  if (!have.has('games')) await pool.query(CREATE_GAMES);
  if (!have.has('events')) {
    await pool.query(CREATE_EVENTS);
    try {
      await pool.query('CREATE INDEX events_game_idx ON events (game_id, id)');
    } catch (err) {
      console.warn('Could not create events index:', err.message);
    }
  }

  const { rows } = await pool.query('SELECT state FROM games');
  let restored = 0;
  for (const row of rows) {
    const snapshot = typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
    if (restoreGame(snapshot)) restored++;
  }

  enabled = true;
  console.log(`Persistence on: ${restored} game(s) restored`);
  return true;
}

// Per-game write queue. The pool has several connections, and two upserts
// sent on different connections can commit in either order — a slow one
// (a dropped packet, a fresh TLS handshake) would land an OLDER snapshot on
// top of a newer one. So each game has at most one snapshot write in
// flight; saves requested meanwhile just mark the game dirty, and the
// writer goes round again with the latest state once its write lands. Bursts
// (everyone betting at lock time) coalesce into two writes at most.
const writers = new Map(); // gameId -> { dirty, done }

// Write-through snapshot of one game (fire-and-forget for callers). The
// returned promise resolves once the state as of this call — or newer — is
// in the database, so tests (and close) can await it.
function saveGame(gameId) {
  if (!enabled) return Promise.resolve();
  const writer = writers.get(gameId);
  if (writer) {
    writer.dirty = true;
    return writer.done;
  }
  const fresh = { dirty: false, done: null };
  writers.set(gameId, fresh);
  fresh.done = drainWrites(gameId, fresh);
  return fresh.done;
}

async function drainWrites(gameId, writer) {
  do {
    writer.dirty = false;
    await writeSnapshot(gameId); // never rejects
  } while (writer.dirty);
  writers.delete(gameId);
}

// One upsert of the game's current state, serialized at the moment it is
// sent. A game no longer in memory (deleted) is skipped, so a queued write
// can never resurrect it.
function writeSnapshot(gameId) {
  const game = gameSessions.get(gameId);
  if (!game || !pool) return Promise.resolve();
  const snapshot = { game, wager: wagerStates.get(gameId) || null };
  return pool
    .query(UPSERT_GAME, [gameId, JSON.stringify(snapshot)])
    .catch(err => console.error(`Persisting game ${gameId} failed:`, err.message));
}

// Append one event to the permanent record (fire-and-forget, as above)
function logEvent(gameId, type, payload) {
  if (!enabled) return Promise.resolve();
  return pool
    .query(INSERT_EVENT, [gameId, type, JSON.stringify(payload || {})])
    .catch(err => console.error(`Logging ${type} for game ${gameId} failed:`, err.message));
}

// Remove a game's snapshot row. Its events stay: they are the permanent
// record, and at ~100 KB per full night there is no reason to lose history.
// Callers remove the game from memory first; the delete then waits for any
// in-flight snapshot write, so that write can't land after it and bring the
// row back.
function deleteGame(gameId) {
  if (!enabled) return Promise.resolve();
  const pending = writers.get(gameId);
  return (pending ? pending.done : Promise.resolve())
    .then(() => pool.query('DELETE FROM games WHERE id = $1', [gameId]))
    .catch(err => console.error(`Deleting game ${gameId} failed:`, err.message));
}

// Wait for every queued snapshot write, then disconnect
async function close() {
  await Promise.all([...writers.values()].map(w => w.done));
  if (pool) await pool.end();
  pool = null;
  enabled = false;
}

function isEnabled() {
  return enabled;
}

module.exports = { init, saveGame, logEvent, deleteGame, close, isEnabled };
