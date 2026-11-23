// Unit tests for the game rules in lib/gameActions.js.
//
// These tests pin down the wager/bounty/ranking rules — the part of the
// server where a silent regression corrupts scores. They are written
// against observable behavior (state changes and emitted events), not
// implementation details, so they should only fail when a rule changes.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { processGameAction } = require('../lib/gameActions');
const { wagerStates, playerRegistry } = require('../lib/store');

// ---- Test helpers -----------------------------------------------------------

// Fake io capturing emits as [event, payload, target] triples
function fakeIo(events) {
  return {
    to: (target) => ({
      emit: (event, payload) => events.push([event, payload, target])
    }),
    in: () => ({ socketsLeave: () => {} })
  };
}

function lastEvent(events, name) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i][0] === name) return events[i][1];
  }
  return null;
}

// A 3-player game: p1 hosts, all at 100 points, minimum balance floor 10
function makeGame(overrides = {}) {
  return {
    id: 'TEST01',
    host: 'p1',
    players: ['p1', 'p2', 'p3'],
    status: 'playing',
    startingPoints: 100,
    minBalance: 10,
    maxBetSize: null,
    bounty: 'None',
    bountyAmount: null,
    playerPoints: { p1: 100, p2: 100, p3: 100 },
    playerNames: { p1: 'Bob', p2: 'Alice', p3: 'Carol' },
    categories: [],
    challengesPerCategory: [],
    playerRankings: {},
    rankingsComplete: false,
    ...overrides
  };
}

// Propose a p1-vs-p2 wager as the host and return the captured events
function propose(io, game, opts = {}) {
  return processGameAction(io, game, 'proposeWager', {
    player1: 'p1',
    player2: 'p2',
    odds1: 1,
    odds2: 1,
    ...opts
  }, 'p1');
}

let events;
let io;

beforeEach(() => {
  events = [];
  io = fakeIo(events);
  wagerStates.clear();
  playerRegistry.clear();
});

// ---- startGame --------------------------------------------------------------

test('startGame requires at least two players', () => {
  const game = makeGame({ status: 'waiting', players: ['p1'], playerPoints: { p1: 100 } });
  const result = processGameAction(io, game, 'startGame', {}, 'p1');
  assert.equal(result.status, 'waiting');
});

test('startGame with two or more players starts the game', () => {
  const game = makeGame({ status: 'waiting' });
  const result = processGameAction(io, game, 'startGame', {}, 'p1');
  assert.equal(result.status, 'playing');
  assert.ok(result.gameStartedAt);
});

test('startGame is host-only', () => {
  const game = makeGame({ status: 'waiting' });
  const result = processGameAction(io, game, 'startGame', {}, 'p2');
  assert.equal(result.status, 'waiting');
});

test('startGame drops players who have not submitted rankings', () => {
  const game = makeGame({
    status: 'waiting',
    categories: ['A', 'B'],
    playerRankings: { p1: { A: 1, B: 2 }, p2: { A: 2, B: 1 } } // p3 never ranked
  });
  const result = processGameAction(io, game, 'startGame', {}, 'p1');

  assert.equal(result.status, 'playing');
  assert.deepEqual(result.players, ['p1', 'p2']);
  assert.equal(result.playerPoints.p3, undefined);
  assert.equal(result.playerNames.p3, undefined);
  assert.equal(result.rankingsComplete, true, 'all remaining players are ranked');
});

test('startGame refuses when fewer than 2 players have rankings', () => {
  const game = makeGame({
    status: 'waiting',
    categories: ['A', 'B'],
    playerRankings: { p1: { A: 1, B: 2 } } // only the host ranked
  });
  const result = processGameAction(io, game, 'startGame', {}, 'p1');

  assert.equal(result.status, 'waiting');
  assert.deepEqual(result.players, ['p1', 'p2', 'p3'], 'nobody is dropped on a refused start');
});

// ---- emcee (non-player) host ------------------------------------------------

