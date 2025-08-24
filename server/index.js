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

// Player management system
const playerRegistry = new Map(); // playerID -> { socketID, playerName, gameId, lastSeen }
let nextPlayerID = 1;

// Generate unique player ID
function generatePlayerID() {
  return `player_${nextPlayerID++}_${Date.now()}`;
}

// Get or create player ID for a socket
function getOrCreatePlayerID(socket, playerName) {
  // Check if this socket already has a player ID
  for (const [playerID, playerData] of playerRegistry.entries()) {
    if (playerData.socketID === socket.id) {
      // Update last seen time
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
      console.log(`Player ${playerName} reconnected with new socket, updated mapping: ${playerID} -> ${socket.id}`);
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
  console.log(`Created new player: ${playerID} -> ${socket.id} (${playerName})`);
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

// Get socket for a player ID
function getSocketForPlayer(playerID) {
  const playerData = playerRegistry.get(playerID);
  return playerData ? playerData.socketID : null;
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

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
        console.log(`Player ${playerName} rejoining game ${gameId} (PlayerID: ${playerID})`);
        
        socket.join(gameId);
        socket.emit('gameJoined', { gameId, gameState: game, wasReconnection: true, playerID });
        
        // Notify other players about the reconnection
        socket.to(gameId).emit('gameStateUpdate', game);
        
        console.log(`Player ${playerName} rejoined successfully`);
      } else {
        // New player joining - add them to the game
        game.players.push(playerID);
        game.playerPoints[playerID] = 100;
        game.playerNames[playerID] = playerName || `Player${game.players.length}`;
        
        console.log(`New player ${playerName} joined game ${gameId}. Initial points: ${game.playerPoints[playerID]} (PlayerID: ${playerID})`);
        console.log(`Current game state after join:`, {
          players: game.players,
          playerPoints: game.playerPoints,
          playerNames: game.playerNames
        });
        
        socket.join(gameId);
        socket.emit('gameJoined', { gameId, gameState: game, wasReconnection: false, playerID });
        
        // Send gameStateUpdate to OTHER players (not the new player) to ensure state consistency
        socket.to(gameId).emit('gameStateUpdate', game);
        
        console.log(`Sent gameStateUpdate to other players. Current game state:`, {
          players: game.players,
          playerNames: game.playerNames,
          playerCount: game.players.length
        });
        console.log(`Full gameStateUpdate payload:`, {
          playerPoints: game.playerPoints,
          playerNames: game.playerNames
        });
        
        console.log(`Player ${playerName || 'Unknown'} joined game ${gameId}`);
        console.log(`Sent gameStateUpdate to other players. Current game state:`, {
          players: game.players,
          playerNames: game.playerNames,
          playerCount: game.players.length
        });
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
    
    const gameState = {
      id: gameId,
      host: playerID,
      players: [playerID],
      status: 'waiting',
      createdAt: new Date().toISOString(),
      playerPoints: {
        [playerID]: 100
      },
      playerNames: {
        [playerID]: gameConfig.playerName || `Player${Math.floor(Math.random() * 1000)}`
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
    socket.emit('gameCreated', { ...gameState, playerID });
    console.log(`Game ${gameId} created by ${gameConfig.playerName || 'Unknown'} (PlayerID: ${playerID})`);
    console.log(`Initial game state:`, {
      players: gameState.players,
      playerPoints: gameState.playerPoints,
      playerNames: gameState.playerNames
    });
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

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find the player ID for this socket
    let disconnectedPlayerID = null;
    for (const [playerID, playerData] of playerRegistry.entries()) {
      if (playerData.socketID === socket.id) {
        disconnectedPlayerID = playerID;
        break;
      }
    }
    
    if (!disconnectedPlayerID) {
      console.log(`No player found for disconnected socket: ${socket.id}`);
      return;
    }
    
    // Clean up game sessions if host disconnects
    for (const [gameId, game] of gameSessions.entries()) {
      if (game.host === disconnectedPlayerID) {
        io.to(gameId).emit('gameEnded', { reason: 'Host disconnected' });
        gameSessions.delete(gameId);
        console.log(`Game ${gameId} ended due to host disconnect`);
      }
      // Note: We no longer remove players from the game when they disconnect
      // They remain in the score tracker and can reconnect later
    }
    
    // Update player registry - mark as disconnected but keep player data
    const playerData = playerRegistry.get(disconnectedPlayerID);
    if (playerData) {
      playerData.socketID = null; // Mark as disconnected but keep player data
      console.log(`Marked player ${disconnectedPlayerID} as disconnected in registry`);
    }
  });
});

// Game action processing
function processGameAction(game, action, payload, playerID) {
  console.log(`Processing action: ${action}`, payload);
  
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
      // Host proposes a wager with two options
      if (game.host === playerID && payload.option1 && payload.option2) {
        const wagerState = wagerStates.get(game.id);
        console.log(`Proposing wager for game ${game.id}. Current wager state:`, wagerState);
        
        if (wagerState) {
          // Clear any previous wager state completely
          wagerState.isActive = true;
          wagerState.options = [payload.option1, payload.option2];
          wagerState.playerChoices = {};
          wagerState.resolved = false;
          wagerState.correctOption = null;
          
          console.log(`Host ${game.playerNames[playerID]} proposed wager: "${payload.option1}" vs "${payload.option2}"`);
          console.log(`Updated wager state:`, wagerState);
          
          // Emit wager proposed event to all players
          io.to(game.id).emit('wagerProposed', {
            options: [payload.option1, payload.option2],
            wagerId: Date.now().toString()
          });
        } else {
          console.error(`No wager state found for game ${game.id}. Creating new one.`);
          // Create a new wager state if it doesn't exist
          const newWagerState = {
            isActive: true,
            options: [payload.option1, payload.option2],
            playerChoices: {},
            resolved: false,
            correctOption: null
          };
          wagerStates.set(game.id, newWagerState);
          
          console.log(`Created new wager state for game ${game.id}:`, newWagerState);
          
          // Emit wager proposed event to all players
          io.to(game.id).emit('wagerProposed', {
            options: [payload.option1, payload.option2],
            wagerId: Date.now().toString()
          });
        }
      } else {
        console.error(`Invalid wager proposal:`, { 
          isHost: game.host === playerID, 
          hasOption1: !!payload.option1, 
          hasOption2: !!payload.option2,
          hostId: game.host,
          socketId: playerID
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
            console.log(`Player ${game.playerNames[playerID]} tried to wager invalid points: ${payload.points}`);
            return game;
          }
          
          // Calculate maximum allowed wager: 50 points OR current points, whichever is larger
          const maxWager = Math.max(50, currentPoints);
          
          if (payload.points > maxWager) {
            console.log(`Player ${game.playerNames[playerID]} tried to wager ${payload.points} points, but max allowed is ${maxWager} (current: ${currentPoints})`);
            return game;
          }
          
          // Note: Players can always bet up to maxWager points, even if they go negative
          console.log(`Player ${game.playerNames[playerID]} wagering ${payload.points} points (current balance: ${currentPoints}, max allowed: ${maxWager})`);
          
          // Store the choice and wager amount
          wagerState.playerChoices[playerID] = {
            choice: payload.choice,
            points: payload.points
          };
          
          console.log(`Player ${game.playerNames[playerID]} chose option ${payload.choice} (${wagerState.options[payload.choice]}) with ${payload.points} points`);
          
          // Emit choice made event to all players (without revealing the choice or points)
          io.to(game.id).emit('choiceMade', {
            playerId: playerID,
            playerName: game.playerNames[playerID] || 'Unknown Player',
            hasChosen: true,
            choice: null, // Don't reveal the choice until resolution
            points: null  // Don't reveal the points until resolution
          });
        }
      }
      return game;
      
    case 'resolveWager':
      // Host resolves the wager and awards points
      if (game.host === playerID && payload.correctChoice !== undefined) {
        const wagerState = wagerStates.get(game.id);
        console.log(`Resolving wager for game ${game.id}. Current wager state:`, wagerState);
        
        if (wagerState && wagerState.isActive && !wagerState.resolved) {
          wagerState.resolved = true;
          wagerState.correctOption = payload.correctChoice;
          
          // Process wager results with point gains/losses
          console.log(`🎯 Processing wager results. Player points before resolution:`, game.playerPoints);
          
          let results = [];
          for (const [playerId, choiceData] of Object.entries(wagerState.playerChoices)) {
            const { choice, points } = choiceData;
            console.log(`Processing player ${game.playerNames[playerId]}: choice=${choice}, wagered=${points}, correct=${payload.correctChoice}`);
            
            if (choice === payload.correctChoice) {
              // Player was correct - they gain the points they wagered
              console.log(`✅ Player ${game.playerNames[playerId]} was correct, adding ${points} points`);
              addPoints(game, playerId, points);
              results.push({
                playerId,
                playerName: game.playerNames[playerId] || 'Unknown Player',
                choice,
                points,
                correct: true,
                pointsAwarded: points,
                pointsChange: `+${points}`
              });
            } else {
              // Player was incorrect - they lose the points they wagered
              console.log(`❌ Player ${game.playerNames[playerId]} was incorrect, subtracting ${points} points`);
              addPoints(game, playerId, -points);
              results.push({
                playerId,
                playerName: game.playerNames[playerId] || 'Unknown Player',
                choice,
                points,
                correct: false,
                pointsAwarded: 0,
                pointsChange: `-${points}`
              });
            }
          }
          
          console.log(`🎯 Player points after resolution:`, game.playerPoints);
          
          console.log(`Wager resolved by host ${game.playerNames[playerID]}. Correct answer: Option ${payload.correctChoice}. Results:`, results);
          
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
          
          console.log(`Wager state reset for game ${game.id}. New state:`, wagerState);
        } else {
          console.error(`Cannot resolve wager for game ${game.id}:`, {
            hasWagerState: !!wagerState,
            isActive: wagerState?.isActive,
            isResolved: wagerState?.resolved,
            wagerState: wagerState
          });
        }
      } else {
        console.error(`Invalid wager resolution:`, {
          isHost: game.host === playerID,
          hasCorrectChoice: payload.correctChoice !== undefined,
          hostId: game.host,
          socketId: playerID
        });
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
    const oldPoints = game.playerPoints[playerId];
    const newPoints = oldPoints + points; // Allow negative points
    game.playerPoints[playerId] = newPoints;
    console.log(`📊 Points update for ${game.playerNames[playerId]}: ${oldPoints} + (${points}) = ${newPoints}`);
    
    if (newPoints === 0) {
      console.log(`🚨 Player ${game.playerNames[playerId]} now has ZERO points!`);
    } else if (newPoints < 0) {
      console.log(`💸 Player ${game.playerNames[playerId]} now has NEGATIVE points: ${newPoints}`);
    }
    
    return true;
  }
  return false;
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

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io server ready for connections`);
  
  console.log('Player reconnection system enabled (players remain in game when disconnected)');
});
