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
  error: null
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
    
    case 'RESET_GAME':
      return { ...initialState, playerId: state.playerId }
    
    default:
      return state
  }
}

export function GameProvider({ children, socket }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)

  useEffect(() => {
    if (!socket) return

    // Set player ID when connected
    socket.on('connect', () => {
      dispatch({ type: 'SET_PLAYER_ID', payload: socket.id })
    })

    // Handle game creation
    socket.on('gameCreated', (gameData) => {
      dispatch({ type: 'SET_CURRENT_GAME', payload: gameData.id })
      dispatch({ type: 'SET_GAME_STATE', payload: gameData })
      dispatch({ type: 'SET_IS_HOST', payload: true })
      dispatch({ type: 'SET_PLAYERS', payload: gameData.players })
      dispatch({ type: 'SET_PLAYER_POINTS', payload: gameData.playerPoints })
      dispatch({ type: 'SET_PLAYER_NAMES', payload: gameData.playerNames })
    })

    // Handle joining a game
    socket.on('gameJoined', ({ gameId, gameState }) => {
      dispatch({ type: 'SET_CURRENT_GAME', payload: gameId })
      dispatch({ type: 'SET_GAME_STATE', payload: gameState })
      dispatch({ type: 'SET_IS_HOST', payload: false })
      dispatch({ type: 'SET_PLAYERS', payload: gameState.players })
      dispatch({ type: 'SET_PLAYER_POINTS', payload: gameState.playerPoints })
      dispatch({ type: 'SET_PLAYER_NAMES', payload: gameState.playerNames })
    })

    // Handle game state updates
    socket.on('gameStateUpdate', (gameState) => {
      dispatch({ type: 'SET_GAME_STATE', payload: gameState })
      dispatch({ type: 'SET_PLAYERS', payload: gameState.players })
      dispatch({ type: 'SET_PLAYER_POINTS', payload: gameState.playerPoints })
      dispatch({ type: 'SET_PLAYER_NAMES', payload: gameState.playerNames })
    })

    // Handle player joining
    socket.on('playerJoined', ({ playerId, playerName }) => {
      if (state.gameState) {
        const updatedPlayers = [...state.gameState.players, playerId]
        dispatch({ type: 'SET_PLAYERS', payload: updatedPlayers })
        // New player starts with 100 points
        dispatch({ type: 'SET_PLAYER_POINTS', payload: { ...state.playerPoints, [playerId]: 100 } })
        // Add new player's name
        dispatch({ type: 'SET_PLAYER_NAMES', payload: { ...state.playerNames, [playerId]: playerName } })
      }
    })

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

    // Handle errors
    socket.on('error', ({ message }) => {
      dispatch({ type: 'SET_ERROR', payload: message })
    })

    return () => {
      socket.off('gameCreated')
      socket.off('gameJoined')
      socket.off('gameStateUpdate')
      socket.off('playerJoined')
      socket.off('playerLeft')
      socket.off('gameEnded')
      socket.off('error')
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

  const sendGameAction = (action, payload) => {
    if (socket && state.currentGame) {
      socket.emit('gameAction', {
        gameId: state.currentGame,
        action,
        payload
      })
    }
  }

  const addPoints = (playerId, points) => {
    sendGameAction('addPoints', { playerId, points })
  }

  const setPoints = (playerId, points) => {
    sendGameAction('setPoints', { playerId, points })
  }

  const getPlayerPoints = (playerId) => {
    return state.playerPoints[playerId] || 0
  }

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' })
  }

  const value = {
    ...state,
    socket,
    createGame,
    joinGame,
    sendGameAction,
    addPoints,
    setPoints,
    getPlayerPoints,
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
