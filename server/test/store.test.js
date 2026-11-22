// Tests for player identity and name handling in lib/store.js.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { playerRegistry, getOrCreatePlayerID, displayName } = require('../lib/store');

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
