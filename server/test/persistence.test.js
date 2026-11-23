// Tests for the persistence layer (lib/persistence.js).
//
// The SQL contract runs against pg-mem (an in-memory Postgres emulator), so
// these tests exercise the real statements — table creation, upsert, event
// insert, restore-on-boot — without needing a database on the machine.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { newDb } = require('pg-mem');

const persistence = require('../lib/persistence');
const {
  gameSessions,
  wagerStates,
  playerRegistry,
  restoreGame,
  getOrCreatePlayerID,
  createInitialWagerState
} = require('../lib/store');

function sampleGame(id) {
  return {
    id,
    host: 'p1',
    players: ['p1', 'p2'],
    status: 'playing',
    startingPoints: 100,
    minBalance: 10,
    maxBetSize: null,
    bounty: 'None',
    bountyAmount: null,
    playerPoints: { p1: 80, p2: 120 },
    playerNames: { p1: 'Bob', p2: 'Alice' },
    categories: ['A'],
    challengesPerCategory: [2],
    playerRankings: { p1: { A: 1 }, p2: { A: 1 } },
    rankingsComplete: true
  };
}

beforeEach(async () => {
  await persistence.close();
  gameSessions.clear();
  wagerStates.clear();
  playerRegistry.clear();
});

// ---- restoreGame (pure, no database) ---------------------------------------

test('restoreGame rebuilds maps, registry, and keeps new player IDs clear', () => {
  restoreGame({ game: sampleGame('G1'), wager: null });

  assert.ok(gameSessions.has('G1'));
  assert.equal(wagerStates.get('G1').isActive, false);

  // Registry rebuilt from playerNames: rejoin-by-name reconnects, not duplicates
  const rejoined = getOrCreatePlayerID({ id: 'sock-a' }, 'alice', 'G1');
  assert.equal(rejoined, 'p2');

  // A genuinely new player never collides with a restored ID
  const fresh = getOrCreatePlayerID({ id: 'sock-b' }, 'Zed', 'G1');
  assert.ok(!['p1', 'p2'].includes(fresh));
});

// ---- full round trip through (emulated) Postgres ----------------------------

test('a saved game and its wager survive a restart', async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();

  await persistence.init({ pool: new Pool() });

  // A live game with an active wager and one bet
  gameSessions.set('G2', sampleGame('G2'));
  const wager = {
    ...createInitialWagerState(),
    isActive: true,
    options: ['Bob', 'Alice'],
    contestants: ['p1', 'p2'],
    odds: [1, 2],
    category: 'A',
    playerChoices: { p1: { choice: 0, points: 25 } },
    betsLockAt: null
  };
  wagerStates.set('G2', wager);

  await persistence.saveGame('G2');
  await persistence.logEvent('G2', 'bet', { playerID: 'p1', points: 25 });

  // "Restart": wipe memory, reconnect to the same database
  gameSessions.clear();
  wagerStates.clear();
  playerRegistry.clear();
  await persistence.close();
  await persistence.init({ pool: new Pool() });

  const restored = gameSessions.get('G2');
  assert.ok(restored, 'game restored on boot');
  assert.equal(restored.playerPoints.p2, 120);
  assert.deepEqual(wagerStates.get('G2').playerChoices.p1, { choice: 0, points: 25 });
  assert.equal(playerRegistry.get('p1').playerName, 'Bob');

  // Saving again updates in place (upsert, not duplicate)
  restored.playerPoints.p2 = 150;
  await persistence.saveGame('G2');
  const check = new Pool();
  const { rows } = await check.query('SELECT state FROM games');
  assert.equal(rows.length, 1);
  const state = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
  assert.equal(state.game.playerPoints.p2, 150);

  const events = await check.query('SELECT type FROM events');
  assert.deepEqual(events.rows.map(r => r.type), ['bet']);

  await persistence.close();
});

test('with no database configured, persistence is inert', async () => {
  const on = await persistence.init({ databaseUrl: null });
  assert.equal(on, false);
  assert.equal(persistence.isEnabled(), false);
  // Writes are harmless no-ops
  await persistence.saveGame('NOPE');
  await persistence.logEvent('NOPE', 'x', {});
});
