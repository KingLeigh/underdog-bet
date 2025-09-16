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
    ? false // Disable CORS in production since we're serving from same domain
    : process.env.CLIENT_URL || "http://localhost:5173",
  methods: ["GET", "POST"]
};

const io = socketIo(server, {
  cors: corsOptions
});

// Middleware
app.use(helmet());
app.use(cors());
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

// Generate unique player ID
function generatePlayerID() {
  return `p${nextPlayerID++}`;
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
  
  // Track connection time for debugging rapid refresh issues
  const connectionTime = Date.now();
  console.log(`Connection timestamp: ${new Date(connectionTime).toISOString()}`);

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
        
        // Get current wager state for this game
        const wagerState = wagerStates.get(gameId);
        
        socket.emit('gameJoined', { gameId, gameState: game, wasReconnection: true, playerID, isHost: game.host === playerID });
        
        // If there's an active wager, send wager state to the reconnecting player
        if (wagerState && wagerState.isActive && !wagerState.resolved) {
          console.log(`Sending active wager state to rejoining player ${playerName} (${playerID})`);
          
          // Send wager options
          socket.emit('wagerProposed', {
            options: wagerState.options,
            odds: wagerState.odds,
            wagerId: Date.now().toString()
          });
          
          // Send current player choices (reveal points but keep choice secret)
          for (const [choicePlayerId, choiceData] of Object.entries(wagerState.playerChoices)) {
            const choicePlayerName = game.playerNames[choicePlayerId] || 'Unknown Player';
            socket.emit('choiceMade', {
              playerId: choicePlayerId,
              playerName: choicePlayerName,
              hasChosen: true,
              choice: null, // Don't reveal the choice until resolution
              points: choiceData.points  // Show the wager amount for tension
            });
          }
        }
        
        // Notify other players about the reconnection
        socket.to(gameId).emit('gameStateUpdate', game);
        
        console.log(`Player ${playerName} rejoined successfully`);
      } else {
        // New player trying to join - check if game has already started
        if (game.status === 'playing') {
          console.log(`New player ${playerName} tried to join game ${gameId} but game has already started`);
          socket.emit('error', { message: 'Cannot join game that has already started' });
          return;
        }
        
        // New player joining - add them to the game
        game.players.push(playerID);
        game.playerPoints[playerID] = game.startingPoints || 100;
        game.playerNames[playerID] = playerName || `Player${game.players.length}`;
        
        console.log(`New player ${playerName} joined game ${gameId}. Initial points: ${game.playerPoints[playerID]} (PlayerID: ${playerID})`);
        console.log(`Current game state after join:`, {
          players: game.players,
          playerPoints: game.playerPoints,
          playerNames: game.playerNames,
          startingPoints: game.startingPoints
        });
        
        socket.join(gameId);
        socket.emit('gameJoined', { gameId, gameState: game, wasReconnection: false, playerID, isHost: game.host === playerID });
        
        // Debug logging for category ranking
        console.log(`New player ${playerName} joined game ${gameId}. Category data:`, {
          categories: game.categories,
          playerRankings: game.playerRankings,
          rankingsComplete: game.rankingsComplete
        });
        
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
    
    // Use configured starting points or default to 100
    const startingPoints = gameConfig.startingPoints || 100;
    // Use configured max bet size or null if not provided
    const maxBetSize = gameConfig.maxBetSize || null;
    // Use configured bounty or default to 'None'
    const bounty = gameConfig.bounty || 'None';
    // Use configured bounty amount or null if not provided
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
    console.log(`Game ${gameId} created by ${gameConfig.playerName || 'Unknown'} (PlayerID: ${playerID})`);
    console.log(`Initial game state:`, {
      players: gameState.players,
      playerPoints: gameState.playerPoints,
      playerNames: gameState.playerNames,
      categories: gameState.categories,
      startingPoints: gameState.startingPoints,
      maxBetSize: gameState.maxBetSize
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

  // Handle player reconnection using playerID
  socket.on('rejoinGame', (data) => {
    const { gameId, playerID } = data;
    
    console.log(`rejoinGame request received:`, { gameId, playerID, socketId: socket.id });
    
    if (!gameId || !playerID) {
      console.error(`rejoinGame: Missing gameId or playerID`, { gameId, playerID });
      socket.emit('error', { message: 'Missing gameId or playerID' });
      return;
    }
    
    const game = gameSessions.get(gameId);
    if (!game) {
      console.error(`rejoinGame: Game not found`, { gameId, playerID });
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    console.log(`rejoinGame: Found game ${gameId}`, { 
      gameStatus: game.status, 
      players: game.players, 
      playerPoints: game.playerPoints 
    });
    
    // Check if this playerID exists in the game
    if (!game.players.includes(playerID)) {
      console.error(`rejoinGame: Player ${playerID} not found in game ${gameId}`, { 
        gamePlayers: game.players, 
        requestedPlayerID: playerID 
      });
      socket.emit('error', { message: 'Player not found in game' });
      return;
    }
    
    // Get player data from registry
    const playerData = playerRegistry.get(playerID);
    if (!playerData) {
      console.error(`rejoinGame: Player ${playerID} not found in registry`);
      socket.emit('error', { message: 'Player not found in registry' });
      return;
    }
    
    console.log(`rejoinGame: Found player in registry`, { 
      playerID, 
      playerName: playerData.playerName, 
      oldSocketID: playerData.socketID,
      gameId: playerData.gameId 
    });
    
    // Log registry state before update
    console.log(`Registry state BEFORE update for player ${playerID}:`, {
      socketID: playerData.socketID,
      playerName: playerData.playerName,
      gameId: playerData.gameId,
      lastSeen: playerData.lastSeen
    });
    
    // Update player registry with new socket ID
    playerData.socketID = socket.id;
    playerData.lastSeen = Date.now();
    
    console.log(`Player ${playerData.playerName} (${playerID}) reconnecting to game ${gameId} with new socket ${socket.id}`);
    
    // Verify the registry update was successful
    const updatedPlayerData = playerRegistry.get(playerID);
    if (updatedPlayerData && updatedPlayerData.socketID === socket.id) {
      console.log(`✅ Registry update successful: ${playerID} -> ${socket.id}`);
      
      // Log registry state after update
      console.log(`Registry state AFTER update for player ${playerID}:`, {
        socketID: updatedPlayerData.socketID,
        playerName: updatedPlayerData.playerName,
        gameId: updatedPlayerData.gameId,
        lastSeen: updatedPlayerData.lastSeen
      });
    } else {
      console.error(`❌ Registry update failed for player ${playerID}`);
      console.log(`Expected: ${socket.id}, Got: ${updatedPlayerData?.socketID}`);
    }
    
    // Small delay to ensure registry update is fully processed
    // This helps with rapid refresh scenarios where disconnect might happen immediately
    setTimeout(() => {
      // Join the game room
      socket.join(gameId);
      
      // Get current wager state for this game
      const wagerState = wagerStates.get(gameId);
      
      // Send game state to reconnecting player
      socket.emit('gameJoined', { 
        gameId, 
        gameState: game, 
        wasReconnection: true, 
        playerID,
        isHost: game.host === playerID
      });
      
      // If there's an active wager, send wager state to the reconnecting player
      if (wagerState && wagerState.isActive && !wagerState.resolved) {
        console.log(`Sending active wager state to reconnecting player ${playerData.playerName} (${playerID})`);
        
        // Send wager options
        socket.emit('wagerProposed', {
          options: wagerState.options,
          odds: wagerState.odds,
          wagerId: Date.now().toString()
        });
        
                  // Send current player choices (reveal points but keep choice secret)
          for (const [choicePlayerId, choiceData] of Object.entries(wagerState.playerChoices)) {
            const choicePlayerName = game.playerNames[choicePlayerId] || 'Unknown Player';
            socket.emit('choiceMade', {
              playerId: choicePlayerId,
              playerName: choicePlayerName,
              hasChosen: true,
              choice: null, // Don't reveal the choice until resolution
              points: choiceData.points  // Show the wager amount for tension
            });
          }
      }
      
      // Notify other players about the reconnection
      socket.to(gameId).emit('gameStateUpdate', game);
      
      console.log(`Player ${playerData.playerName} (${playerID}) successfully reconnected to game ${gameId}`);
    }, 100); // 100ms delay
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
      console.log(`Current player registry:`, Array.from(playerRegistry.entries()).map(([id, data]) => ({
        playerID: id,
        socketID: data.socketID,
        playerName: data.playerName,
        gameId: data.gameId
      })));
      
      // Check if this socket was recently connected but not yet registered
      // This can happen during rapid connect/disconnect cycles (like browser refresh)
      console.log(`Socket ${socket.id} not found in registry - may be a rapid refresh case`);
      return;
    }
    
    // Get player data for logging
    const playerData = playerRegistry.get(disconnectedPlayerID);
    console.log(`Player ${playerData.playerName} (${disconnectedPlayerID}) disconnected from socket ${socket.id}`);
    
    // Clean up game sessions if host disconnects
    for (const [gameId, game] of gameSessions.entries()) {
      if (game.host === disconnectedPlayerID) {
        // Don't delete the game when host disconnects - they can reconnect
        // Only notify other players that the host is temporarily unavailable
        console.log(`Host ${playerData.playerName} (${disconnectedPlayerID}) disconnected from game ${gameId}`);
        console.log(`Game ${gameId} remains active - host can reconnect using their playerID`);
        
        // Optionally, we could mark the host as disconnected in the game state
        // but keep the game session alive
      }
      // Note: We no longer remove players from the game when they disconnect
      // They remain in the score tracker and can reconnect later
    }
    
    // Update player registry - mark as disconnected but keep player data
    if (playerData) {
      playerData.socketID = null; // Mark as disconnected but keep player data
      console.log(`Marked player ${disconnectedPlayerID} (${playerData.playerName}) as disconnected in registry`);
      console.log(`Player can reconnect using playerID: ${disconnectedPlayerID}`);
      
      // Log the updated registry state for debugging
      console.log(`Updated player registry after disconnect:`, Array.from(playerRegistry.entries()).map(([id, data]) => ({
        playerID: id,
        socketID: data.socketID,
        playerName: data.playerName,
        gameId: data.gameId
      })));
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
      // Host proposes a wager with two options and odds
      if (game.host === playerID && payload.option1 && payload.option2) {
        const wagerState = wagerStates.get(game.id);
        console.log(`Proposing wager for game ${game.id}. Current wager state:`, wagerState);
        
        // Extract odds from payload, defaulting to 1 if not provided
        const odds1 = payload.odds1 || 1;
        const odds2 = payload.odds2 || 1;
        const category = payload.category || '';
        
        if (wagerState) {
          // Clear any previous wager state completely
          wagerState.isActive = true;
          wagerState.options = [payload.option1, payload.option2];
          wagerState.odds = [odds1, odds2];
          wagerState.category = category;
          wagerState.playerChoices = {};
          wagerState.resolved = false;
          wagerState.correctOption = null;
          
          console.log(`Host ${game.playerNames[playerID]} proposed wager: "${payload.option1}" (${odds1}x) vs "${payload.option2}" (${odds2}x)${category ? ` in ${category}` : ''}`);
          console.log(`Updated wager state:`, wagerState);
          
          // Emit wager proposed event to all players
          io.to(game.id).emit('wagerProposed', {
            options: [payload.option1, payload.option2],
            odds: [odds1, odds2],
            wagerId: Date.now().toString(),
            category: category
          });
        } else {
          console.error(`No wager state found for game ${game.id}. Creating new one.`);
          // Create a new wager state if it doesn't exist
          const newWagerState = {
            isActive: true,
            options: [payload.option1, payload.option2],
            odds: [odds1, odds2],
            category: category,
            playerChoices: {},
            resolved: false,
            correctOption: null
          };
          wagerStates.set(game.id, newWagerState);
          
          console.log(`Created new wager state for game ${game.id}:`, newWagerState);
          
          // Emit wager proposed event to all players
          io.to(game.id).emit('wagerProposed', {
            options: [payload.option1, payload.option2],
            odds: [odds1, odds2],
            wagerId: Date.now().toString(),
            category: category
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
          let maxWager = Math.max(50, currentPoints);
          
          // Apply game-level maximum bet size limit if configured
          if (game.maxBetSize !== null && game.maxBetSize !== undefined) {
            maxWager = Math.min(maxWager, game.maxBetSize);
          }
          
          if (payload.points > maxWager) {
            const reason = game.maxBetSize !== null ? `game max bet limit (${game.maxBetSize})` : `max allowed (${Math.max(50, currentPoints)})`;
            console.log(`Player ${game.playerNames[playerID]} tried to wager ${payload.points} points, but exceeded ${reason} (current: ${currentPoints})`);
            return game;
          }
          
          // Prevent players from betting against themselves
          const currentPlayerName = game.playerNames[playerID];
          const option0Name = wagerState.options[0];
          const option1Name = wagerState.options[1];
          const isPlayerInContest = currentPlayerName === option0Name || currentPlayerName === option1Name;
          
          if (isPlayerInContest) {
            // Player is in the contest - they can only bet on themselves
            const chosenOptionName = wagerState.options[payload.choice];
            if (chosenOptionName !== currentPlayerName) {
              console.log(`Player ${currentPlayerName} tried to bet against themselves on ${chosenOptionName}, but this is not allowed`);
              return game;
            }
            console.log(`Player ${currentPlayerName} is betting on themselves (${chosenOptionName}) with ${payload.points} points`);
          } else {
            // Player is not in the contest - they can bet on either option
            console.log(`Player ${currentPlayerName} wagering ${payload.points} points on ${wagerState.options[payload.choice]} (current balance: ${currentPoints}, max allowed: ${maxWager})`);
          }
          
          // Store the choice and wager amount
          wagerState.playerChoices[playerID] = {
            choice: payload.choice,
            points: payload.points
          };
          
          console.log(`Player ${game.playerNames[playerID]} chose option ${payload.choice} (${wagerState.options[payload.choice]}) with ${payload.points} points`);
          
          // Emit choice made event to all players (reveal points but keep choice secret)
          io.to(game.id).emit('choiceMade', {
            playerId: playerID,
            playerName: game.playerNames[playerID] || 'Unknown Player',
            hasChosen: true,
            choice: null, // Don't reveal the choice until resolution
            points: payload.points  // Show the wager amount for tension
          });
        }
      }
      return game;
      
    case 'cancelWager':
      // Host cancels the wager - no points awarded or lost
      if (game.host === playerID) {
        const wagerState = wagerStates.get(game.id);
        console.log(`Cancelling wager for game ${game.id}. Current wager state:`, wagerState);
        
        if (wagerState && wagerState.isActive && !wagerState.resolved) {
          // Clear the wager state completely
          wagerStates.delete(game.id);
          console.log(`✅ Wager cancelled for game ${game.id} - all bets nullified`);
          
          // Emit cancellation event to all players
          io.to(game.id).emit('wagerCancelled');
          
          return game;
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
          
          // Calculate bounty amount
          const bountyAmount = calculateBountyAmount(game, wagerState);
          console.log(`💰 Bounty amount calculated: ${bountyAmount} (config: ${game.bounty})`);
          
          // Process wager results with point gains/losses
          console.log(`🎯 Processing wager results. Player points before resolution:`, game.playerPoints);
          
          // Initialize playerWagerCount if it doesn't exist
          if (!game.playerWagerCount) {
            game.playerWagerCount = {};
          }
          
          let results = [];
          let winnerPlayerId = null;
          
          // First, identify the contest winner based on the correct choice
          const winningOption = wagerState.options[payload.correctChoice];
          console.log(`🏆 Contest winner is: ${winningOption}`);
          
          // Find the player ID for the winning option
          for (const [playerId, playerName] of Object.entries(game.playerNames)) {
            if (playerName === winningOption) {
              winnerPlayerId = playerId;
              console.log(`🏆 Winner identified: ${playerName} (${playerId})`);
              break;
            }
          }
          
          for (const [playerId, choiceData] of Object.entries(wagerState.playerChoices)) {
            const { choice, points } = choiceData;
            console.log(`Processing player ${game.playerNames[playerId]}: choice=${choice}, wagered=${points}, correct=${payload.correctChoice}`);
            
            // Check if this player is one of the two being compared in the contest
            const playerName = game.playerNames[playerId];
            const isPlayerInContest = playerName === wagerState.options[0] || playerName === wagerState.options[1];
            
            // Only increment wager count for players who are actually in the contest
            if (isPlayerInContest) {
              game.playerWagerCount[playerId] = (game.playerWagerCount[playerId] || 0) + 1;
              console.log(`📊 Incremented wager count for contest participant ${playerName}: ${game.playerWagerCount[playerId]}`);
            } else {
              console.log(`📊 Skipping wager count increment for bettor ${playerName} (not in contest)`);
            }
            
            if (choice === payload.correctChoice) {
              // Player was correct - they gain the points they wagered MULTIPLIED BY the odds
              const odds = wagerState.odds[choice];
              const pointsAwarded = Math.floor(points * odds);
              console.log(`✅ Player ${game.playerNames[playerId]} was correct, adding ${pointsAwarded} points (${points} × ${odds})`);
              addPoints(game, playerId, pointsAwarded);
              
              // Check if this player is one of the two competing players
              const playerName = game.playerNames[playerId];
              const isPlayerInContest = playerName === wagerState.options[0] || playerName === wagerState.options[1];
              
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
              console.log(`❌ Player ${game.playerNames[playerId]} was incorrect, subtracting ${points} points`);
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
            console.log(`💰 Awarding bounty of ${bountyAmount} points to winner ${game.playerNames[winnerPlayerId]}`);
            addPoints(game, winnerPlayerId, bountyAmount);
            console.log(`💰 Winner ${game.playerNames[winnerPlayerId]} received bounty of ${bountyAmount} points`);
          }
          
          console.log(`🎯 Player points after resolution:`, game.playerPoints);
          console.log(`📊 Final wager counts after resolution:`, game.playerWagerCount);
          
          console.log(`Wager resolved by host ${game.playerNames[playerID]}. Correct answer: Option ${payload.correctChoice}. Results:`, results);
          
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
      
    case 'submitRankings':
      // Player submits their category rankings
      if (payload.rankings && game.categories && game.categories.length > 0) {
        // Validate rankings
        const expectedRanks = game.categories.length;
        const submittedRanks = Object.values(payload.rankings);
        
        // Check if all categories are ranked
        if (submittedRanks.length !== expectedRanks) {
          console.log(`Player ${game.playerNames[playerID]} submitted incomplete rankings`);
          return game;
        }
        
        // Check if ranks are unique and valid (1 to expectedRanks)
        const validRanks = new Set(Array.from({length: expectedRanks}, (_, i) => i + 1));
        const submittedRanksSet = new Set(submittedRanks);
        
        if (submittedRanksSet.size !== expectedRanks || 
            !submittedRanks.every(rank => validRanks.has(rank))) {
          console.log(`Player ${game.playerNames[playerID]} submitted invalid rankings`);
          return game;
        }
        
        // Store the rankings
        game.playerRankings[playerID] = payload.rankings;
        console.log(`Player ${game.playerNames[playerID]} submitted rankings:`, payload.rankings);
        
        // Check if all players have submitted rankings
        const allPlayersRanked = game.players.every(pid => game.playerRankings[pid]);
        if (allPlayersRanked) {
          game.rankingsComplete = true;
          console.log(`All players have submitted rankings for game ${game.id}`);
          
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
  const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
  
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
          console.log(`Removed abandoned player ${playerID} (${playerData.playerName}) from registry`);
        }
      }
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupAbandonedGames, 10 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io server ready for connections`);
  
  console.log('Player reconnection system enabled (players remain in game when disconnected)');
  console.log('Abandoned game cleanup enabled (30 minute timeout)');
});