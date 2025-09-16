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
  playerWagerCount: {}, // Track how many wagers each player has participated in
  error: null,
  // Wager system state
  wagerOptions: [],
  wagerActive: false,
  playerChoices: {},
  wagerResolved: false,
  wagerResults: null,
  wagerCategory: '',
  // Category ranking state
  categories: [],
  challengesPerCategory: [],
  playerRankings: {},
  rankingsComplete: false,
  showRankingForm: false,
  // Bounty system state
  bountyAmount: null,
  bountyVisible: false
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
    
    case 'SET_PLAYER_WAGER_COUNT':
      return { ...state, playerWagerCount: action.payload }
    
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
    
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload }
    
    case 'SET_CHALLENGES_PER_CATEGORY':
      return { ...state, challengesPerCategory: action.payload }
    
    case 'SET_PLAYER_RANKINGS':
      return { ...state, playerRankings: action.payload }
    
    case 'SET_RANKINGS_COMPLETE':
      return { ...state, rankingsComplete: action.payload }
    
    case 'SET_SHOW_RANKING_FORM':
      return { ...state, showRankingForm: action.payload }
    
    case 'SET_BOUNTY_AMOUNT':
      return { ...state, bountyAmount: action.payload }
    
    case 'SET_BOUNTY_VISIBLE':
      return { ...state, bountyVisible: action.payload }
    
    case 'SET_WAGER_CATEGORY':
      return { ...state, wagerCategory: action.payload }
    
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
      dispatch({ type: 'SET_PLAYER_WAGER_COUNT', payload: gameState.playerWagerCount || {} })
      
      // Update category ranking state
      if (gameState.categories) {
        dispatch({ type: 'SET_CATEGORIES', payload: gameState.categories })
      }
      if (gameState.challengesPerCategory) {
        dispatch({ type: 'SET_CHALLENGES_PER_CATEGORY', payload: gameState.challengesPerCategory })
      }
      if (gameState.playerRankings) {
        dispatch({ type: 'SET_PLAYER_RANKINGS', payload: gameState.playerRankings })
      }
      if (gameState.rankingsComplete !== undefined) {
        dispatch({ type: 'SET_RANKINGS_COMPLETE', payload: gameState.rankingsComplete })
      }
      
      // Show ranking form if categories exist and rankings are not complete
      if (gameState.categories && gameState.categories.length > 0 && !gameState.rankingsComplete) {
        dispatch({ type: 'SET_SHOW_RANKING_FORM', payload: true })
      }
    })

    // Handle joining a game
    socket.on('gameJoined', ({ gameId, gameState, wasReconnection, playerID, isHost }) => {
      console.log('gameJoined event received:', { gameId, wasReconnection, players: gameState.players, status: gameState.status, playerID, isHost })
      console.log('Current playerId when joining:', state.playerId);
      console.log('Received playerPoints:', gameState.playerPoints);
      console.log('Received playerNames:', gameState.playerNames);
      
      // Set the playerID from the server
      if (playerID) {
        dispatch({ type: 'SET_PLAYER_ID', payload: playerID })
      }
      
      dispatch({ type: 'SET_CURRENT_GAME', payload: gameId })
      dispatch({ type: 'SET_GAME_STATE', payload: gameState })
      dispatch({ type: 'SET_IS_HOST', payload: isHost || false })
      dispatch({ type: 'SET_PLAYERS', payload: gameState.players })
      dispatch({ type: 'SET_PLAYER_POINTS', payload: gameState.playerPoints })
      dispatch({ type: 'SET_PLAYER_NAMES', payload: gameState.playerNames })
      dispatch({ type: 'SET_PLAYER_WAGER_COUNT', payload: gameState.playerWagerCount || {} })
      
      // Update category ranking state
      if (gameState.categories) {
        dispatch({ type: 'SET_CATEGORIES', payload: gameState.categories })
      }
      if (gameState.challengesPerCategory) {
        dispatch({ type: 'SET_CHALLENGES_PER_CATEGORY', payload: gameState.challengesPerCategory })
      }
      if (gameState.playerRankings) {
        dispatch({ type: 'SET_PLAYER_RANKINGS', payload: gameState.playerRankings })
      }
      if (gameState.rankingsComplete !== undefined) {
        dispatch({ type: 'SET_RANKINGS_COMPLETE', payload: gameState.rankingsComplete })
      }
      
      // Show ranking form if categories exist and rankings are not complete
      if (gameState.categories && gameState.categories.length > 0 && !gameState.rankingsComplete) {
        dispatch({ type: 'SET_SHOW_RANKING_FORM', payload: true })
      }
      
      if (wasReconnection) {
        console.log('Successfully reconnected to existing game session')
        console.log('Current state after reconnection:', { currentGame: gameId, gameState: gameState, isHost })
      }
    })

    // Handle game state updates
    socket.on('gameStateUpdate', (gameState) => {
      console.log('gameStateUpdate received:', { 
        players: gameState.players, 
        playerNames: gameState.playerNames,
        currentPlayers: state.players,
        currentPlayerId: state.playerId,
        challengesPerCategory: gameState.challengesPerCategory
      })
      console.log('Received playerPoints in update:', gameState.playerPoints);
      
      // Update host status based on current player ID and game host
      const isHost = state.playerId && gameState.host === state.playerId;
      
      dispatch({ type: 'SET_GAME_STATE', payload: gameState })
      dispatch({ type: 'SET_PLAYERS', payload: gameState.players })
      dispatch({ type: 'SET_PLAYER_POINTS', payload: gameState.playerPoints })
      dispatch({ type: 'SET_PLAYER_NAMES', payload: gameState.playerNames })
      dispatch({ type: 'SET_PLAYER_WAGER_COUNT', payload: gameState.playerWagerCount || {} })
      dispatch({ type: 'SET_IS_HOST', payload: isHost })
      
      // Update category ranking state
      if (gameState.categories) {
        dispatch({ type: 'SET_CATEGORIES', payload: gameState.categories })
      }
      if (gameState.challengesPerCategory) {
        dispatch({ type: 'SET_CHALLENGES_PER_CATEGORY', payload: gameState.challengesPerCategory })
      }
      if (gameState.playerRankings) {
        dispatch({ type: 'SET_PLAYER_RANKINGS', payload: gameState.playerRankings })
      }
      if (gameState.rankingsComplete !== undefined) {
        dispatch({ type: 'SET_RANKINGS_COMPLETE', payload: gameState.rankingsComplete })
      }
      
      // Show ranking form if categories exist and rankings are not complete
      if (gameState.categories && gameState.categories.length > 0 && !gameState.rankingsComplete) {
        dispatch({ type: 'SET_SHOW_RANKING_FORM', payload: true })
      }
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
    socket.on('wagerProposed', ({ options, odds, wagerId, category }) => {
      console.log('🎯 wagerProposed event received:', { options, odds, wagerId, category })
      dispatch({ type: 'SET_WAGER_OPTIONS', payload: { options, odds } })
      dispatch({ type: 'SET_WAGER_ACTIVE', payload: true })
      dispatch({ type: 'SET_PLAYER_CHOICES', payload: {} })
      dispatch({ type: 'SET_WAGER_RESOLVED', payload: false })
      dispatch({ type: 'SET_WAGER_RESULTS', payload: null })
      dispatch({ type: 'SET_WAGER_CATEGORY', payload: category || '' })
      
      // Reset bounty visibility - will be updated when bets are placed
      dispatch({ type: 'SET_BOUNTY_VISIBLE', payload: false })
      dispatch({ type: 'SET_BOUNTY_AMOUNT', payload: null })
      
      console.log('✅ Wager state updated after proposal')
    })

    socket.on('choiceMade', ({ playerId, playerName, hasChosen, choice, points }) => {
      console.log('🎯 choiceMade event received:', { playerId, playerName, hasChosen, choice, points })
      const updatedChoices = { 
        ...state.playerChoices, 
        [playerId]: { hasChosen, choice, points, playerName } 
      };
      dispatch({ type: 'SET_PLAYER_CHOICES', payload: updatedChoices })
      
      // Update bounty visibility for competing players
      if (state.gameState && state.gameState.bounty && state.gameState.bounty !== 'None') {
        const currentPlayerName = state.playerNames[state.playerId];
        const isPlayerInContest = currentPlayerName === state.wagerOptions.options?.[0] || currentPlayerName === state.wagerOptions.options?.[1];
        
        if (isPlayerInContest) {
          // Calculate bounty amount based on current bets
          const allBets = Object.values(updatedChoices).map(choice => choice.points).filter(points => points > 0);
          let bountyAmount = null;
          
          if (allBets.length > 0) {
            switch (state.gameState.bounty) {
              case 'Fixed':
                bountyAmount = state.gameState.bountyAmount || 0;
                break;
              case 'Min':
                bountyAmount = Math.min(...allBets);
                break;
              case 'Max':
                bountyAmount = Math.max(...allBets);
                break;
              case 'Average':
                bountyAmount = Math.floor(allBets.reduce((sum, bet) => sum + bet, 0) / allBets.length);
                break;
            }
          }
          
          if (bountyAmount !== null) {
            dispatch({ type: 'SET_BOUNTY_VISIBLE', payload: true })
            dispatch({ type: 'SET_BOUNTY_AMOUNT', payload: bountyAmount })
          }
        }
      }
      
      console.log(`✅ Player ${playerName} choice recorded (choice and points hidden until resolution)`)
    })

    socket.on('wagerResolved', ({ correctChoice, results, wagerState, bountyAmount, winnerPlayerId }) => {
      console.log('🎯 wagerResolved event received:', { correctChoice, results, wagerState, bountyAmount, winnerPlayerId })
      dispatch({ type: 'SET_WAGER_RESOLVED', payload: true })
      dispatch({ type: 'SET_WAGER_RESULTS', payload: { correctChoice, results, wagerState, bountyAmount, winnerPlayerId } })
      dispatch({ type: 'SET_WAGER_ACTIVE', payload: false })
      dispatch({ type: 'SET_BOUNTY_AMOUNT', payload: bountyAmount })
      dispatch({ type: 'SET_BOUNTY_VISIBLE', payload: false })
      console.log('✅ Wager state updated after resolution')
    })

    socket.on('wagerCancelled', () => {
      console.log('🎯 wagerCancelled event received')
      dispatch({ type: 'SET_WAGER_RESOLVED', payload: false })
      dispatch({ type: 'SET_WAGER_RESULTS', payload: null })
      dispatch({ type: 'SET_WAGER_OPTIONS', payload: [] })
      dispatch({ type: 'SET_PLAYER_CHOICES', payload: {} })
      dispatch({ type: 'SET_WAGER_ACTIVE', payload: false })
      dispatch({ type: 'SET_WAGER_CATEGORY', payload: '' })
      dispatch({ type: 'SET_BOUNTY_AMOUNT', payload: null })
      dispatch({ type: 'SET_BOUNTY_VISIBLE', payload: false })
      console.log('✅ Wager state reset after cancellation')
    })

    // Handle category ranking events
    socket.on('rankingSubmitted', ({ playerId, playerName, totalPlayers, rankedPlayers }) => {
      console.log('📊 rankingSubmitted event received:', { playerId, playerName, totalPlayers, rankedPlayers })
      // This event is mainly for UI feedback - the actual rankings are updated via gameStateUpdate
    })

    socket.on('rankingsComplete', ({ playerRankings, categories }) => {
      console.log('📊 rankingsComplete event received:', { playerRankings, categories })
      dispatch({ type: 'SET_RANKINGS_COMPLETE', payload: true })
      dispatch({ type: 'SET_PLAYER_RANKINGS', payload: playerRankings })
      dispatch({ type: 'SET_CATEGORIES', payload: categories })
      dispatch({ type: 'SET_SHOW_RANKING_FORM', payload: false })
      console.log('✅ All players have completed category rankings')
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
      socket.off('wagerCancelled')
      // Clean up category ranking events
      socket.off('rankingSubmitted')
      socket.off('rankingsComplete')
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
  const proposeWager = (option1, option2, odds1 = 1, odds2 = 1, category = '') => {
    console.log('🎯 proposeWager called with:', { option1, option2, odds1, odds2, category, currentGame: state.currentGame })
    sendGameAction('proposeWager', { option1, option2, odds1, odds2, category })
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
    dispatch({ type: 'SET_WAGER_CATEGORY', payload: '' })
  }

  const cancelWager = () => {
    console.log('🎯 cancelWager called for game:', state.currentGame)
    sendGameAction('cancelWager', {})
  }

  const submitRankings = (rankings) => {
    sendGameAction('submitRankings', { rankings })
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
    cancelWager,
    submitRankings,
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
