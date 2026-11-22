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

// Get or create player ID for a socket. When joining a specific game, a
// matching player name reconnects that player — but only within that game,
// so the same name in another game never hijacks someone else's identity.
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
      if (playerData.playerName === playerName && playerData.gameId === gameId) {
        // Found existing player with same name in this game, update socket ID
        playerData.socketID = socket.id;
        playerData.lastSeen = Date.now();
        return playerID;
      }
    }
  }

  // Create new player
  const playerID = generatePlayerID();
  playerRegistry.set(playerID, {
    socketID: socket.id,
    playerName: playerName,
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

// Cleanup abandoned games (all players disconnected for more than 30 minutes)
function cleanupAbandonedGames() {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;

  for (const [gameId, game] of gameSessions.entries()) {
    let allPlayersDisconnected = true;
    let lastActivity = 0;

    // Check if any players are still connected
    for (const playerID of game.players) {
      const playerData = playerRegistry.get(playerID);
      if (playerData && playerData.socketID) {
        allPlayersDisconnected = false;
        break;
      }
      // Track the most recent activity
      if (playerData && playerData.lastSeen > lastActivity) {
        lastActivity = playerData.lastSeen;
      }
    }

    // If all players are disconnected and it's been more than 30 minutes
    if (allPlayersDisconnected && (now - lastActivity) > thirtyMinutes) {
      console.log(`Game ${gameId} abandoned for ${Math.round((now - lastActivity) / 60000)} minutes - cleaning up`);
      gameSessions.delete(gameId);
      wagerStates.delete(gameId);

      // Clean up player registry entries for this game
      for (const [playerID, playerData] of playerRegistry.entries()) {
        if (playerData.gameId === gameId) {
          playerRegistry.delete(playerID);
        }
      }
    }
  }
}

module.exports = {
  gameSessions,
  wagerStates,
  playerRegistry,
  generateGameId,
  getOrCreatePlayerID,
  getPlayerID,
  addPoints,
  getPlayerPoints,
  getWagerState,
  createInitialWagerState,
  cleanupAbandonedGames
};
