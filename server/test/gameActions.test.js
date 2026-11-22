// Unit tests for the game rules in lib/gameActions.js.
//
// These tests pin down the wager/bounty/ranking rules — the part of the
// server where a silent regression corrupts scores. They are written
// against observable behavior (state changes and emitted events), not
// implementation details, so they should only fail when a rule changes.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { processGameAction } = require('../lib/gameActions');
const { wagerStates } = require('../lib/store');

// ---- Test helpers -----------------------------------------------------------

// Fake io capturing room emits as [event, payload] pairs
function fakeIo(events) {
  return {
    to: () => ({
      emit: (event, payload) => events.push([event, payload])
    })
  };
}

function lastEvent(events, name) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i][0] === name) return events[i][1];
  }
  return null;
}

// A 3-player game: p1 hosts, all at 100 points
function makeGame(overrides = {}) {
  return {
    id: 'TEST01',
    host: 'p1',
    players: ['p1', 'p2', 'p3'],
    status: 'playing',
    startingPoints: 100,
    minBetSize: null,
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

test('makeChoice rejects non-positive and over-limit bets', () => {
  const game = makeGame();
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 0 }, 'p3');
  processGameAction(io, game, 'makeChoice', { choice: 0, points: -5 }, 'p3');
  // p3 has 100 points: cap is max(50, 100) = 100
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 101 }, 'p3');

  assert.equal(wagerStates.get('TEST01').playerChoices.p3, undefined);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 100 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3.points, 100);
});

test('a player with few points may still bet up to 50 (scores can go negative)', () => {
  const game = makeGame({ playerPoints: { p1: 100, p2: 100, p3: 10 } });
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 50 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3.points, 50);
});

test('the game-level maxBetSize caps every bet', () => {
  const game = makeGame({ maxBetSize: 30 });
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 31 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3, undefined);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 30 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3.points, 30);
});

test('a configured minimum bet rejects smaller bets and accepts the minimum', () => {
  const game = makeGame({ minBetSize: 25 });
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 24 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3, undefined);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 25 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3.points, 25);
});

test('a broke player can always bet at least the minimum, even when it exceeds the 50 floor', () => {
  // min bet 80, player has 0 points: the betting cap rises to the minimum
  // so they can still "bet out of the hole"
  const game = makeGame({ minBetSize: 80, playerPoints: { p1: 100, p2: 100, p3: 0 } });
  propose(io, game);

  processGameAction(io, game, 'makeChoice', { choice: 0, points: 80 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3.points, 80);

  // ...but not more than the raised floor
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 81 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3.points, 80);
});

test('without a configured minimum, the minimum bet is 1', () => {
  const game = makeGame();
  propose(io, game);
  processGameAction(io, game, 'makeChoice', { choice: 0, points: 1 }, 'p3');
  assert.equal(wagerStates.get('TEST01').playerChoices.p3.points, 1);
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
