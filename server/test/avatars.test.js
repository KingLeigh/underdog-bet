// Avatars are handed out once per game: lib/avatars.js and the setAvatar
// action.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { AVATAR_IDS, assignAvatar, setAvatar } = require('../lib/avatars');
const { processGameAction } = require('../lib/gameActions');

const io = { to: () => ({ emit() {} }), in: () => ({ socketsLeave() {} }) };
const gameWith = (avatars) => ({
  id: 'G', players: Object.keys(avatars), playerAvatars: { ...avatars },
  playerNames: {}, playerPoints: {}, playerRankings: {}
});

test('a free avatar is granted as asked', () => {
  const game = gameWith({ p1: 'lion' });
  game.players.push('p2');
  assert.equal(assignAvatar(game, 'p2', 'fox'), 'fox');
});

test('a taken or unknown avatar gets a free one instead', () => {
  const game = gameWith({ p1: 'lion' });
  game.players.push('p2');
  for (const asked of ['lion', 'not-an-avatar', undefined]) {
    const got = assignAvatar(game, 'p2', asked);
    assert.ok(AVATAR_IDS.includes(got));
    assert.notEqual(got, 'lion');
  }
});

test('every player gets a different avatar while there are enough', () => {
  const game = gameWith({});
  for (let i = 0; i < AVATAR_IDS.length; i++) {
    const pid = `p${i}`;
    game.players.push(pid);
    setAvatar(game, pid, 'lion'); // everyone asks for the same one
  }
  assert.equal(new Set(Object.values(game.playerAvatars)).size, AVATAR_IDS.length);

  game.players.push('extra'); // one player too many: a repeat, not nothing
  setAvatar(game, 'extra');
  assert.ok(AVATAR_IDS.includes(game.playerAvatars.extra));
});

test('setAvatar swaps to a free avatar and refuses a taken one', () => {
  const game = gameWith({ p1: 'lion', p2: 'fox' });
  processGameAction(io, game, 'setAvatar', { avatar: 'owl' }, 'p1');
  assert.equal(game.playerAvatars.p1, 'owl');
  processGameAction(io, game, 'setAvatar', { avatar: 'fox' }, 'p1');
  assert.equal(game.playerAvatars.p1, 'owl', 'fox is taken: p1 keeps owl');
  processGameAction(io, game, 'setAvatar', { avatar: 'lion' }, 'p2');
  assert.equal(game.playerAvatars.p2, 'lion', 'lion was freed by p1');
});

test('a removed player frees their avatar', () => {
  const game = gameWith({ p1: 'lion', p2: 'fox' });
  game.host = 'p1';
  game.status = 'waiting';
  processGameAction(io, game, 'removePlayer', { playerId: 'p2' }, 'p1');
  assert.equal(game.playerAvatars.p2, undefined);
  game.players.push('p3');
  assert.equal(assignAvatar(game, 'p3', 'fox'), 'fox');
});