test('an emcee host can start a game of two real players', () => {
  const game = makeGame({
    status: 'waiting',
    host: 'h1', // not in players
    players: ['p2', 'p3'],
    playerPoints: { p2: 100, p3: 100 },
    playerNames: { h1: 'Emma', p2: 'Alice', p3: 'Carol' }
  });
  const result = processGameAction(io, game, 'startGame', {}, 'h1');
  assert.equal(result.status, 'playing');
});

test('an emcee host cannot place a bet', () => {
  const game = makeGame({
    host: 'h1',
    players: ['p2', 'p3'],
    playerPoints: { p2: 100, p3: 100 },
    playerNames: { h1: 'Emma', p2: 'Alice', p3: 'Carol' }
  });
  processGameAction(io, game, 'proposeWager', { player1: 'p2', player2: 'p3', odds1: 1, odds2: 1 }, 'h1');

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 10 }, 'h1');
  assert.equal(wagerStates.get('TEST01').playerChoices.h1, undefined, 'host has no balance to bet');
});

// ---- removePlayer (host kick) -----------------------------------------------

test('the host can remove a player from a waiting game', () => {
  const game = makeGame({ status: 'waiting' });
  playerRegistry.set('p3', { socketID: 'sock3', playerName: 'Carol', gameId: 'TEST01', lastSeen: 0 });

  processGameAction(io, game, 'removePlayer', { playerId: 'p3' }, 'p1');

  assert.deepEqual(game.players, ['p1', 'p2']);
  assert.equal(game.playerPoints.p3, undefined);
  assert.equal(game.playerNames.p3, undefined);
  assert.equal(playerRegistry.get('p3').gameId, null, 'kicked player is detached from the game');

  // The kicked player's socket is notified directly
  const notice = events.find(([event, , target]) => event === 'removedFromGame' && target === 'sock3');
  assert.ok(notice, 'removedFromGame sent to the kicked socket');
});

test('removePlayer recomputes rankingsComplete for the remaining players', () => {
  const game = makeGame({
    status: 'waiting',
    categories: ['A', 'B'],
    playerRankings: { p1: { A: 1, B: 2 }, p2: { A: 2, B: 1 } },
    rankingsComplete: false
  });

  processGameAction(io, game, 'removePlayer', { playerId: 'p3' }, 'p1');
  assert.equal(game.rankingsComplete, true);
});

test('removePlayer is host-only, waiting-only, and cannot remove the host', () => {
  const playing = makeGame(); // status 'playing'
  processGameAction(io, playing, 'removePlayer', { playerId: 'p3' }, 'p1');
  assert.deepEqual(playing.players, ['p1', 'p2', 'p3'], 'no kicks after the game starts');

  const game = makeGame({ status: 'waiting' });
  processGameAction(io, game, 'removePlayer', { playerId: 'p3' }, 'p2'); // not host
  assert.deepEqual(game.players, ['p1', 'p2', 'p3']);

  processGameAction(io, game, 'removePlayer', { playerId: 'p1' }, 'p1'); // host removing self
  assert.deepEqual(game.players, ['p1', 'p2', 'p3']);
});

// ---- proposeWager -----------------------------------------------------------

test('proposeWager stores contestants by ID and derives display names', () => {
  const game = makeGame();
  propose(io, game, { odds1: 1, odds2: 2, category: 'Trivia' });

  const state = wagerStates.get('TEST01');
  assert.deepEqual(state.contestants, ['p1', 'p2']);
  assert.deepEqual(state.options, ['Bob', 'Alice']);
  assert.deepEqual(state.odds, [1, 2]);
  assert.equal(state.isActive, true);

  const emitted = lastEvent(events, 'wagerProposed');
  assert.deepEqual(emitted.contestants, ['p1', 'p2']);
  assert.deepEqual(emitted.options, ['Bob', 'Alice']);
  assert.equal(emitted.category, 'Trivia');
});

test('proposeWager is host-only', () => {
  const game = makeGame();
  processGameAction(io, game, 'proposeWager', { player1: 'p1', player2: 'p2' }, 'p2');
  assert.equal(wagerStates.has('TEST01'), false);
  assert.equal(lastEvent(events, 'wagerProposed'), null);
});

