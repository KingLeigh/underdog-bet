// End-to-end integration test: spawns the real server on a test port and
// drives a full game over Socket.IO — create, join, rankings, start, a
// contest with odds and a bounty, resolution with exact point math,
// reconnection, cancellation, identity isolation, and error paths.
//
// The protocol is state, not events: every change broadcasts the whole game
// ('gameStateUpdate'), current contest included, and every join answers
// with the same state ('gameJoined'). So these tests wait for a state that
// satisfies a predicate rather than for named events.
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

// Resolve with the first broadcast game state that satisfies `pred`
function waitState(socket, pred, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('gameStateUpdate', h);
      reject(new Error('timeout waiting for a matching game state'));
    }, timeoutMs);
    const h = (gs) => {
      if (!pred(gs)) return;
      clearTimeout(timer);
      socket.off('gameStateUpdate', h);
      resolve(gs);
    };
    socket.on('gameStateUpdate', h);
  });
}

const isLive = (gs) => !!gs.contest && !gs.contest.result;
const isResolved = (gs) => !!gs.contest && !!gs.contest.result;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

before(async () => {
  serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    // DATABASE_URL is blanked so the test server never persists its games
    // into a real database (dotenv does not override existing env vars)
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: '' },
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
  assert.equal(created.contest, null, 'no contest yet');
  const gameId = created.id;
  const hostId = created.playerID;

  // 2. Second player joins
  alice.emit('joinGame', { gameId, playerName: 'Alice' });
  const joined = await once(alice, 'gameJoined');
  assert.equal(joined.gameState.players.length, 2, 'two players after join');
  assert.equal(joined.isHost, false, 'joiner is not host');
  const aliceId = joined.playerID;

  // 3. Both submit rankings
  const rankingsDone = waitState(host, gs => gs.rankingsComplete);
  host.emit('gameAction', { gameId, action: 'submitRankings', payload: { rankings: { Trivia: 1, Cardio: 2 } } });
  alice.emit('gameAction', { gameId, action: 'submitRankings', payload: { rankings: { Trivia: 2, Cardio: 1 } } });
  await rankingsDone;

  // 4. Host saves matchups (mandatory with 2+ categories) and starts the game
  host.emit('gameAction', { gameId, action: 'saveMatchups', payload: { matchups: [
    { category: 'Trivia', highId: hostId, lowId: aliceId, highRank: 1, lowRank: 2, gap: 1 },
    { category: 'Cardio', highId: aliceId, lowId: hostId, highRank: 1, lowRank: 2, gap: 1 }
  ] } });
  const playing = waitState(alice, gs => gs.status === 'playing');
  host.emit('gameAction', { gameId, action: 'startGame', payload: {} });
  await playing;

  // 5. Host proposes a contest by player ID: Bob vs Alice at 1x / 2x
  const proposed = waitState(alice, isLive);
  host.emit('gameAction', { gameId, action: 'proposeWager', payload: { player1: hostId, player2: aliceId, odds1: 1, odds2: 2, category: 'Trivia' } });
  const contest = (await proposed).contest;
  assert.deepEqual(contest.options, ['Bob', 'Alice'], 'display names derived from IDs');
  assert.deepEqual(contest.contestants, [hostId, aliceId], 'contest carries contestant IDs');
  assert.deepEqual(contest.odds, [1, 2]);

  // 6. Self-bet rule: Bob (a contestant) betting on Alice is rejected
  host.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 1, points: 10 } });
  const afterIllegal = await waitState(alice, () => true);
  assert.equal(afterIllegal.contest.bets[hostId], undefined, 'contestant cannot bet against themselves');

  // Both bet legally; every client sees the bets in state (the client
  // decides what to show)
  const bothBet = waitState(alice, gs => Object.keys(gs.contest.bets).length === 2);
  host.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 0, points: 30 } }); // Bob on himself
  alice.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 1, points: 20 } }); // Alice on herself
  assert.deepEqual((await bothBet).contest.bets[hostId], { choice: 0, points: 30 });

  // 7. Host resolves: Alice (choice 1) wins.
  //    Alice bet 20 at 2x -> +40; Bob bet 30, wrong -> -30.
  //    Bounty Max = max(30, 20) = 30 -> Alice gets +30 more.
  const resolved = waitState(alice, isResolved);
  host.emit('gameAction', { gameId, action: 'resolveWager', payload: { correctChoice: 1 } });
  const afterResolve = await resolved;
  const result = afterResolve.contest.result;
  assert.equal(result.winnerPlayerId, aliceId, 'contest winner identified by ID');
  assert.equal(result.bountyAmount, 30, 'Max bounty is the largest bet');
  assert.equal(result.results.find(r => r.playerId === aliceId).pointsChange, '+40');
  assert.equal(result.results.find(r => r.playerId === hostId).pointsChange, '-30');

  // 8. Final points, in the same state and via REST: Alice 170, Bob 70
  assert.equal(afterResolve.playerPoints[aliceId], 170);
  const points = await fetch(`${URL}/api/games/${gameId}/points`).then(r => r.json());
  assert.equal(points.playerPoints[aliceId], 170);
  assert.equal(points.playerPoints[hostId], 70);

  // 9. The host dismisses the result, then a second contest: alice bets,
  //    disconnects mid-contest, rejoins → her bet is in the state she gets
  const between = waitState(alice, gs => gs.contest === null);
  host.emit('gameAction', { gameId, action: 'dismissResult', payload: {} });
  await between;
  const proposed2 = waitState(alice, isLive);
  host.emit('gameAction', { gameId, action: 'proposeWager', payload: { player1: hostId, player2: aliceId, odds1: 1, odds2: 1 } });
  await proposed2;
  const aliceBet = waitState(host, gs => !!gs.contest.bets[aliceId]);
  alice.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 1, points: 10 } });
  await aliceBet;
  alice.disconnect();

  const alice2 = connect();
  await once(alice2, 'connect');
  alice2.emit('rejoinGame', { gameId, playerID: aliceId });
  const rejoined = await once(alice2, 'gameJoined');
  assert.equal(rejoined.wasReconnection, true);
  assert.equal(rejoined.playerID, aliceId);
  assert.deepEqual(rejoined.gameState.contest.bets[aliceId], { choice: 1, points: 10 }, 'own bet survives the rejoin');

  const cancelled = waitState(alice2, gs => gs.contest === null);
  host.emit('gameAction', { gameId, action: 'cancelWager', payload: {} });
  const afterCancel = await cancelled;
  assert.equal(afterCancel.playerPoints[aliceId], 170, 'points unchanged by the cancelled contest');

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

