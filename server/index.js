require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configure CORS based on environment
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? false // Same-origin only in production (client is served from this server)
    : process.env.CLIENT_URL || "http://localhost:5173",
  methods: ["GET", "POST"]
};

const io = socketIo(server, {
  cors: corsOptions
});

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

// Serve static files from the React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
}

// Game state storage (in-memory for now)
const gameSessions = new Map();

// Wager system data structure
const wagerStates = new Map(); // gameId -> wager state with odds

// Player management system
const playerRegistry = new Map(); // playerID -> { socketID, playerName, gameId, lastSeen }
let nextPlayerID = 1;

// Challenge data caching system
const challengeCache = {
  data: null,
  lastFetch: null,
  ttl: 10 * 60 * 1000, // 10 minutes cache TTL
  googleAppsScriptUrl: process.env.GOOGLE_APPS_SCRIPT_URL || null
};

// Fetch challenges from Google Apps Script
async function fetchChallengesFromGoogleAppsScript() {
  if (!challengeCache.googleAppsScriptUrl) {
    console.log('No GOOGLE_APPS_SCRIPT_URL configured, using demo challenge data');
    return getDemoChallenges();
  }

  try {
    const response = await fetch(challengeCache.googleAppsScriptUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching challenges from Google Apps Script, falling back to demo data:', error);
    return getDemoChallenges();
  }
}

// Get challenges (from cache or fetch fresh)
async function getChallenges() {
  const now = Date.now();

  if (challengeCache.data && challengeCache.lastFetch &&
      (now - challengeCache.lastFetch) < challengeCache.ttl) {
    return challengeCache.data;
  }

  const freshData = await fetchChallengesFromGoogleAppsScript();
  challengeCache.data = freshData;
  challengeCache.lastFetch = now;

  return freshData;
}

// Demo challenges data (fallback)
function getDemoChallenges() {
  return [
    {
      id: 1,
      category: "Trivia (USA)",
      challengeName: "Name State Capitals",
      requirements: "Timer",
      rules: "Each player takes it in turns to name a US state capital. Whichever players' turn it is when 60 seconds is reached loses."
    },
    {
      id: 2,
      category: "Hand Eye Coordination",
      challengeName: "Tallest solo-cup stack",
      requirements: "Solo cups",
      rules: "Both players attempt to build the tallest tower using cups. Tallest stack after 60 seconds wins"
    },
    {
      id: 3,
      category: "Hand Eye Coordination",
      challengeName: "Flip cup race",
      requirements: "Solo cups, Timer",
      rules: "Both players attempt to flip cups at the same time. First to flip 10 cups wins."
    },
    {
      id: 4,
      category: "Cardio",
      challengeName: "Balloon burst race",
      requirements: "Balloons, Timer",
      rules: "Both players inflate a balloon at the same time. First balloon to burst wins"
    },
    {
      id: 5,
      category: "Brain Games",
      challengeName: "Spot It drag race",
      requirements: "Spot It cards, Timer",
      rules: "The Underdog has 45 seconds to match as many Spot It cards as possible. The Favorite then has 45 seconds to beat that number"
    },
    {
      id: 6,
      category: "Trivia (USA)",
      challengeName: "Presidential Facts",
      requirements: "Timer",
      rules: "Players take turns answering questions about US presidents. First to get 3 wrong loses."
    },
    {
      id: 7,
      category: "Hand Eye Coordination",
      challengeName: "Cup stacking speed",
      requirements: "Solo cups, Timer",
      rules: "Both players stack cups in a pyramid formation. Fastest time wins."
    },
    {
      id: 8,
      category: "Brain Games",
      challengeName: "Memory sequence",
      requirements: "Timer",
      rules: "Players must remember and repeat increasingly long sequences of numbers. First to make a mistake loses."
    }
  ];
}

// Generate unique player ID
function generatePlayerID() {
  return `p${nextPlayerID++}`;
}

// Get or create player ID for a socket
function getOrCreatePlayerID(socket, playerName) {
  // Check if this socket already has a player ID
  for (const [playerID, playerData] of playerRegistry.entries()) {
    if (playerData.socketID === socket.id) {
      playerData.lastSeen = Date.now();
      return playerID;
    }
  }

  // Check if this player name already exists in any game
  for (const [playerID, playerData] of playerRegistry.entries()) {
    if (playerData.playerName === playerName && playerData.gameId) {
      // Found existing player with same name, update socket ID
      playerData.socketID = socket.id;
      playerData.lastSeen = Date.now();
      return playerID;
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

// Send the active wager state (if any) to a player who just (re)joined a game
function sendActiveWagerTo(socket, game) {
  const wagerState = wagerStates.get(game.id);
  if (!wagerState || !wagerState.isActive || wagerState.resolved) return;

  // Send wager options
  socket.emit('wagerProposed', {
    options: wagerState.options,
    odds: wagerState.odds
  });

  // Send current player choices (reveal points but keep choice secret)
  for (const [choicePlayerId, choiceData] of Object.entries(wagerState.playerChoices)) {
    const choicePlayerName = game.playerNames[choicePlayerId] || 'Unknown Player';
    socket.emit('choiceMade', {
      playerId: choicePlayerId,
      playerName: choicePlayerName,
      hasChosen: true,
      choice: null, // Don't reveal the choice until resolution
      points: choiceData.points // Show the wager amount for tension
    });
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  // Join a game session
  socket.on('joinGame', (data) => {
    const { gameId, playerName } = data;

    if (gameSessions.has(gameId)) {
      const game = gameSessions.get(gameId);
      const playerID = getOrCreatePlayerID(socket, playerName);

      // Update player registry with game ID
      const playerData = playerRegistry.get(playerID);
      playerData.gameId = gameId;

      // Check if this player is already in the game
      if (game.players.includes(playerID)) {
        // Player is rejoining - just update their socket ID
        socket.join(gameId);
        socket.emit('gameJoined', { gameId, gameState: game, wasReconnection: true, playerID, isHost: game.host === playerID });
        sendActiveWagerTo(socket, game);

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
        game.playerNames[playerID] = playerName || `Player${game.players.length}`;

        socket.join(gameId);
        socket.emit('gameJoined', { gameId, gameState: game, wasReconnection: false, playerID, isHost: game.host === playerID });

        // Send gameStateUpdate to OTHER players (not the new player) to ensure state consistency
        socket.to(gameId).emit('gameStateUpdate', game);
        console.log(`Player ${playerName || 'Unknown'} (${playerID}) joined game ${gameId}`);
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

    const startingPoints = gameConfig.startingPoints || 100;
    const maxBetSize = gameConfig.maxBetSize || null;
    const bounty = gameConfig.bounty || 'None';
    const bountyAmount = gameConfig.bountyAmount || null;

    const gameState = {
      id: gameId,
      host: playerID,
      players: [playerID],
      status: 'waiting',
      createdAt: new Date().toISOString(),
      startingPoints: startingPoints,
      maxBetSize: maxBetSize,
      bounty: bounty,
      bountyAmount: bountyAmount,
      playerPoints: {
        [playerID]: startingPoints
      },
      playerNames: {
        [playerID]: gameConfig.playerName || `Player${nextPlayerID - 1}`
      },
      categories: gameConfig.categories || [],
      challengesPerCategory: gameConfig.challengesPerCategory || [],
      playerRankings: {},
      rankingsComplete: false
    };

    // Initialize wager state
    wagerStates.set(gameId, {
      isActive: false,
      options: [],
      odds: [1, 1], // Default odds of 1 for each option
      playerChoices: {},
      resolved: false,
      correctOption: null
    });

    gameSessions.set(gameId, gameState);
    socket.join(gameId);
    socket.emit('gameCreated', { ...gameState, playerID });
    console.log(`Game ${gameId} created by ${gameConfig.playerName || 'Unknown'} (${playerID})`);
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

    if (game && game.players.includes(playerID)) {
      // Process the action and update game state
      const updatedState = processGameAction(game, action, payload, playerID);
      gameSessions.set(gameId, updatedState);

      // Broadcast updated state to all players in the game
      io.to(gameId).emit('gameStateUpdate', updatedState);
    }
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

    // Check if this playerID exists in the game
    if (!game.players.includes(playerID)) {
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
      isHost: game.host === playerID
    });

    sendActiveWagerTo(socket, game);

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

// Game action processing
function processGameAction(game, action, payload, playerID) {
  switch (action) {
    case 'startGame':
      if (game.players.length >= 2) {
        return {
          ...game,
          status: 'playing',
          gameStartedAt: new Date().toISOString()
        };
      }
      return game;

    case 'proposeWager':
      // Host proposes a wager with two options and odds
      if (game.host === playerID && payload.option1 && payload.option2) {
        // Extract odds from payload, defaulting to 1 if not provided
        const odds1 = payload.odds1 || 1;
        const odds2 = payload.odds2 || 1;
        const category = payload.category || '';

        wagerStates.set(game.id, {
          isActive: true,
          options: [payload.option1, payload.option2],
          odds: [odds1, odds2],
          category: category,
          playerChoices: {},
          resolved: false,
          correctOption: null
        });

        console.log(`Game ${game.id}: wager proposed "${payload.option1}" (${odds1}x) vs "${payload.option2}" (${odds2}x)${category ? ` in ${category}` : ''}`);

        // Emit wager proposed event to all players
        io.to(game.id).emit('wagerProposed', {
          options: [payload.option1, payload.option2],
          odds: [odds1, odds2],
          category: category
        });
      } else {
        console.error(`Invalid wager proposal in game ${game.id}:`, {
          isHost: game.host === playerID,
          hasOption1: !!payload.option1,
          hasOption2: !!payload.option2
        });
      }
      return game;

    case 'makeChoice':
      // Player makes a choice on the current wager with points
      if (payload.choice !== undefined && payload.choice >= 0 && payload.choice <= 1 && payload.points !== undefined) {
        const wagerState = wagerStates.get(game.id);
        if (wagerState && wagerState.isActive && !wagerState.resolved) {
          const currentPoints = game.playerPoints[playerID] || 0;

          // Validate the wager amount
          if (payload.points <= 0) {
            return game;
          }

          // Calculate maximum allowed wager: 50 points OR current points, whichever is larger
          let maxWager = Math.max(50, currentPoints);

          // Apply game-level maximum bet size limit if configured
          if (game.maxBetSize !== null && game.maxBetSize !== undefined) {
            maxWager = Math.min(maxWager, game.maxBetSize);
          }

          if (payload.points > maxWager) {
            return game;
          }

          // Prevent players from betting against themselves
          const currentPlayerName = game.playerNames[playerID];
          const isPlayerInContest = currentPlayerName === wagerState.options[0] || currentPlayerName === wagerState.options[1];

          if (isPlayerInContest) {
            // Player is in the contest - they can only bet on themselves
            const chosenOptionName = wagerState.options[payload.choice];
            if (chosenOptionName !== currentPlayerName) {
              return game;
            }
          }

          // Store the choice and wager amount
          wagerState.playerChoices[playerID] = {
            choice: payload.choice,
            points: payload.points
          };

          // Emit choice made event to all players (reveal points but keep choice secret)
          io.to(game.id).emit('choiceMade', {
            playerId: playerID,
            playerName: game.playerNames[playerID] || 'Unknown Player',
            hasChosen: true,
            choice: null, // Don't reveal the choice until resolution
            points: payload.points // Show the wager amount for tension
          });
        }
      }
      return game;

    case 'cancelWager':
      // Host cancels the wager - no points awarded or lost
      if (game.host === playerID) {
        const wagerState = wagerStates.get(game.id);

        if (wagerState && wagerState.isActive && !wagerState.resolved) {
          // Clear the wager state completely
          wagerStates.delete(game.id);
          console.log(`Game ${game.id}: wager cancelled - all bets nullified`);

          // Emit cancellation event to all players
          io.to(game.id).emit('wagerCancelled');
        }
      }
      return game;

    case 'resolveWager':
      // Host resolves the wager and awards points
      if (game.host === playerID && payload.correctChoice !== undefined) {
        const wagerState = wagerStates.get(game.id);

        if (wagerState && wagerState.isActive && !wagerState.resolved) {
          wagerState.resolved = true;
          wagerState.correctOption = payload.correctChoice;

          // Calculate bounty amount
          const bountyAmount = calculateBountyAmount(game, wagerState);

          // Initialize playerWagerCount if it doesn't exist
          if (!game.playerWagerCount) {
            game.playerWagerCount = {};
          }

          let results = [];
          let winnerPlayerId = null;

          // First, identify the contest winner based on the correct choice
          const winningOption = wagerState.options[payload.correctChoice];

          // Find the player ID for the winning option
          for (const [playerId, playerName] of Object.entries(game.playerNames)) {
            if (playerName === winningOption) {
              winnerPlayerId = playerId;
              break;
            }
          }

          for (const [playerId, choiceData] of Object.entries(wagerState.playerChoices)) {
            const { choice, points } = choiceData;

            // Check if this player is one of the two being compared in the contest
            const playerName = game.playerNames[playerId];
            const isPlayerInContest = playerName === wagerState.options[0] || playerName === wagerState.options[1];

            // Only increment wager count for players who are actually in the contest
            if (isPlayerInContest) {
              game.playerWagerCount[playerId] = (game.playerWagerCount[playerId] || 0) + 1;
            }

            if (choice === payload.correctChoice) {
              // Player was correct - they gain the points they wagered MULTIPLIED BY the odds
              const odds = wagerState.odds[choice];
              const pointsAwarded = Math.floor(points * odds);
              addPoints(game, playerId, pointsAwarded);

              results.push({
                playerId,
                playerName: game.playerNames[playerId] || 'Unknown Player',
                choice,
                points,
                odds: odds,
                correct: true,
                pointsAwarded: pointsAwarded,
                pointsChange: `+${pointsAwarded}`,
                isWinner: isPlayerInContest
              });
            } else {
              // Player was incorrect - they lose the points they wagered (unaffected by odds)
              addPoints(game, playerId, -points);
              results.push({
                playerId,
                playerName: game.playerNames[playerId] || 'Unknown Player',
                choice,
                points,
                odds: wagerState.odds[choice],
                correct: false,
                pointsAwarded: 0,
                pointsChange: `-${points}`,
                isWinner: false
              });
            }
          }

          // Award bounty to the winner if applicable
          if (bountyAmount && bountyAmount > 0 && winnerPlayerId) {
            addPoints(game, winnerPlayerId, bountyAmount);
          }

          console.log(`Game ${game.id}: wager resolved, winner "${winningOption}"${bountyAmount ? ` (bounty ${bountyAmount})` : ''}`);

          // Emit wager resolved event to all players
          io.to(game.id).emit('wagerResolved', {
            correctChoice: payload.correctChoice,
            results,
            wagerState: wagerState,
            bountyAmount: bountyAmount,
            winnerPlayerId: winnerPlayerId
          });

          // Reset wager state for next round
          wagerState.isActive = false;
          wagerState.options = [];
          wagerState.odds = [1, 1]; // Reset to default odds
          wagerState.playerChoices = {};
          wagerState.correctOption = null;
          wagerState.resolved = false;
        } else {
          console.error(`Cannot resolve wager for game ${game.id}:`, {
            hasWagerState: !!wagerState,
            isActive: wagerState?.isActive,
            isResolved: wagerState?.resolved
          });
        }
      } else {
        console.error(`Invalid wager resolution in game ${game.id}:`, {
          isHost: game.host === playerID,
          hasCorrectChoice: payload.correctChoice !== undefined
        });
      }
      return game;

    case 'submitRankings':
      // Player submits their category rankings
      if (payload.rankings && game.categories && game.categories.length > 0) {
        // Validate rankings
        const expectedRanks = game.categories.length;
        const submittedRanks = Object.values(payload.rankings);

        // Check if all categories are ranked
        if (submittedRanks.length !== expectedRanks) {
          return game;
        }

        // Check if ranks are unique and valid (1 to expectedRanks)
        const validRanks = new Set(Array.from({length: expectedRanks}, (_, i) => i + 1));
        const submittedRanksSet = new Set(submittedRanks);

        if (submittedRanksSet.size !== expectedRanks ||
            !submittedRanks.every(rank => validRanks.has(rank))) {
          return game;
        }

        // Store the rankings
        game.playerRankings[playerID] = payload.rankings;

        // Check if all players have submitted rankings
        const allPlayersRanked = game.players.every(pid => game.playerRankings[pid]);
        if (allPlayersRanked) {
          game.rankingsComplete = true;
          console.log(`Game ${game.id}: all players have submitted rankings`);

          // Emit rankings complete event
          io.to(game.id).emit('rankingsComplete', {
            playerRankings: game.playerRankings,
            categories: game.categories
          });
        } else {
          // Emit ranking submitted event
          io.to(game.id).emit('rankingSubmitted', {
            playerId: playerID,
            playerName: game.playerNames[playerID],
            totalPlayers: game.players.length,
            rankedPlayers: Object.keys(game.playerRankings).length
          });
        }
      }
      return game;

    default:
      return game;
  }
}

// Generate unique game ID
function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Point management functions
function addPoints(game, playerId, points) {
  if (game.playerPoints[playerId] !== undefined) {
    game.playerPoints[playerId] += points; // Allow negative points
    return true;
  }
  return false;
}

// Bounty calculation functions
function calculateBountyAmount(game, wagerState) {
  const bountyConfig = game.bounty || 'None';

  if (bountyConfig === 'None') {
    return null;
  }

  if (bountyConfig === 'Fixed') {
    return game.bountyAmount || 0;
  }

  // For Min/Max/Average, we need to look at all bets placed on the wager
  const allBets = Object.values(wagerState.playerChoices).map(choice => choice.points);

  if (allBets.length === 0) {
    return 0;
  }

  switch (bountyConfig) {
    case 'Min':
      return Math.min(...allBets);
    case 'Max':
      return Math.max(...allBets);
    case 'Average':
      return Math.floor(allBets.reduce((sum, bet) => sum + bet, 0) / allBets.length);
    default:
      return null;
  }
}

function getPlayerPoints(game, playerId) {
  return game.playerPoints[playerId] || 0
}

function getWagerState(gameId) {
  return wagerStates.get(gameId) || null;
}

// API endpoints
app.get('/api/games', (req, res) => {
  const games = Array.from(gameSessions.values()).map(game => ({
    id: game.id,
    status: game.status,
    playerCount: game.players.length,
    createdAt: game.createdAt,
    playerPoints: game.playerPoints
  }));
  res.json(games);
});

app.get('/api/games/:id', (req, res) => {
  const game = gameSessions.get(req.params.id);
  if (game) {
    res.json(game);
  } else {
    res.status(404).json({ error: 'Game not found' });
  }
});

// Get points for a specific player in a game
app.get('/api/games/:id/players/:playerId/points', (req, res) => {
  const game = gameSessions.get(req.params.id);
  if (game) {
    const playerId = req.params.playerId;
    const points = getPlayerPoints(game, playerId);
    res.json({ playerId, points, gameId: req.params.id });
  } else {
    res.status(404).json({ error: 'Game not found' });
  }
});

// Get all player points for a game
app.get('/api/games/:id/points', (req, res) => {
  const game = gameSessions.get(req.params.id);
  if (game) {
    res.json({ gameId: req.params.id, playerPoints: game.playerPoints });
  } else {
    res.status(404).json({ error: 'Game not found' });
  }
});

// Get wager state for a game
app.get('/api/games/:id/wager', (req, res) => {
  const game = gameSessions.get(req.params.id);
  if (game) {
    const wagerState = getWagerState(req.params.id);
    res.json({ gameId: req.params.id, wagerState });
  } else {
    res.status(404).json({ error: 'Game not found' });
  }
});

// Get challenges (with caching)
app.get('/api/challenges', async (req, res) => {
  try {
    const challenges = await getChallenges();
    res.json(challenges);
  } catch (error) {
    console.error('Error fetching challenges:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// Debug endpoint to check game state
app.get('/api/debug/games/:id', (req, res) => {
  const game = gameSessions.get(req.params.id);
  if (game) {
    const wagerState = getWagerState(req.params.id);
    res.json({
      gameId: req.params.id,
      players: game.players,
      playerNames: game.playerNames,
      playerPoints: game.playerPoints,
      status: game.status,
      wagerState: wagerState
    });
  } else {
    res.status(404).json({ error: 'Game not found' });
  }
});

// Debug endpoint specifically for wager state
app.get('/api/debug/games/:id/wager', (req, res) => {
  const game = gameSessions.get(req.params.id);
  if (game) {
    const wagerState = getWagerState(req.params.id);
    res.json({
      gameId: req.params.id,
      gameStatus: game.status,
      hostId: game.host,
      wagerState: wagerState,
      wagerStatesMap: Array.from(wagerStates.entries()).map(([id, state]) => ({ id, state }))
    });
  } else {
    res.status(404).json({ error: 'Game not found' });
  }
});

// Serve React app for any non-API routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

const PORT = process.env.PORT || 3001;

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

// Run cleanup every 10 minutes
setInterval(cleanupAbandonedGames, 10 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