test('proposeWager rejects contestants who are not in the game, or identical', () => {
  const game = makeGame();
  processGameAction(io, game, 'proposeWager', { player1: 'p1', player2: 'ghost' }, 'p1');
  assert.equal(wagerStates.has('TEST01'), false);

  processGameAction(io, game, 'proposeWager', { player1: 'p2', player2: 'p2' }, 'p1');
  assert.equal(wagerStates.has('TEST01'), false);
});

// ---- makeChoice -------------------------------------------------------------

test('makeChoice records the bet and keeps the choice secret in the broadcast', () => {
  const game = makeGame();
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 30 }, 'p3');

  const state = wagerStates.get('TEST01');
  assert.deepEqual(state.playerChoices.p3, { choice: 0, points: 30 });

  const emitted = lastEvent(events, 'choiceMade');
  assert.equal(emitted.playerId, 'p3');
  assert.equal(emitted.choice, null); // secret until resolution
  assert.equal(emitted.points, 30);
});

test('makeChoice rejects non-positive bets and bets above the balance', () => {
  const game = makeGame();
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 0 }, 'p3');
  processGameAction(io, game, 'makeChoice', { choice: 0, points: -5 }, 'p3');
  // p3 has 100 points: a bet can never exceed the balance
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 101 }, 'p3');

  assert.equal(wagerStates.get('TEST01').playerChoices.p3, undefined);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 100 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3.points, 100);
});

test('a player at the floor can bet their whole balance, but no more', () => {
  const game = makeGame({ playerPoints: { p1: 100, p2: 100, p3: 10 } });
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 11 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3, undefined);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 10 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3.points, 10);
});

test('the game-level maxBetSize caps every bet', () => {
  const game = makeGame({ maxBetSize: 30 });
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 31 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3, undefined);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 30 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3.points, 30);
});

test('a contestant may only bet on themselves', () => {
  const game = makeGame();
  propose(io, game); // contestants p1 (choice 0) and p2 (choice 1)

  // p1 betting on p2 is rejected
  processGameAction(io, game, 'makeChoice', { choice: 1, points: 10 }, 'p1');
  assert.equal(wagerStates.get('TEST01').playerChoices.p1, undefined);

  // p1 betting on themselves is accepted
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 10 }, 'p1');
  assert.equal(wagerStates.get('TEST01').playerChoices.p1.choice, 0);

  // p3 is not in the contest and may bet on either side
  processGameAction(io, game, 'makeChoice', { choice: 1, points: 10 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3.choice, 1);
});

test('makeChoice is ignored when no wager is active', () => {
  const game = makeGame();
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 10 }, 'p3');
  assert.equal(lastEvent(events, 'choiceMade'), null);
});

// ---- resolveWager -----------------------------------------------------------

test('resolution pays winners points × odds (floored) and losers lose their stake', () => {
  const game = makeGame();
  propose(io, game, { odds1: 1, odds2: 2.5 });

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 30 }, 'p1'); // on self, loses
  processGameAction(io, game, 'makeChoice', { choice: 1, points: 20 }, 'p2'); // on self, wins at 2.5x
  processGameAction(io, game, 'makeChoice', { choice: 1, points: 15 }, 'p3'); // bystander, wins at 2.5x

  processGameAction(io, game, 'resolveWager', { correctChoice: 1 }, 'p1');

  assert.equal(game.playerPoints.p1, 100 - 30);
  assert.equal(game.playerPoints.p2, 100 + Math.floor(20 * 2.5)); // +50
  assert.equal(game.playerPoints.p3, 100 + Math.floor(15 * 2.5)); // +37

  const emitted = lastEvent(events, 'wagerResolved');
  assert.equal(emitted.winnerPlayerId, 'p2');
  const p3Result = emitted.results.find(r => r.playerId === 'p3');
  assert.equal(p3Result.correct, true);
  assert.equal(p3Result.isWinner, false); // a correct bystander is not the contest winner
});

