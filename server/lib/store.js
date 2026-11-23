// In-memory game state (no database yet — see TODO.md "Add a database layer").
// Everything here is lost on server restart.

const gameSessions = new Map(); // gameId -> game state
const wagerStates = new Map(); // gameId -> wager state with odds
const playerRegistry = new Map(); // playerID -> { socketID, playerName, gameId, lastSeen }

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

// Get or create player ID for a socket. When joining a specific game, a
// matching player name (case-insensitive) reconnects that player — but only
// within that game, so the same name in another game never hijacks someone
// else's identity.
function getOrCreatePlayerID(socket, playerName, gameId = null) {
  // Check if this socket already has a player ID
  for (const [playerID, playerData] of playerRegistry.entries()) {
    if (playerData.socketID === socket.id) {
      playerData.lastSeen = Date.now();
      return playerID;
    }
  }

  // Check if this player name already exists in the game being joined
  if (gameId) {
    for (const [playerID, playerData] of playerRegistry.entries()) {
      if (nameKey(playerData.playerName) === nameKey(playerName) && playerData.gameId === gameId) {
        // Found existing player with same name in this game, update socket ID
        playerData.socketID = socket.id;
        playerData.lastSeen = Date.now();
        return playerID;
      }
    }
  }

  // Create new player (the display name keeps the first joiner's casing)
  const playerID = generatePlayerID();
  playerRegistry.set(playerID, {
    socketID: socket.id,
    playerName: displayName(playerName),
    gameId: null,
    lastSeen: Date.now()
  });
  return playerID;
}

// Get player ID for a socket
function getPlayerID(socket) {
  for (const [playerID, playerData] of playerRegistry.entries()) {
    if (playerData.socketID === socket.id) {
      return playerID;
    }
  }
  return null;
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

function getWagerState(gameId) {
  return wagerStates.get(gameId) || null;
}

function createInitialWagerState() {
  return {
    isActive: false,
    options: [],
    contestants: [], // playerIDs of the two players being bet on
    odds: [1, 1], // Default odds of 1 for each option
    playerChoices: {},
    resolved: false,
    correctOption: null
  };
}

// Keep the player-ID counter ahead of any restored ID so new players
// never collide with ones loaded from the database
function ensurePlayerCounterAbove(playerID) {
  const n = Number(String(playerID).replace(/^p/, ''));
  if (Number.isFinite(n) && n >= nextPlayerID) {
    nextPlayerID = n + 1;
  }
}

// Restore a persisted { game, wager } snapshot into the in-memory maps.
// Registry entries are rebuilt from the game's own player names (socketIDs
// are dead after a restart anyway) so rejoin-by-name keeps working.
function restoreGame(snapshot) {
  const game = snapshot && snapshot.game;
  if (!game || !game.id) return false;

  gameSessions.set(game.id, game);
  wagerStates.set(game.id, snapshot.wager || createInitialWagerState());

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

// Note: there is deliberately no abandoned-game cleanup. Games live in
// memory until the server restarts, so hosts can create games well in
// advance. Revisit expiry/TTL when the database layer lands (see TODO.md).

module.exports = {
  gameSessions,
  wagerStates,
  playerRegistry,
  generateGameId,
  getOrCreatePlayerID,
  getPlayerID,
  displayName,
  addPoints,
  getPlayerPoints,
  getWagerState,
  createInitialWagerState,
  restoreGame
};
