// End-to-end integration test: spawns the real server on a test port and
// drives a full game over Socket.IO — create, join, rankings, start, a wager
// with odds and a bounty, resolution with exact point math, reconnection
// (including own-choice replay), cancellation, identity isolation, and
// error paths.
//
// This suite is deliberately written against the socket protocol, the app's
// real API: it should survive internal refactors unchanged and only need
// edits when the protocol itself deliberately changes.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { io } = require('socket.io-client');

const PORT = 4100 + Math.floor(Math.random() * 500);
const URL = `http://localhost:${PORT}`;

let serverProcess;
const sockets = [];

function connect() {
  const socket = io(URL, { forceNew: true });
  sockets.push(socket);
  return socket;
}

function once(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for '${event}'`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

before(async () => {
  serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    // DATABASE_URL is blanked so the test server never persists its games
    // into a real database (dotenv does not override existing env vars)
    env: { ...process.env, PORT: String(PORT), GOOGLE_APPS_SCRIPT_URL: '', DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
    serverProcess.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Server running')) {
        clearTimeout(timer);
        resolve();
      }
    });
    serverProcess.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
  });
});

after(() => {
  for (const s of sockets) s.disconnect();
  if (serverProcess) serverProcess.kill();
});

test('full game flow over the socket protocol', { timeout: 30000 }, async () => {
  const host = connect();
  const alice = connect();

  // 1. Host creates a game with categories and a Max bounty
  host.emit('createGame', {
    playerName: 'Bob',
    startingPoints: 100,
    maxBetSize: null,
    bounty: 'Max',
    bountyAmount: null,
    categories: ['Trivia', 'Cardio'],
    challengesPerCategory: [1, 1]
  });
  const created = await once(host, 'gameCreated');
  assert.ok(created.id, 'game has an id');
  assert.equal(created.host, created.playerID, 'creator is host');
  assert.equal(created.playerPoints[created.playerID], 100, 'host starting points');
  const gameId = created.id;
  const hostId = created.playerID;

  // 2. Second player joins
  alice.emit('joinGame', { gameId, playerName: 'Alice' });
  const joined = await once(alice, 'gameJoined');
  assert.equal(joined.gameState.players.length, 2, 'two players after join');
  assert.equal(joined.isHost, false, 'joiner is not host');
  const aliceId = joined.playerID;

  // 3. Both submit rankings
  const rankingsDone = once(host, 'rankingsComplete');
  host.emit('gameAction', { gameId, action: 'submitRankings', payload: { rankings: { Trivia: 1, Cardio: 2 } } });
  alice.emit('gameAction', { gameId, action: 'submitRankings', payload: { rankings: { Trivia: 2, Cardio: 1 } } });
  await rankingsDone;

  // 4. Host starts the game (wait for the state update whose status is 'playing';
  //    every gameAction broadcasts a gameStateUpdate, so earlier ones may still arrive)
  const playing = new Promise((resolve) => {
    const h = (gs) => { if (gs.status === 'playing') { alice.off('gameStateUpdate', h); resolve(gs); } };
    alice.on('gameStateUpdate', h);
  });
  host.emit('gameAction', { gameId, action: 'startGame', payload: {} });
  await playing;

  // 5. Host proposes a wager by player ID: Bob vs Alice at 1x / 2x
  const proposed = once(alice, 'wagerProposed');
  host.emit('gameAction', { gameId, action: 'proposeWager', payload: { player1: hostId, player2: aliceId, odds1: 1, odds2: 2, category: 'Trivia' } });
  const wager = await proposed;
  assert.deepEqual(wager.options, ['Bob', 'Alice'], 'display names derived from IDs');
  assert.deepEqual(wager.contestants, [hostId, aliceId], 'wager carries contestant IDs');
  assert.deepEqual(wager.odds, [1, 2]);

  // 6. Self-bet rule: Bob (a contestant) betting on Alice must be rejected
  let bobIllegal = false;
  host.once('choiceMade', () => { bobIllegal = true; });
  host.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 1, points: 10 } });
  await sleep(300);
  assert.equal(bobIllegal, false, 'contestant cannot bet against themselves');

  // Both bet legally; choices stay secret in the broadcasts
  const choices = [];
  host.on('choiceMade', (c) => choices.push(c));
  host.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 0, points: 30 } }); // Bob on himself
  alice.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 1, points: 20 } }); // Alice on herself
  await sleep(300);
  assert.equal(choices.length, 2, 'both bets broadcast');
  assert.ok(choices.every(c => c.choice === null), 'choices stay secret until resolution');
  host.off('choiceMade');

  // 7. Host resolves: Alice (choice 1) wins.
  //    Alice bet 20 at 2x -> +40; Bob bet 30, wrong -> -30.
  //    Bounty Max = max(30, 20) = 30 -> Alice gets +30 more.
  const resolved = once(alice, 'wagerResolved');
  host.emit('gameAction', { gameId, action: 'resolveWager', payload: { correctChoice: 1 } });
  const result = await resolved;
  assert.equal(result.winnerPlayerId, aliceId, 'contest winner identified by ID');
  assert.equal(result.bountyAmount, 30, 'Max bounty is the largest bet');
  assert.equal(result.results.find(r => r.playerId === aliceId).pointsChange, '+40');
  assert.equal(result.results.find(r => r.playerId === hostId).pointsChange, '-30');

  // 8. Final points via REST: Alice 100+40+30=170, Bob 100-30=70
  const points = await fetch(`${URL}/api/games/${gameId}/points`).then(r => r.json());
  assert.equal(points.playerPoints[aliceId], 170);
  assert.equal(points.playerPoints[hostId], 70);

  // 9. Second wager: alice bets, disconnects mid-wager, rejoins → her own
  //    choice is replayed to her (others' stay secret); then host cancels.
  const proposed2 = once(alice, 'wagerProposed');
  host.emit('gameAction', { gameId, action: 'proposeWager', payload: { player1: hostId, player2: aliceId, odds1: 1, odds2: 1 } });
  await proposed2;
  alice.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 1, points: 10 } });
  await sleep(300);
  alice.disconnect();

  const alice2 = connect();
  await once(alice2, 'connect');
  const replayedChoices = [];
  alice2.on('choiceMade', (c) => replayedChoices.push(c));
  alice2.emit('rejoinGame', { gameId, playerID: aliceId });
  const rejoined = await once(alice2, 'gameJoined');
  assert.equal(rejoined.wasReconnection, true);
  assert.equal(rejoined.playerID, aliceId);
  await sleep(300);
  const own = replayedChoices.find(c => c.playerId === aliceId);
  assert.ok(own, 'own bet replayed on rejoin');
  assert.equal(own.choice, 1, 'own choice revealed to its owner');

  const cancelled = once(alice2, 'wagerCancelled');
  host.emit('gameAction', { gameId, action: 'cancelWager', payload: {} });
  await cancelled;

  // Points unchanged by the cancelled wager
  const points2 = await fetch(`${URL}/api/games/${gameId}/points`).then(r => r.json());
  assert.equal(points2.playerPoints[aliceId], 170);

  // 10. Identity isolation: creating a different game with the name "alice"
  //     must NOT hijack game 1's Alice (and display names are capitalized).
  const mallory = connect();
  mallory.emit('createGame', { playerName: 'alice' });
  const g2 = await once(mallory, 'gameCreated');
  assert.notEqual(g2.playerID, aliceId, 'same name in another game gets a new identity');
  assert.equal(g2.playerNames[g2.playerID], 'Alice', 'display names get a capital first letter');

  // 11. Same-game name reconnection is case-insensitive: joining game 1 as
  //     "ALICE" from a fresh socket returns her original ID.
  alice2.disconnect();
  const alice3 = connect();
  await once(alice3, 'connect');
  alice3.emit('joinGame', { gameId, playerName: 'ALICE' });
  const rejoinByName = await once(alice3, 'gameJoined');
  assert.equal(rejoinByName.playerID, aliceId, 'case-insensitive name rejoin keeps the ID');
  assert.equal(rejoinByName.wasReconnection, true);
  assert.equal(rejoinByName.gameState.playerNames[aliceId], 'Alice', 'display name keeps first-join form');

  // 12. Error paths
  const err = once(alice3, 'error');
  alice3.emit('joinGame', { gameId: 'ZZZZZZ', playerName: 'Ghost' });
  const e = await err;
  assert.equal(e.message, 'Game not found');

  // Joining a started game as a new player is refused
  const stranger = connect();
  const err2 = once(stranger, 'error');
  stranger.emit('joinGame', { gameId, playerName: 'Latecomer' });
  const e2 = await err2;
  assert.equal(e2.message, 'Cannot join game that has already started');
});

test('emcee mode: a non-player host runs the game', { timeout: 30000 }, async () => {
  const emma = connect();
  const dave = connect();
  const fran = connect();

  // 1. Emma hosts without playing
  emma.emit('createGame', { playerName: 'emma', hostPlays: false });
  const created = await once(emma, 'gameCreated');
  const gameId = created.id;
  const emmaId = created.playerID;
  assert.equal(created.host, emmaId, 'emma is the host');
  assert.deepEqual(created.players, [], 'host is not a player');
  assert.equal(created.playerNames[emmaId], 'Emma', 'host still has a display name');

  // 2. Two real players join
  dave.emit('joinGame', { gameId, playerName: 'dave' });
  const dj = await once(dave, 'gameJoined');
  const daveId = dj.playerID;
  fran.emit('joinGame', { gameId, playerName: 'fran' });
  const fj = await once(fran, 'gameJoined');
  const franId = fj.playerID;

  // 3. The emcee host can start the game (authorized without being a player)
  const playing = new Promise((resolve) => {
    const h = (gs) => { if (gs.status === 'playing') { dave.off('gameStateUpdate', h); resolve(gs); } };
    dave.on('gameStateUpdate', h);
  });
  emma.emit('gameAction', { gameId, action: 'startGame', payload: {} });
  const started = await playing;
  assert.deepEqual(started.players.sort(), [daveId, franId].sort(), 'only the real players are in the game');

  // 4. The emcee proposes and resolves a wager; her bet attempts are rejected
  const proposed = once(dave, 'wagerProposed');
  emma.emit('gameAction', { gameId, action: 'proposeWager', payload: { player1: daveId, player2: franId, odds1: 1, odds2: 2 } });
  await proposed;

  let emceeBetSeen = false;
  dave.once('choiceMade', (c) => { if (c.playerId === emmaId) emceeBetSeen = true; });
  emma.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 0, points: 10 } });
  dave.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 0, points: 10 } });
  await sleep(300);
  assert.equal(emceeBetSeen, false, 'the emcee host cannot bet');

  const resolved = once(dave, 'wagerResolved');
  emma.emit('gameAction', { gameId, action: 'resolveWager', payload: { correctChoice: 0 } });
  const result = await resolved;
  assert.equal(result.winnerPlayerId, daveId);

  const points = await fetch(`${URL}/api/games/${gameId}/points`).then(r => r.json());
  assert.deepEqual(Object.keys(points.playerPoints).sort(), [daveId, franId].sort(),
    'the emcee host never appears in the points table');

  // 5. Emcee reconnection by name must not add her as a player
  emma.disconnect();
  const emma2 = connect();
  await once(emma2, 'connect');
  emma2.emit('joinGame', { gameId, playerName: 'EMMA' });
  const rejoined = await once(emma2, 'gameJoined');
  assert.equal(rejoined.playerID, emmaId, 'name rejoin keeps the host identity');
  assert.equal(rejoined.isHost, true);
  assert.equal(rejoined.gameState.players.length, 2, 'rejoining emcee is not added as a player');

  // 6. rejoinGame by ID also works for the emcee
  emma2.disconnect();
  const emma3 = connect();
  await once(emma3, 'connect');
  emma3.emit('rejoinGame', { gameId, playerID: emmaId });
  const rejoined2 = await once(emma3, 'gameJoined');
  assert.equal(rejoined2.isHost, true);
  assert.equal(rejoined2.gameState.players.length, 2);
});