test('resolution is host-only and requires an active wager', () => {
  const game = makeGame();
  propose(io, game);
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 10 }, 'p3');

  processGameAction(io, game, 'resolveWager', { correctChoice: 0 }, 'p2'); // not host
  assert.equal(game.playerPoints.p3, 100);
  assert.equal(lastEvent(events, 'wagerResolved'), null);

  processGameAction(io, game, 'resolveWager', { correctChoice: 0 }, 'p1');
  assert.equal(game.playerPoints.p3, 110);

  // A second resolve of the same wager does nothing
  processGameAction(io, game, 'resolveWager', { correctChoice: 0 }, 'p1');
  assert.equal(game.playerPoints.p3, 110);
});

test('wager counts increment only for contestants, not bystander bettors', () => {
  const game = makeGame();
  propose(io, game);
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 10 }, 'p1');
  processGameAction(io, game, 'makeChoice', { choice: 1, points: 10 }, 'p3');
  processGameAction(io, game, 'resolveWager', { correctChoice: 0 }, 'p1');

  assert.equal(game.playerWagerCount.p1, 1);
  assert.equal(game.playerWagerCount.p3, undefined);
});

test('resolution resets the wager state for the next round', () => {
  const game = makeGame();
  propose(io, game);
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 10 }, 'p3');
  processGameAction(io, game, 'resolveWager', { correctChoice: 0 }, 'p1');

  const state = wagerStates.get('TEST01');
  assert.equal(state.isActive, false);
  assert.deepEqual(state.contestants, []);
  assert.deepEqual(state.playerChoices, {});
});

// ---- minimum balance floor --------------------------------------------------

test('losses are clamped at the minimum balance floor', () => {
  const game = makeGame({ minBalance: 10 });
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 100 }, 'p3'); // all-in
  processGameAction(io, game, 'resolveWager', { correctChoice: 1 }, 'p1');

  assert.equal(game.playerPoints.p3, 10, 'balance stops at the floor');
  const emitted = lastEvent(events, 'wagerResolved');
  assert.equal(emitted.results.find(r => r.playerId === 'p3').pointsChange, '-90',
    'reported change is the actual clamped loss');
});

test('a losing bet placed from the floor costs nothing', () => {
  const game = makeGame({ minBalance: 10, playerPoints: { p1: 100, p2: 100, p3: 10 } });
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 10 }, 'p3');
  processGameAction(io, game, 'resolveWager', { correctChoice: 1 }, 'p1');

  assert.equal(game.playerPoints.p3, 10, 'floor player keeps their balance');
  const emitted = lastEvent(events, 'wagerResolved');
  assert.equal(emitted.results.find(r => r.playerId === 'p3').pointsChange, '-0');
});

test('losses comfortably above the floor are not clamped', () => {
  const game = makeGame({ minBalance: 10 });
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 30 }, 'p3');
  processGameAction(io, game, 'resolveWager', { correctChoice: 1 }, 'p1');

  assert.equal(game.playerPoints.p3, 70, 'full stake lost away from the floor');
});

test('with minimum balance 0 a player can bust and can no longer bet', () => {
  const game = makeGame({ minBalance: 0, playerPoints: { p1: 100, p2: 100, p3: 40 } });
  propose(io, game);
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 40 }, 'p3');
  processGameAction(io, game, 'resolveWager', { correctChoice: 1 }, 'p1');

  assert.equal(game.playerPoints.p3, 0, 'busted to zero');

  // Next wager: the busted player cannot place any bet
  propose(io, game);
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 1 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3, undefined);
});

// ---- bounty rules -----------------------------------------------------------

function resolveWithBounty(bountyConfig, bets, opts = {}) {
  const game = makeGame({ bounty: bountyConfig, ...opts });
  propose(io, game);
  for (const [pid, choice, points] of bets) {
    processGameAction(io, game, 'makeChoice', { choice, points }, pid);
  }
  processGameAction(io, game, 'resolveWager', { correctChoice: 1 }, 'p1');
  return { game, emitted: lastEvent(events, 'wagerResolved') };
}

