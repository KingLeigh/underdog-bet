// Player avatars: each player in a game has one, and no two players share
// one while there are enough to go round. The list itself lives with the
// client, which draws them (client/src/lib/avatars.json); the server only
// hands out and checks IDs.

const AVATAR_IDS = require('../../client/src/lib/avatars.json').map(a => a.id);

// Avatars held by the game's other players
function takenAvatars(game, playerID) {
  const avatars = game.playerAvatars || {};
  return new Set(game.players.filter(pid => pid !== playerID && avatars[pid]).map(pid => avatars[pid]));
}

// The avatar a player ends up with: the one they asked for if it's free,
// else the one they already have, else a random free one (a random one
// outright once a game has more players than avatars)
function assignAvatar(game, playerID, requested) {
  const taken = takenAvatars(game, playerID);
  if (AVATAR_IDS.includes(requested) && !taken.has(requested)) return requested;
  const current = game.playerAvatars && game.playerAvatars[playerID];
  if (current && !taken.has(current)) return current;
  const free = AVATAR_IDS.filter(id => !taken.has(id));
  const pool = free.length > 0 ? free : AVATAR_IDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function setAvatar(game, playerID, requested) {
  if (!game.playerAvatars) game.playerAvatars = {};
  game.playerAvatars[playerID] = assignAvatar(game, playerID, requested);
}

module.exports = { AVATAR_IDS, takenAvatars, assignAvatar, setAvatar };
