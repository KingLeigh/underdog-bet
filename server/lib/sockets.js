// Socket.IO connection handling: joining, creating, reconnecting, and
// dispatching game actions.

const {
  gameSessions,
  wagerStates,
  playerRegistry,
  generateGameId,
  getOrCreatePlayerID,
  getPlayerID,
  displayName,
  createInitialWagerState
} = require('./store');
const { processGameAction } = require('./gameActions');
const persistence = require('./persistence');

// Whether a contest is live (proposed, not yet resolved). Sent with every
// gameJoined so a rejoining client knows whether the contest it remembers
// still exists — a phone that slept through a resolution must drop it.
function wagerIsLive(gameId) {
  const wagerState = wagerStates.get(gameId);
  return !!(wagerState && wagerState.isActive && !wagerState.resolved);
}

// Send the active wager state (if any) to a player who just (re)joined a
// game — or, between contests, the last result so the Result screen
// survives a sleep or a refresh
function sendActiveWagerTo(socket, game, recipientPlayerID) {
  const wagerState = wagerStates.get(game.id);
  if (!wagerState) return;
  if (!wagerIsLive(game.id)) {
    if (wagerState.lastResult) {
      socket.emit('wagerResolved', { ...wagerState.lastResult, replay: true });
    }
    return;
  }

  // Send wager options
  socket.emit('wagerProposed', {
    options: wagerState.options,
    contestants: wagerState.contestants,
    odds: wagerState.odds,
    category: wagerState.category || '',
    challenge: wagerState.challenge || '',
    betsLockAt: wagerState.betsLockAt || null,
    matchupNumber: wagerState.matchupNumber || null
  });

  // Send current player choices (reveal points but keep choices secret,
  // except the recipient's own choice so their bet survives a refresh)
  for (const [choicePlayerId, choiceData] of Object.entries(wagerState.playerChoices)) {
    const choicePlayerName = game.playerNames[choicePlayerId] || 'Unknown Player';
    socket.emit('choiceMade', {
      playerId: choicePlayerId,
      playerName: choicePlayerName,
      hasChosen: true,
      choice: choicePlayerId === recipientPlayerID ? choiceData.choice : null,
      points: choiceData.points // Show the wager amount for tension
    });
  }
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // Join a game session
    socket.on('joinGame', (data) => {
      const { gameId, playerName } = data;

      if (gameSessions.has(gameId)) {
        const game = gameSessions.get(gameId);
        const playerID = getOrCreatePlayerID(socket, playerName, gameId);

        // Update player registry with game ID
        const playerData = playerRegistry.get(playerID);
        playerData.gameId = gameId;

        // A non-playing (emcee) host reconnecting by name: rejoin as host,
        // never add them as a player
        if (playerID === game.host && !game.players.includes(playerID)) {
          socket.join(gameId);
          socket.emit('gameJoined', { gameId, gameState: game, wasReconnection: true, playerID, isHost: true, wagerActive: wagerIsLive(gameId) });
          sendActiveWagerTo(socket, game, playerID);
          socket.to(gameId).emit('gameStateUpdate', game);
          console.log(`Emcee host ${playerName} (${playerID}) rejoined game ${gameId}`);
          return;
        }

        // Check if this player is already in the game
        if (game.players.includes(playerID)) {
          // Player is rejoining - just update their socket ID
          socket.join(gameId);
          socket.emit('gameJoined', { gameId, gameState: game, wasReconnection: true, playerID, isHost: game.host === playerID, wagerActive: wagerIsLive(gameId) });
          sendActiveWagerTo(socket, game, playerID);

          // Notify other players about the reconnection
          socket.to(gameId).emit('gameStateUpdate', game);
          console.log(`Player ${playerName} (${playerID}) rejoined game ${gameId}`);
        } else {
          // New player trying to join - check if game has already started
          if (game.status === 'playing') {
            socket.emit('error', { message: 'Cannot join game that has already started' });
            return;
          }

          // New player joining - add them to the game
          game.players.push(playerID);
          game.playerPoints[playerID] = game.startingPoints || 100;
          game.playerNames[playerID] = displayName(playerName) || `Player${game.players.length}`;

          socket.join(gameId);
          socket.emit('gameJoined', { gameId, gameState: game, wasReconnection: false, playerID, isHost: game.host === playerID, wagerActive: wagerIsLive(gameId) });

          // Send gameStateUpdate to OTHER players (not the new player) to ensure state consistency
          socket.to(gameId).emit('gameStateUpdate', game);
          console.log(`Player ${playerName || 'Unknown'} (${playerID}) joined game ${gameId}`);

          persistence.saveGame(gameId);
          persistence.logEvent(gameId, 'playerJoined', { playerID, name: game.playerNames[playerID] });
        }
      } else {
        socket.emit('error', { message: 'Game not found' });
      }
    });

    // Create a new game session
    socket.on('createGame', (gameConfig) => {
      const gameId = generateGameId();
      const playerID = getOrCreatePlayerID(socket, gameConfig.playerName);

      // Update player registry with game ID
      const playerData = playerRegistry.get(playerID);
      playerData.gameId = gameId;

      // Emcee mode: hostPlays false creates a host who runs the game but is
      // not a player (no points, no betting, not on the leaderboard)
      const hostPlays = gameConfig.hostPlays !== false;
      const startingPoints = gameConfig.startingPoints || 100;
      // Minimum balance floor: losses are clamped so no player ever drops
      // below it (0 allows busting). Clamped into [0, startingPoints].
      const requestedMinBalance = Number.isFinite(gameConfig.minBalance) ? gameConfig.minBalance : 10;
      const minBalance = Math.max(0, Math.min(requestedMinBalance, startingPoints));
      const maxBetSize = gameConfig.maxBetSize || null;
      const bounty = gameConfig.bounty || 'None';
      const bountyAmount = gameConfig.bountyAmount || null;

      const gameState = {
        id: gameId,
        host: playerID,
        players: hostPlays ? [playerID] : [],
        status: 'waiting',
        createdAt: new Date().toISOString(),
        startingPoints: startingPoints,
        minBalance: minBalance,
        maxBetSize: maxBetSize,
        bounty: bounty,
        bountyAmount: bountyAmount,
        playerPoints: hostPlays ? { [playerID]: startingPoints } : {},
        playerNames: {
          // The host always has a display name, player or not
          [playerID]: displayName(gameConfig.playerName) || `Player${playerID.slice(1)}`
        },
        categories: gameConfig.categories || [],
        challengesPerCategory: gameConfig.challengesPerCategory || [],
        playerRankings: {},
        rankingsComplete: false
      };

      // Initialize wager state
      wagerStates.set(gameId, createInitialWagerState());

      gameSessions.set(gameId, gameState);
      socket.join(gameId);
      socket.emit('gameCreated', { ...gameState, playerID });
      console.log(`Game ${gameId} created by ${gameConfig.playerName || 'Unknown'} (${playerID})`);

      persistence.saveGame(gameId);
      persistence.logEvent(gameId, 'gameCreated', { host: playerID, hostPlays, categories: gameState.categories });
    });

    // Handle game actions
    socket.on('gameAction', (data) => {
      const { gameId, action, payload } = data;
      const game = gameSessions.get(gameId);
      const playerID = getPlayerID(socket);

      if (!playerID) {
        console.error(`No player ID found for socket: ${socket.id}`);
        return;
      }

      // Players act in their game; the host may act without being a player
      // (emcee mode)
      if (game && (game.players.includes(playerID) || playerID === game.host)) {
        // Process the action and update game state
        const updatedState = processGameAction(io, game, action, payload, playerID);
        gameSessions.set(gameId, updatedState);

        // Broadcast updated state to all players in the game
        io.to(gameId).emit('gameStateUpdate', updatedState);

        // Write through to the database. Every action is logged generically;
        // resolveWager also logs a richer contestResolved event (with the
        // computed payouts) from inside gameActions.
        persistence.saveGame(gameId);
        if (action !== 'resolveWager') {
          persistence.logEvent(gameId, action, { playerID, ...payload });
        }
      }
    });

    // Watch a game without a seat: the presentation (TV) screen. The socket
    // joins the game room, so it receives every broadcast the players do, but
    // it has no player identity — gameAction ignores it, choices stay hidden,
    // and it never appears in the roster.
    socket.on('watchGame', (data) => {
      const gameId = data && data.gameId;
      const game = gameId && gameSessions.get(gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      socket.join(gameId);
      socket.emit('gameJoined', {
        gameId,
        gameState: game,
        wasReconnection: false,
        playerID: null,
        isHost: false,
        spectator: true,
        wagerActive: wagerIsLive(gameId)
      });
      sendActiveWagerTo(socket, game, null);
    });

    // Handle player reconnection using playerID
    socket.on('rejoinGame', (data) => {
      const { gameId, playerID } = data;

      if (!gameId || !playerID) {
        socket.emit('error', { message: 'Missing gameId or playerID' });
        return;
      }

      const game = gameSessions.get(gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Check if this playerID exists in the game (the host may rejoin
      // without being a player — emcee mode)
      if (!game.players.includes(playerID) && playerID !== game.host) {
        socket.emit('error', { message: 'Player not found in game' });
        return;
      }

      // Get player data from registry
      const playerData = playerRegistry.get(playerID);
      if (!playerData) {
        socket.emit('error', { message: 'Player not found in registry' });
        return;
      }

      // Update player registry with new socket ID
      playerData.socketID = socket.id;
      playerData.lastSeen = Date.now();

      // Join the game room
      socket.join(gameId);

      // Send game state to reconnecting player
      socket.emit('gameJoined', {
        gameId,
        gameState: game,
        wasReconnection: true,
        playerID,
        isHost: game.host === playerID,
        wagerActive: wagerIsLive(gameId)
      });

      sendActiveWagerTo(socket, game, playerID);

      // Notify other players about the reconnection
      socket.to(gameId).emit('gameStateUpdate', game);
      console.log(`Player ${playerData.playerName} (${playerID}) reconnected to game ${gameId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      // Find the player ID for this socket
      let disconnectedPlayerID = null;
      for (const [playerID, playerData] of playerRegistry.entries()) {
        if (playerData.socketID === socket.id) {
          disconnectedPlayerID = playerID;
          break;
        }
      }

      if (!disconnectedPlayerID) {
        // Socket was never registered (e.g. rapid connect/disconnect during a refresh)
        return;
      }

      // Mark as disconnected but keep player data so they can reconnect.
      // Games are not deleted on disconnect (even the host's); abandoned games
      // are cleaned up by cleanupAbandonedGames after a timeout.
      const playerData = playerRegistry.get(disconnectedPlayerID);
      playerData.socketID = null;
      console.log(`Player ${playerData.playerName} (${disconnectedPlayerID}) disconnected`);
    });
  });
}

module.exports = { registerSocketHandlers };
