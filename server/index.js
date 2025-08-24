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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join a game session
  socket.on('joinGame', (data) => {
    const { gameId, playerName } = data;
    
    if (gameSessions.has(gameId)) {
      const game = gameSessions.get(gameId);
      
      // Add player to the game and initialize their points and name
      if (!game.players.includes(socket.id)) {
        game.players.push(socket.id);
        game.playerPoints[socket.id] = 100;
        game.playerNames[socket.id] = playerName || `Player${game.players.length}`;
      }
      
      socket.join(gameId);
      socket.emit('gameJoined', { gameId, gameState: game });
      socket.to(gameId).emit('playerJoined', { playerId: socket.id, playerName: game.playerNames[socket.id] });
      console.log(`Player ${playerName || 'Unknown'} joined game ${gameId}`);
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
      playerPoints: {
        [socket.id]: 100
      },
      playerNames: {
        [socket.id]: gameConfig.playerName || `Player${Math.floor(Math.random() * 1000)}`
      }
    };
    
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
      const updatedState = processGameAction(game, action, payload);
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
        game.players = game.players.filter(id => id !== socket.id);
        // Remove player's points and name when they leave
        delete game.playerPoints[socket.id];
        delete game.playerNames[socket.id];
        io.to(gameId).emit('playerLeft', { playerId: socket.id });
      }
    }
  });
});

// Game action processing
function processGameAction(game, action, payload) {
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

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io server ready for connections`);
});
