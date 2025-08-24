import React, { createContext, useContext, useReducer, useEffect } from 'react'

const GameContext = createContext()

const initialState = {
  currentGame: null,
  playerId: null,
  playerName: '',
  isHost: false,
  gameState: null,
  players: [],
  playerPoints: {},
  playerNames: {},
  error: null,
  // Wager system state
  wagerOptions: [],
  wagerActive: false,
  playerChoices: {},
  wagerResolved: false,
  wagerResults: null
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_PLAYER_ID':
      return { ...state, playerId: action.payload }
    
    case 'SET_CURRENT_GAME':
      return { ...state, currentGame: action.payload }
    
    case 'SET_GAME_STATE':
      return { ...state, gameState: action.payload }
    
    case 'SET_PLAYERS':
      return { ...state, players: action.payload }
    
    case 'SET_PLAYER_POINTS':
      return { ...state, playerPoints: action.payload }
    
    case 'SET_PLAYER_NAMES':
      return { ...state, playerNames: action.payload }
    
    case 'SET_IS_HOST':
      return { ...state, isHost: action.payload }
    
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    
    case 'SET_WAGER_OPTIONS':
      return { ...state, wagerOptions: action.payload }
    
    case 'SET_WAGER_ACTIVE':
      return { ...state, wagerActive: action.payload }
    
    case 'SET_PLAYER_CHOICES':
      return { ...state, playerChoices: action.payload }
    
    case 'SET_WAGER_RESOLVED':
      return { ...state, wagerResolved: action.payload }
    
    case 'SET_WAGER_RESULTS':
      return { ...state, wagerResults: action.payload }
    
    case 'RESET_GAME':
      return { ...initialState, playerId: state.playerId }
    
    default:
      return state
  }
}

