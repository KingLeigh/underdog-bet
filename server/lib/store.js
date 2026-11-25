// In-memory game state: the synchronous source of truth, written through
// to Postgres by persistence.js when DATABASE_URL is set. Each game object
// carries everything about the game, its current contest included
// (game.contest — see gameActions.js).

const gameSessions = new Map(); // gameId -> game state
const playerRegistry = new Map(); // playerID -> { socketID, playerName, gameId, lastSeen }
// Reverse index of playerRegistry's socketIDs, so resolving the player
// behind a socket event is a lookup, not a scan. Written only through
// bindSocket/unbindSocket; reads are checked against the registry.
const socketPlayers = new Map(); // socketID -> playerID

let nextPlayerID = 1;

function generatePlayerID() {
  return `p${nextPlayerID++}`;
}

function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Case-insensitive key used for matching player names on reconnection
function nameKey(name) {
  return (name || '').trim().toLowerCase();
}

// Display form of a player name: trimmed, first letter upper-cased
function displayName(name) {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
}

// Point a player at their current socket (a join, a rejoin, a new player).
// The player's previous socket stops resolving to them, and any other
// player still pointing at this socket is unbound from it.
function bindSocket(playerID, socketID) {
  const data = playerRegistry.get(playerID);
  if (!data) return;
  if (data.socketID && data.socketID !== socketID) socketPlayers.delete(data.socketID);
  const prev = socketPlayers.get(socketID);
  if (prev && prev !== playerID && playerRegistry.get(prev)?.socketID === socketID) {
    playerRegistry.get(prev).socketID = null;
  }
  data.socketID = socketID;
  data.lastSeen = Date.now();
  socketPlayers.set(socketID, playerID);
}

// A socket went away: unbind it, returning the player it belonged to (if
// it was still that player's current socket)
function unbindSocket(socketID) {
  const playerID = getPlayerID({ id: socketID });
  socketPlayers.delete(socketID);
  if (playerID) playerRegistry.get(playerID).socketID = null;
  return playerID;
}

// Get or create player ID for a socket. When joining a specific game, a
// matching player name (case-insensitive) reconnects that player — but only
// within that game, so the same name in another game never hijacks someone
// else's identity.
function getOrCreatePlayerID(socket, playerName, gameId = null) {
  // Check if this socket already has a player ID
  const existing = getPlayerID(socket);
  if (existing) {
    playerRegistry.get(existing).lastSeen = Date.now();
    return existing;
  }

  // Check if this player name already exists in the game being joined
  if (gameId) {
    for (const [playerID, playerData] of playerRegistry.entries()) {
      if (nameKey(playerData.playerName) === nameKey(playerName) && playerData.gameId === gameId) {
        // Found existing player with same name in this game, update socket ID
        bindSocket(playerID, socket.id);
        return playerID;
      }
    }
  }

  // Create new player (the display name keeps the first joiner's casing)
  const playerID = generatePlayerID();
  playerRegistry.set(playerID, {
    socketID: null,
    playerName: displayName(playerName),
    gameId: null,
    lastSeen: Date.now()
  });
  bindSocket(playerID, socket.id);
  return playerID;
}

// Get player ID for a socket
function getPlayerID(socket) {
  const playerID = socketPlayers.get(socket.id);
  return playerID && playerRegistry.get(playerID)?.socketID === socket.id ? playerID : null;
}

// Point management. Callers are responsible for clamping losses at the
// game's minimum balance floor; balances never go negative through wagers.
function addPoints(game, playerId, points) {
  if (game.playerPoints[playerId] !== undefined) {
    game.playerPoints[playerId] += points;
    return true;
  }
  return false;
}

function getPlayerPoints(game, playerId) {
  return game.playerPoints[playerId] || 0;
}

// Keep the player-ID counter ahead of any restored ID so new players
// never collide with ones loaded from the database
function ensurePlayerCounterAbove(playerID) {
  const n = Number(String(playerID).replace(/^p/, ''));
  if (Number.isFinite(n) && n >= nextPlayerID) {
    nextPlayerID = n + 1;
  }
}

// Restore a persisted { game } snapshot into memory. Registry entries are
// rebuilt from the game's own player names (socketIDs are dead after a
// restart anyway) so rejoin-by-name keeps working.
function restoreGame(snapshot) {
  const game = snapshot && snapshot.game;
  if (!game || !game.id) return false;

  gameSessions.set(game.id, game);

  // Migration: older snapshots tracked schedule progress with a cursor
  // (matchupIndex) instead of per-matchup played flags
  if (Array.isArray(game.matchups) && typeof game.matchupIndex === 'number') {
    game.matchups.forEach((m, i) => {
      if (i < game.matchupIndex && !m.skipped) m.played = true;
    });
    delete game.matchupIndex;
  }

  for (const [pid, name] of Object.entries(game.playerNames || {})) {
    ensurePlayerCounterAbove(pid);
    if (!playerRegistry.has(pid)) {
      playerRegistry.set(pid, {
        socketID: null,
        playerName: name,
        gameId: game.id,
        lastSeen: Date.now()
      });
    }
  }
  return true;
}

// Remove a game and everything tied to it from memory (the manager's
// Delete button). The database row is removed separately by persistence.
function deleteGame(gameId) {
  if (!gameSessions.has(gameId)) return false;
  gameSessions.delete(gameId);
  for (const [playerID, playerData] of playerRegistry.entries()) {
    if (playerData.gameId === gameId) {
      if (playerData.socketID) socketPlayers.delete(playerData.socketID);
      playerRegistry.delete(playerID);
    }
  }
  return true;
}

// Note: there is deliberately no abandoned-game cleanup. Games live in
// memory until the server restarts, so hosts can create games well in
// advance. Revisit expiry/TTL when the database layer lands (see TODO.md).

module.exports = {
  gameSessions,
  playerRegistry,
  generateGameId,
  getOrCreatePlayerID,
  getPlayerID,
  bindSocket,
  unbindSocket,
  displayName,
  addPoints,
  getPlayerPoints,
  restoreGame,
  deleteGame
};