test('bounty None awards nothing extra', () => {
  const { game, emitted } = resolveWithBounty('None', [['p2', 1, 20], ['p3', 1, 10]]);
  assert.equal(emitted.bountyAmount, null);
  assert.equal(game.playerPoints.p2, 120); // only the winnings
});

test('bounty Max awards the largest bet to the contest winner', () => {
  const { game, emitted } = resolveWithBounty('Max', [['p1', 0, 30], ['p2', 1, 20]]);
  assert.equal(emitted.bountyAmount, 30);
  // p2 wins 20 at 1x plus the 30 bounty
  assert.equal(game.playerPoints.p2, 100 + 20 + 30);
});

test('bounty Min awards the smallest bet', () => {
  const { emitted } = resolveWithBounty('Min', [['p1', 0, 30], ['p2', 1, 20], ['p3', 0, 5]]);
  assert.equal(emitted.bountyAmount, 5);
});

test('bounty Average awards the floored mean of all bets', () => {
  const { emitted } = resolveWithBounty('Average', [['p1', 0, 30], ['p2', 1, 20], ['p3', 0, 11]]);
  assert.equal(emitted.bountyAmount, Math.floor((30 + 20 + 11) / 3)); // 20
});

test('bounty Fixed awards the configured amount', () => {
  const { game, emitted } = resolveWithBounty('Fixed', [['p2', 1, 20]], { bountyAmount: 25 });
  assert.equal(emitted.bountyAmount, 25);
  assert.equal(game.playerPoints.p2, 100 + 20 + 25);
});

// ---- cancelWager ------------------------------------------------------------

test('cancelWager nullifies all bets without touching points', () => {
  const game = makeGame();
  propose(io, game);
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 40 }, 'p3');

  processGameAction(io, game, 'cancelWager', {}, 'p1');

  assert.equal(game.playerPoints.p3, 100);
  assert.equal(wagerStates.has('TEST01'), false);
  assert.notEqual(lastEvent(events, 'wagerCancelled'), null);
});

test('cancelWager is host-only', () => {
  const game = makeGame();
  propose(io, game);
  processGameAction(io, game, 'cancelWager', {}, 'p2');
  assert.equal(wagerStates.get('TEST01').isActive, true);
});

// ---- submitRankings ---------------------------------------------------------

test('rankings must be a complete permutation of 1..N', () => {
  const game = makeGame({ categories: ['A', 'B', 'C'] });

  // Incomplete
  processGameAction(io, game, 'submitRankings', { rankings: { A: 1, B: 2 } }, 'p1');
  assert.equal(game.playerRankings.p1, undefined);

  // Duplicate ranks
  processGameAction(io, game, 'submitRankings', { rankings: { A: 1, B: 1, C: 2 } }, 'p1');
  assert.equal(game.playerRankings.p1, undefined);

  // Out of range
  processGameAction(io, game, 'submitRankings', { rankings: { A: 1, B: 2, C: 4 } }, 'p1');
  assert.equal(game.playerRankings.p1, undefined);

  // Valid
  processGameAction(io, game, 'submitRankings', { rankings: { A: 2, B: 1, C: 3 } }, 'p1');
  assert.deepEqual(game.playerRankings.p1, { A: 2, B: 1, C: 3 });
});

test('rankingsComplete fires only when every player has submitted', () => {
  const game = makeGame({ categories: ['A', 'B'] });

  processGameAction(io, game, 'submitRankings', { rankings: { A: 1, B: 2 } }, 'p1');
  processGameAction(io, game, 'submitRankings', { rankings: { A: 2, B: 1 } }, 'p2');
  assert.equal(game.rankingsComplete, false);
  assert.equal(lastEvent(events, 'rankingsComplete'), null);

  processGameAction(io, game, 'submitRankings', { rankings: { A: 1, B: 2 } }, 'p3');
  assert.equal(game.rankingsComplete, true);
  const emitted = lastEvent(events, 'rankingsComplete');
  assert.deepEqual(emitted.categories, ['A', 'B']);
});