export function GameProvider({ children, socket }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)

  // Debug: Monitor playerId changes
  useEffect(() => {
    console.log('GameContext: playerId changed to:', state.playerId);
  }, [state.playerId]);

  // Debug: Monitor socket changes
  useEffect(() => {
    console.log('GameContext: socket changed to:', socket?.id);
  }, [socket?.id]);

  useEffect(() => {
    if (!socket) return

    // Set player ID when connected
    socket.on('connect', () => {
      console.log('Socket connected, socket ID:', socket.id);
      console.log('Previous playerId was:', state.playerId);
      
      // Check if we're on a game page with player ID in URL
      // This handles the case where the page is refreshed and we need to reconnect
      const currentPath = window.location.pathname;
      const gameMatch = currentPath.match(/\/game\/([^\/]+)\/player\/([^\/]+)/);
      
      if (gameMatch) {
        const [, gameId, playerId] = gameMatch;
        console.log('Found game URL in path, attempting to reconnect:', { gameId, playerId });
        
        // Set the current game and player ID from URL
        dispatch({ type: 'SET_CURRENT_GAME', payload: gameId });
        dispatch({ type: 'SET_PLAYER_ID', payload: playerId });
        
        // Attempt to rejoin the game
        rejoinGame(gameId, playerId);
      } else if (state.currentGame) {
        // Fallback: if we have a saved game state, try to rejoin
        console.log('Socket reconnected, attempting to rejoin saved game');
        rejoinGame(state.currentGame, state.playerId);
      }
    })

    // Handle game creation
    socket.on('gameCreated', (gameData) => {
      const { playerID, ...gameState } = gameData;
      console.log('Game created with playerID:', playerID);
      
      dispatch({ type: 'SET_PLAYER_ID', payload: playerID })
      dispatch({ type: 'SET_CURRENT_GAME', payload: gameState.id })
      dispatch({ type: 'SET_GAME_STATE', payload: gameState })
      dispatch({ type: 'SET_IS_HOST', payload: true })
      dispatch({ type: 'SET_PLAYERS', payload: gameState.players })
      dispatch({ type: 'SET_PLAYER_POINTS', payload: gameState.playerPoints })
      dispatch({ type: 'SET_PLAYER_NAMES', payload: gameState.playerNames })
    })

    // Handle joining a game
    socket.on('gameJoined', ({ gameId, gameState, wasReconnection, playerID }) => {
      console.log('gameJoined event received:', { gameId, wasReconnection, players: gameState.players, status: gameState.status, playerID })
      console.log('Current playerId when joining:', state.playerId);
      console.log('Received playerPoints:', gameState.playerPoints);
      console.log('Received playerNames:', gameState.playerNames);
      
      // Set the playerID from the server
      if (playerID) {
        dispatch({ type: 'SET_PLAYER_ID', payload: playerID })
      }
      
      dispatch({ type: 'SET_CURRENT_GAME', payload: gameId })
      dispatch({ type: 'SET_GAME_STATE', payload: gameState })
      dispatch({ type: 'SET_IS_HOST', payload: false })
      dispatch({ type: 'SET_PLAYERS', payload: gameState.players })
      dispatch({ type: 'SET_PLAYER_POINTS', payload: gameState.playerPoints })
      dispatch({ type: 'SET_PLAYER_NAMES', payload: gameState.playerNames })
      
      if (wasReconnection) {
        console.log('Successfully reconnected to existing game session')
        console.log('Current state after reconnection:', { currentGame: gameId, gameState: gameState })
      }
    })

    // Handle game state updates
    socket.on('gameStateUpdate', (gameState) => {
      console.log('gameStateUpdate received:', { 
        players: gameState.players, 
        playerNames: gameState.playerNames,
        currentPlayers: state.players,
        currentPlayerId: state.playerId
      })
      console.log('Received playerPoints in update:', gameState.playerPoints);
      
      dispatch({ type: 'SET_GAME_STATE', payload: gameState })
      dispatch({ type: 'SET_PLAYERS', payload: gameState.players })
      dispatch({ type: 'SET_PLAYER_POINTS', payload: gameState.playerPoints })
      dispatch({ type: 'SET_PLAYER_NAMES', payload: gameState.playerNames })
    })

    // Note: playerJoined events are no longer used - all state updates come via gameStateUpdate
    // This ensures consistent state across all players and prevents race conditions

    // Handle player leaving
    socket.on('playerLeft', ({ playerId }) => {
      if (state.gameState) {
        const updatedPlayers = state.gameState.players.filter(id => id !== playerId)
        dispatch({ type: 'SET_PLAYERS', payload: updatedPlayers })
        // Remove player's points when they leave
        const updatedPoints = { ...state.playerPoints }
        delete updatedPoints[playerId]
        dispatch({ type: 'SET_PLAYER_POINTS', payload: updatedPoints })
        // Remove player's name when they leave
        const updatedNames = { ...state.playerNames }
        delete updatedNames[playerId]
        dispatch({ type: 'SET_PLAYER_NAMES', payload: updatedNames })
      }
    })



    // Handle game ending
    socket.on('gameEnded', ({ reason }) => {
      dispatch({ type: 'SET_ERROR', payload: `Game ended: ${reason}` })
      dispatch({ type: 'RESET_GAME' })
    })

    // Handle wager events
    socket.on('wagerProposed', ({ options, wagerId }) => {
      console.log('🎯 wagerProposed event received:', { options, wagerId })
      dispatch({ type: 'SET_WAGER_OPTIONS', payload: options })
      dispatch({ type: 'SET_WAGER_ACTIVE', payload: true })
      dispatch({ type: 'SET_PLAYER_CHOICES', payload: {} })
      dispatch({ type: 'SET_WAGER_RESOLVED', payload: false })
      dispatch({ type: 'SET_WAGER_RESULTS', payload: null })
      console.log('✅ Wager state updated after proposal')
    })

    socket.on('choiceMade', ({ playerId, playerName, hasChosen, choice, points }) => {
      console.log('🎯 choiceMade event received:', { playerId, playerName, hasChosen, choice, points })
      dispatch({ type: 'SET_PLAYER_CHOICES', payload: { 
        ...state.playerChoices, 
        [playerId]: { hasChosen, choice, points, playerName } 
      }})
      console.log(`✅ Player ${playerName} choice recorded (choice and points hidden until resolution)`)
    })

    socket.on('wagerResolved', ({ correctChoice, results, wagerState }) => {
      console.log('🎯 wagerResolved event received:', { correctChoice, results, wagerState })
      dispatch({ type: 'SET_WAGER_RESOLVED', payload: true })
      dispatch({ type: 'SET_WAGER_RESULTS', payload: { correctChoice, results, wagerState } })
      dispatch({ type: 'SET_WAGER_ACTIVE', payload: false })
      console.log('✅ Wager state updated after resolution')
    })

    // Handle errors
    socket.on('error', ({ message }) => {
      console.error('Server error:', message);
      
      // If the error indicates the game was not found, clear the stored game and redirect
      if (message === 'Game not found' || message === 'Player not found in game') {
        console.log('Game not found on server - likely due to server restart. Clearing stored game data.');
        dispatch({ type: 'SET_CURRENT_GAME', payload: null });
        dispatch({ type: 'SET_GAME_STATE', payload: null });
        dispatch({ type: 'SET_PLAYER_ID', payload: null });
        
        // Redirect to home page
        window.location.href = '/';
        return;
      }
      
      // Handle other errors normally
      dispatch({ type: 'SET_ERROR', payload: message });
    })

    return () => {
      socket.off('gameCreated')
      socket.off('gameJoined')
      socket.off('gameStateUpdate')
      socket.off('playerLeft')
      socket.off('playerDisconnected')
      socket.off('gameEnded')
      socket.off('error')
      // Clean up wager events
      socket.off('wagerProposed')
      socket.off('choiceMade')
      socket.off('wagerResolved')
    }
  }, [socket, state.gameState])

  const createGame = (gameConfig) => {
    if (socket) {
      socket.emit('createGame', gameConfig)
    }
  }

  const joinGame = (gameId, playerName) => {
    if (socket) {
      socket.emit('joinGame', { gameId, playerName })
    }
  }

  const rejoinGame = (gameId, playerId) => {
    // For reconnection, we need the gameId and playerID passed as parameters
    // This avoids the race condition with state updates
    const targetGameId = gameId || state.currentGame;
    const targetPlayerId = playerId || state.playerId;
    
    if (targetGameId && targetPlayerId && socket) {
      console.log('Reconnecting to game:', { 
        gameId: targetGameId, 
        playerID: targetPlayerId 
      });
      
      socket.emit('rejoinGame', { 
        gameId: targetGameId, 
        playerID: targetPlayerId 
      });
    } else {
      console.error('Cannot rejoin game - missing gameId or playerId:', {
        targetGameId,
        targetPlayerId,
        socket: !!socket
      });
    }
  }

  const sendGameAction = (action, payload) => {
    if (socket && state.currentGame) {
      socket.emit('gameAction', {
        gameId: state.currentGame,
        action,
        payload
      })
    }
  }

  const getPlayerPoints = (playerId) => {
    return state.playerPoints[playerId] !== undefined ? state.playerPoints[playerId] : 0
  }

  // Wager system functions
  const proposeWager = (option1, option2) => {
    console.log('🎯 proposeWager called with:', { option1, option2, currentGame: state.currentGame })
    sendGameAction('proposeWager', { option1, option2 })
  }

  const makeChoice = (choice, points) => {
    sendGameAction('makeChoice', { choice, points })
  }

  const resolveWager = (correctChoice) => {
    sendGameAction('resolveWager', { correctChoice })
  }

  const resetWagerState = () => {
    dispatch({ type: 'SET_WAGER_RESOLVED', payload: false })
    dispatch({ type: 'SET_WAGER_RESULTS', payload: null })
    dispatch({ type: 'SET_WAGER_OPTIONS', payload: [] })
    dispatch({ type: 'SET_PLAYER_CHOICES', payload: {} })
    dispatch({ type: 'SET_WAGER_ACTIVE', payload: false })
  }

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' })
  }

  const value = {
    ...state,
    socket,
    createGame,
    joinGame,
    rejoinGame,
    sendGameAction,
    getPlayerPoints,
    proposeWager,
    makeChoice,
    resolveWager,
    resetWagerState,
    clearError
  }

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
