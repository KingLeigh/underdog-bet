const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Game state storage (in-memory for now)
const gameSessions = new Map();

// Wager system data structure
const wagerStates = new Map(); // gameId -> wager state

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join a game session
  socket.on('joinGame', (data) => {
    const { gameId, playerName } = data;
    
    if (gameSessions.has(gameId)) {
      const game = gameSessions.get(gameId);
      
      // Check if this is a reconnection (same name, different socket)
      let isReconnection = false;
      let existingPlayerId = null;
      
      console.log(`Checking for reconnection: ${playerName}`);
      console.log(`Current players:`, game.players);
      console.log(`All player names:`, game.playerNames);
      
      // Look for existing player with same name who is not currently connected
      for (const [pid, pname] of Object.entries(game.playerNames)) {
        console.log(`Checking player ${pid}: name="${pname}", connected=${game.players.includes(pid)}`);
        if (pname === playerName && !game.players.includes(pid)) {
          // Found disconnected player with same name
          existingPlayerId = pid;
          isReconnection = true;
          console.log(`Found disconnected player ${pid} with name ${playerName}`);
          break;
        }
      }
      
      if (isReconnection && existingPlayerId) {
        // Reconnect existing player
        console.log(`Player ${playerName} reconnecting to game ${gameId}`);
        
        // Transfer player data to new socket ID
        game.playerNames[socket.id] = playerName;
        game.playerPoints[socket.id] = game.playerPoints[existingPlayerId] || 100;
        
        // Remove old disconnected player data
        delete game.playerNames[existingPlayerId];
        delete game.playerPoints[existingPlayerId];
        
        // Add new socket to players list
        if (!game.players.includes(socket.id)) {
          game.players.push(socket.id);
        }
        
        console.log(`Game state after reconnection:`, {
          players: game.players,
          playerNames: game.playerNames,
          playerPoints: game.playerPoints
        });
        
        // Emit reconnection event
        socket.join(gameId);
        
        console.log(`Sending gameJoined to reconnecting player ${playerName} with game state:`, {
          gameId,
          players: game.players,
          status: game.status,
          playerCount: game.players.length
        });
        
        // Send full game state to reconnecting player (like gameJoined)
        socket.emit('gameJoined', { gameId, gameState: game, wasReconnection: true });
        
        // Notify other players about the reconnection with updated game state
        // This ensures they have the correct player names and don't see "Unknown Player"
        socket.to(gameId).emit('gameStateUpdate', game);
        
        console.log(`Player ${playerName} reconnected successfully`);
      } else {
        // New player joining
        if (!game.players.includes(socket.id)) {
          game.players.push(socket.id);
          game.playerPoints[socket.id] = 100;
          game.playerNames[socket.id] = playerName || `Player${game.players.length}`;
        }
        
        socket.join(gameId);
        socket.emit('gameJoined', { gameId, gameState: game, wasReconnection: false });
        socket.to(gameId).emit('playerJoined', { playerId: socket.id, playerName: game.playerNames[socket.id] });
        console.log(`Player ${playerName || 'Unknown'} joined game ${gameId}`);
      }
    } else {
      socket.emit('error', { message: 'Game not found' });
    }
  });

  // Create a new game session
  socket.on('createGame', (gameConfig) => {
    const gameId = generateGameId();
    const gameState = {
      id: gameId,
      host: socket.id,
      players: [socket.id],
      status: 'waiting',
      config: gameConfig,
      createdAt: new Date().toISOString(),
      lastCleanup: Date.now(),
      playerPoints: {
        [socket.id]: 100
      },
      playerNames: {
        [socket.id]: gameConfig.playerName || `Player${Math.floor(Math.random() * 1000)}`
      }
    };
    
    // Initialize wager state
    wagerStates.set(gameId, {
      isActive: false,
      options: [],
      playerChoices: {},
      resolved: false,
      correctOption: null
    });
    
    gameSessions.set(gameId, gameState);
    socket.join(gameId);
    socket.emit('gameCreated', gameState);
    console.log(`Game ${gameId} created by ${gameConfig.playerName || 'Unknown'}`);
  });

  // Handle game actions
  socket.on('gameAction', (data) => {
    const { gameId, action, payload } = data;
    const game = gameSessions.get(gameId);
    
    if (game && game.players.includes(socket.id)) {
      // Process the action and update game state
      const updatedState = processGameAction(game, action, payload, socket);
      gameSessions.set(gameId, updatedState);
      
      // Broadcast updated state to all players in the game
      io.to(gameId).emit('gameStateUpdate', updatedState);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Clean up game sessions if host disconnects
    for (const [gameId, game] of gameSessions.entries()) {
      if (game.host === socket.id) {
        io.to(gameId).emit('gameEnded', { reason: 'Host disconnected' });
        gameSessions.delete(gameId);
        console.log(`Game ${gameId} ended due to host disconnect`);
      } else if (game.players.includes(socket.id)) {
        // Mark player as disconnected but keep their data for potential reconnection
        const playerName = game.playerNames[socket.id] || 'Unknown';
        
        console.log(`Player ${playerName} (${socket.id}) disconnecting from game ${gameId}`);
        console.log(`Before disconnect - Players:`, game.players);
        console.log(`Before disconnect - PlayerNames:`, game.playerNames);
        
        // Remove from active players list but keep their data
        game.players = game.players.filter(id => id !== socket.id);
        
        // Keep player data in playerNames and playerPoints for reconnection
        // The data will be cleaned up when they reconnect or after a timeout
        
        console.log(`After disconnect - Players:`, game.players);
        console.log(`After disconnect - PlayerNames:`, game.playerNames);
        
        io.to(gameId).emit('playerDisconnected', { 
          playerId: socket.id, 
          playerName: playerName,
          canReconnect: true 
        });
        
        console.log(`Player ${playerName} disconnected from game ${gameId} (can reconnect)`);
      }
    }
  });
});