test('spectator (TV screen) watches a game without a seat', { timeout: 30000 }, async () => {
  const host = connect();
  const pat = connect();

  host.emit('createGame', { playerName: 'Host', startingPoints: 100 });
  const created = await once(host, 'gameCreated');
  const gameId = created.id;
  const hostId = created.playerID;
  pat.emit('joinGame', { gameId, playerName: 'Pat' });
  const patId = (await once(pat, 'gameJoined')).playerID;

  // Watching an unknown game is an error
  const lost = connect();
  const lostErr = once(lost, 'error');
  lost.emit('watchGame', { gameId: 'ZZZZZZ' });
  assert.equal((await lostErr).message, 'Game not found');

  // The TV joins: full game state, no identity, not added to the roster
  const tv = connect();
  tv.emit('watchGame', { gameId });
  const watched = await once(tv, 'gameJoined');
  assert.equal(watched.playerID, null, 'spectator has no player identity');
  assert.equal(watched.isHost, false);
  assert.equal(watched.spectator, true);
  assert.deepEqual(watched.gameState.players.sort(), [hostId, patId].sort());

  // It receives the game's broadcasts like everyone else
  const playing = waitState(tv, gs => gs.status === 'playing');
  host.emit('gameAction', { gameId, action: 'startGame', payload: {} });
  const started = await playing;
  assert.equal(started.players.length, 2, 'the TV never joins the roster');

  const proposed = waitState(tv, isLive);
  host.emit('gameAction', { gameId, action: 'proposeWager', payload: { player1: hostId, player2: patId, odds1: 1, odds2: 2 } });
  assert.deepEqual((await proposed).contest.contestants, [hostId, patId]);

  // The TV cannot act: its bet attempt is ignored, Pat's lands
  tv.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 0, points: 10 } });
  const patBet = waitState(tv, gs => !!gs.contest.bets[patId]);
  pat.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 1, points: 25 } });
  const withBet = await patBet;
  assert.deepEqual(Object.keys(withBet.contest.bets), [patId], 'only the real bet is in state');

  // A TV joining mid-contest gets the contest and its bets in the join state
  const tv2 = connect();
  tv2.emit('watchGame', { gameId });
  const midJoin = await once(tv2, 'gameJoined');
  assert.ok(isLive(midJoin.gameState));
  assert.equal(midJoin.gameState.contest.bets[patId].points, 25);

  const resolved = waitState(tv, isResolved);
  host.emit('gameAction', { gameId, action: 'resolveWager', payload: { correctChoice: 1 } });
  assert.equal((await resolved).contest.result.winnerPlayerId, patId);
});

