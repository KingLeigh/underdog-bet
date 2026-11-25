// Tests for player identity and name handling in lib/store.js, and the
// socket <-> player bookkeeping behind every socket event.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  playerRegistry,
  getOrCreatePlayerID,
  getPlayerID,
  bindSocket,
  unbindSocket,
  displayName
} = require('../lib/store');

beforeEach(() => {
  playerRegistry.clear();
});

test('displayName trims and upper-cases the first letter', () => {
  assert.equal(displayName('alice'), 'Alice');
  assert.equal(displayName('  bob  '), 'Bob');
  assert.equal(displayName('CAROL'), 'CAROL'); // only the first letter is forced up
  assert.equal(displayName(''), '');
  assert.equal(displayName(null), '');
});

test('name matching for reconnection is case-insensitive within a game', () => {
  const id1 = getOrCreatePlayerID({ id: 'sock1' }, 'alice', 'G1');
  playerRegistry.get(id1).gameId = 'G1'; // the join handler normally sets this

  const id2 = getOrCreatePlayerID({ id: 'sock2' }, 'ALICE', 'G1');
  assert.equal(id2, id1, 'ALICE reconnects as alice in the same game');
  assert.equal(playerRegistry.get(id1).socketID, 'sock2', 'socket updated on reconnect');
  assert.equal(getPlayerID({ id: 'sock2' }), id1, 'the new socket acts as alice');
  assert.equal(getPlayerID({ id: 'sock1' }), null, 'the old one no longer does');
  assert.equal(playerRegistry.get(id1).playerName, 'Alice', 'display name keeps first-join form');
});

test('the same name in a different game is a different player', () => {
  const id1 = getOrCreatePlayerID({ id: 'sock1' }, 'Alice', 'G1');
  playerRegistry.get(id1).gameId = 'G1';

  const id2 = getOrCreatePlayerID({ id: 'sock2' }, 'alice', 'G2');
  assert.notEqual(id2, id1);
});

test('whitespace around a name does not create a new identity', () => {
  const id1 = getOrCreatePlayerID({ id: 'sock1' }, 'Alice', 'G1');
  playerRegistry.get(id1).gameId = 'G1';

  const id2 = getOrCreatePlayerID({ id: 'sock2' }, '  alice ', 'G1');
  assert.equal(id2, id1);
});

// ---- socket <-> player ------------------------------------------------------

test('a new player is resolved from their socket', () => {
  const pid = getOrCreatePlayerID({ id: 's1' }, 'Ann');
  assert.equal(getPlayerID({ id: 's1' }), pid);
  assert.equal(getOrCreatePlayerID({ id: 's1' }, 'Ann'), pid, 'same socket, same player');
  assert.equal(getPlayerID({ id: 'nobody' }), null);
});

test('rejoining from a new socket moves the player off the old one', () => {
  const pid = getOrCreatePlayerID({ id: 's1' }, 'Ann');
  bindSocket(pid, 's2');

  assert.equal(getPlayerID({ id: 's2' }), pid);
  assert.equal(getPlayerID({ id: 's1' }), null, 'the old socket no longer acts as Ann');

  // The old socket finally times out: Ann stays connected on the new one
  assert.equal(unbindSocket('s1'), null);
  assert.equal(playerRegistry.get(pid).socketID, 's2');

  assert.equal(unbindSocket('s2'), pid);
  assert.equal(playerRegistry.get(pid).socketID, null);
  assert.equal(getPlayerID({ id: 's2' }), null);
});

test('a socket that rebinds to another player unbinds the first', () => {
  const ann = getOrCreatePlayerID({ id: 's1' }, 'Ann');
  const bo = getOrCreatePlayerID({ id: 's2' }, 'Bo');
  bindSocket(bo, 's1');

  assert.equal(getPlayerID({ id: 's1' }), bo);
  assert.equal(playerRegistry.get(ann).socketID, null, 'Ann is no longer on s1');
});