// Game action processing
function processGameAction(game, action, payload, socket) {
  console.log(`Processing action: ${action}`, payload);
  
  switch (action) {
    case 'startGame':
      if (game.players.length >= 2) {
        return { 
          ...game, 
          status: 'playing',
          lastAction: { action, payload, timestamp: Date.now() },
          gameStartedAt: new Date().toISOString()
        };
      }
      return game;
      
    case 'endTurn':
      // Placeholder for turn management
      return { 
        ...game, 
        lastAction: { action, payload, timestamp: Date.now() }
      };
      
    case 'addPoints':
      // Add or subtract points for a player
      if (payload.playerId && payload.points !== undefined) {
        addPoints(game, payload.playerId, payload.points);
      }
      return { 
        ...game, 
        lastAction: { action, payload, timestamp: Date.now() }
      };
      
    case 'setPoints':
      // Set points for a player to a specific value
      if (payload.playerId && payload.points !== undefined) {
        setPoints(game, payload.playerId, payload.points);
      }
      return { 
        ...game, 
        lastAction: { action, payload, timestamp: Date.now() }
      };
      
    case 'proposeWager':
      // Host proposes a wager with two options
      if (game.host === socket.id && payload.option1 && payload.option2) {
        const wagerState = wagerStates.get(game.id);
        if (wagerState) {
          // Clear any previous wager state completely
          wagerState.isActive = true;
          wagerState.options = [payload.option1, payload.option2];
          wagerState.playerChoices = {};
          wagerState.resolved = false;
          wagerState.correctOption = null;
          
          console.log(`Host ${game.playerNames[socket.id]} proposed wager: "${payload.option1}" vs "${payload.option2}"`);
          
          // Emit wager proposed event to all players
          io.to(game.id).emit('wagerProposed', {
            options: [payload.option1, payload.option2],
            wagerId: Date.now().toString()
          });
        }
      }
      return { 
        ...game, 
        lastAction: { action, payload, timestamp: Date.now() }
      };
      
    case 'makeChoice':
      // Player makes a choice on the current wager
      if (payload.choice !== undefined && payload.choice >= 0 && payload.choice <= 1) {
        const wagerState = wagerStates.get(game.id);
        if (wagerState && wagerState.isActive && !wagerState.resolved) {
          wagerState.playerChoices[socket.id] = payload.choice;
          
          console.log(`Player ${game.playerNames[socket.id]} chose option ${payload.choice} (${wagerState.options[payload.choice]})`);
          
          // Emit choice made event to all players
          io.to(game.id).emit('choiceMade', {
            playerId: socket.id,
            playerName: game.playerNames[socket.id] || 'Unknown Player',
            choice: payload.choice
          });
        }
      }
      return { 
        ...game, 
        lastAction: { action, payload, timestamp: Date.now() }
      };
      
    case 'resolveWager':
      // Host resolves the wager and awards points
      if (game.host === socket.id && payload.correctChoice !== undefined) {
        const wagerState = wagerStates.get(game.id);
        if (wagerState && wagerState.isActive && !wagerState.resolved) {
          wagerState.resolved = true;
          wagerState.correctOption = payload.correctChoice;
          
          // Award 100 points to players who chose correctly
          let results = [];
          for (const [playerId, choice] of Object.entries(wagerState.playerChoices)) {
            if (choice === payload.correctChoice) {
              addPoints(game, playerId, 100);
              results.push({
                playerId,
                playerName: game.playerNames[playerId] || 'Unknown Player',
                choice,
                correct: true,
                pointsAwarded: 100
              });
            } else {
              results.push({
                playerId,
                playerName: game.playerNames[playerId] || 'Unknown Player',
                choice,
                correct: false,
                pointsAwarded: 0
              });
            }
          }
          
          console.log(`Wager resolved by host ${game.playerNames[socket.id]}. Correct answer: Option ${payload.correctChoice}. Results:`, results);
          
          // Emit wager resolved event to all players
          io.to(game.id).emit('wagerResolved', {
            correctChoice: payload.correctChoice,
            results,
            wagerState: wagerState
          });
          
          // Reset wager state for next round
          wagerState.isActive = false;
          wagerState.options = [];
          wagerState.playerChoices = {};
          wagerState.correctOption = null;
          wagerState.resolved = false;
        }
      }
      return { 
        ...game, 
        lastAction: { action, payload, timestamp: Date.now() }
      };
      
    case 'testAction':
      // Placeholder for testing
      return { 
        ...game, 
        lastAction: { action, payload, timestamp: Date.now() }
      };
      
    default:
      return { 
        ...game, 
        lastAction: { action, payload, timestamp: Date.now() }
      };
  }
}