test('a player who slept through a resolution wakes to the result', { timeout: 30000 }, async () => {
  const host = connect();
  const kim = connect();
  const lee = connect();

  host.emit('createGame', { playerName: 'Host', hostPlays: false, startingPoints: 100 });
  const gameId = (await once(host, 'gameCreated')).id;
  kim.emit('joinGame', { gameId, playerName: 'Kim' });
  const kimId = (await once(kim, 'gameJoined')).playerID;
  lee.emit('joinGame', { gameId, playerName: 'Lee' });
  const leeId = (await once(lee, 'gameJoined')).playerID;
  const playing = waitState(kim, gs => gs.status === 'playing');
  host.emit('gameAction', { gameId, action: 'startGame', payload: {} });
  await playing;

  // A contest goes live; Kim bets
  const proposed = waitState(kim, isLive);
  host.emit('gameAction', { gameId, action: 'proposeWager', payload: { player1: kimId, player2: leeId, odds1: 1, odds2: 3 } });
  await proposed;
  const kimBet = waitState(kim, gs => !!gs.contest.bets[kimId]);
  kim.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 0, points: 20 } });
  await kimBet;

  // Kim's phone locks (socket gone); the host resolves for Lee
  kim.disconnect();
  const resolved = waitState(lee, isResolved);
  host.emit('gameAction', { gameId, action: 'resolveWager', payload: { correctChoice: 1 } });
  const live = (await resolved).contest;

  // Kim wakes up and rejoins: the state she gets IS the result
  const kim2 = connect();
  kim2.emit('rejoinGame', { gameId, playerID: kimId });
  const wake = (await once(kim2, 'gameJoined')).gameState;
  assert.equal(wake.contest.id, live.id, 'the same contest');
  assert.equal(wake.contest.result.winnerPlayerId, leeId);
  assert.deepEqual(wake.contest.odds, [1, 3]);
  assert.equal(wake.contest.result.results.find(r => r.playerId === kimId).pointsChange, '-20');
  assert.equal(wake.playerPoints[kimId], 80);

  // A TV opened now also lands on the result
  const tv = connect();
  tv.emit('watchGame', { gameId });
  assert.equal((await once(tv, 'gameJoined')).gameState.contest.id, live.id);

  // Once the host moves on, a rejoin gets the next contest, not the old result
  const next = waitState(lee, gs => isLive(gs) && gs.contest.id !== live.id);
  host.emit('gameAction', { gameId, action: 'dismissResult', payload: {} });
  host.emit('gameAction', { gameId, action: 'proposeWager', payload: { player1: kimId, player2: leeId, odds1: 1, odds2: 2 } });
  await next;
  const kim3 = connect();
  kim3.emit('rejoinGame', { gameId, playerID: kimId });
  const later = (await once(kim3, 'gameJoined')).gameState;
  assert.ok(isLive(later));
  assert.deepEqual(later.contest.odds, [1, 2]);

  // ...and after that contest is cancelled, there is no contest at all
  const cancelled = waitState(lee, gs => gs.contest === null);
  host.emit('gameAction', { gameId, action: 'cancelWager', payload: {} });
  await cancelled;
  const kim4 = connect();
  kim4.emit('rejoinGame', { gameId, playerID: kimId });
  assert.equal((await once(kim4, 'gameJoined')).gameState.contest, null);
});

test('emcee mode: a non-player host runs the game',{ timeout: 30000 }, async () => {
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
  const playing = waitState(dave, gs => gs.status === 'playing');
  emma.emit('gameAction', { gameId, action: 'startGame', payload: {} });
  const started = await playing;
  assert.deepEqual(started.players.sort(), [daveId, franId].sort(), 'only the real players are in the game');

  // 4. The emcee proposes and resolves a contest; her bet attempts are rejected
  const proposed = waitState(dave, isLive);
  emma.emit('gameAction', { gameId, action: 'proposeWager', payload: { player1: daveId, player2: franId, odds1: 1, odds2: 2 } });
  await proposed;

  emma.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 0, points: 10 } });
  const daveBet = waitState(dave, gs => !!gs.contest.bets[daveId]);
  dave.emit('gameAction', { gameId, action: 'makeChoice', payload: { choice: 0, points: 10 } });
  assert.equal((await daveBet).contest.bets[emmaId], undefined, 'the emcee host cannot bet');

  const resolved = waitState(dave, isResolved);
  emma.emit('gameAction', { gameId, action: 'resolveWager', payload: { correctChoice: 0 } });
  assert.equal((await resolved).contest.result.winnerPlayerId, daveId);

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