// Generate unique game ID
function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Point management functions
function addPoints(game, playerId, points) {
  if (game.playerPoints[playerId] !== undefined) {
    game.playerPoints[playerId] = Math.max(0, game.playerPoints[playerId] + points);
    return true;
  }
  return false;
}

// Cleanup disconnected players after timeout
function cleanupDisconnectedPlayers() {
  const now = Date.now();
  const RECONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  for (const [gameId, game] of gameSessions.entries()) {
    // Clean up any disconnected player data that's older than timeout
    // This prevents memory leaks from abandoned games
    if (game.lastCleanup && (now - game.lastCleanup) > RECONNECTION_TIMEOUT) {
      // Remove any player data for players not currently in the game
      for (const [pid, points] of Object.entries(game.playerPoints)) {
        if (!game.players.includes(pid)) {
          delete game.playerPoints[pid];
          delete game.playerNames[pid];
        }
      }
      game.lastCleanup = now;
    }
  }
}

function setPoints(game, playerId, points) {
  if (game.playerPoints[playerId] !== undefined) {
    game.playerPoints[playerId] = Math.max(0, points);
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

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io server ready for connections`);
  
  // Set up periodic cleanup of disconnected players
  setInterval(cleanupDisconnectedPlayers, 60000); // Run every minute
  console.log('Player reconnection system enabled (5 minute timeout)');
});
