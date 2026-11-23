import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react'

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
  wagerOptions: { options: [], odds: [1, 1] },
  wagerContestants: [], // playerIDs of the two players being bet on
  wagerActive: false,
  playerChoices: {},
  wagerResolved: false,
  wagerResults: null,
  wagerCategory: '',
  // Category ranking state
  categories: [],
  challengesPerCategory: [],
  playerRankings: {},
  rankingsComplete: false
}

// Fields derived from a server gameState payload, shared by
// gameCreated / gameJoined / gameStateUpdate handling.
function fromGameState(gameState) {
  const next = {
    gameState,
    players: gameState.players,
    playerPoints: gameState.playerPoints,
    playerNames: gameState.playerNames,
    playerWagerCount: gameState.playerWagerCount || {}
  }
  if (gameState.categories) next.categories = gameState.categories
  if (gameState.challengesPerCategory) next.challengesPerCategory = gameState.challengesPerCategory
  if (gameState.playerRankings) next.playerRankings = gameState.playerRankings
  if (gameState.rankingsComplete !== undefined) next.rankingsComplete = gameState.rankingsComplete
  return next
}

const clearedWagerFields = {
  wagerOptions: { options: [], odds: [1, 1] },
  wagerContestants: [],
  wagerActive: false,
  playerChoices: {},
  wagerResolved: false,
  wagerResults: null,
  wagerCategory: '',
  betsLockAt: null
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_SESSION':
      // Game/player identity recovered from the URL on reconnect
      return { ...state, currentGame: action.payload.gameId, playerId: action.payload.playerId }

    case 'GAME_CREATED': {
      const { playerID, gameState } = action.payload
      return {
        ...state,
        ...fromGameState(gameState),
        playerId: playerID,
        currentGame: gameState.id,
        isHost: true
      }
    }

    case 'GAME_JOINED': {
      const { gameId, playerID, isHost, gameState } = action.payload
      return {
        ...state,
        ...fromGameState(gameState),
        playerId: playerID || state.playerId,
        currentGame: gameId,
        isHost: !!isHost
      }
    }

    case 'GAME_STATE_UPDATE': {
      const gameState = action.payload
      return {
        ...state,
        ...fromGameState(gameState),
        isHost: !!(state.playerId && gameState.host === state.playerId)
      }
    }

    case 'WAGER_PROPOSED': {
      const { options, contestants, odds, category, betsLockAt } = action.payload
      return {
        ...state,
        ...clearedWagerFields,
        wagerOptions: { options, odds },
        wagerContestants: contestants || [],
        wagerActive: true,
        wagerCategory: category || '',
        betsLockAt: betsLockAt || null
      }
    }

    case 'BETS_LOCKING':
      return { ...state, betsLockAt: action.payload.betsLockAt }

    case 'CHOICE_MADE': {
      const { playerId, playerName, hasChosen, choice, points } = action.payload
      return {
        ...state,
        playerChoices: {
          ...state.playerChoices,
          [playerId]: { hasChosen, choice, points, playerName }
        }
      }
    }

    case 'WAGER_RESOLVED':
      return {
        ...state,
        wagerResolved: true,
        wagerResults: action.payload,
        wagerActive: false
      }

    case 'WAGER_CLEARED':
      // Wager cancelled by the host, or reset locally for the next round
      return { ...state, ...clearedWagerFields }

    case 'RANKINGS_COMPLETE':
      return {
        ...state,
        rankingsComplete: true,
        playerRankings: action.payload.playerRankings,
        categories: action.payload.categories
      }

    case 'GAME_NOT_FOUND':
      return { ...state, currentGame: null, gameState: null, playerId: null }

    case 'SET_ERROR':
      return { ...state, error: action.payload }

    case 'CLEAR_ERROR':
      return { ...state, error: null }

    default:
      return state
  }
}

export function GameProvider({ children, socket }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)

  // Keep a ref to the latest state so socket handlers (registered once)
  // never read stale values.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (!socket) return

    const handleConnect = () => {
      // Check if we're on a game page with player ID in URL
      // This handles the case where the page is refreshed and we need to reconnect
      const gameMatch = window.location.pathname.match(/\/game\/([^\/]+)\/player\/([^\/]+)/)

      if (gameMatch) {
        const [, gameId, playerId] = gameMatch
        dispatch({ type: 'SET_SESSION', payload: { gameId, playerId } })
        socket.emit('rejoinGame', { gameId, playerID: playerId })
      } else if (stateRef.current.currentGame && stateRef.current.playerId) {
        // Fallback: if we have a saved game state, try to rejoin
        socket.emit('rejoinGame', {
          gameId: stateRef.current.currentGame,
          playerID: stateRef.current.playerId
        })
      }
    }

    const handleGameCreated = (gameData) => {
      const { playerID, ...gameState } = gameData
      dispatch({ type: 'GAME_CREATED', payload: { playerID, gameState } })
    }

    const handleGameJoined = ({ gameId, gameState, playerID, isHost }) => {
      dispatch({ type: 'GAME_JOINED', payload: { gameId, gameState, playerID, isHost } })
    }

    const handleGameStateUpdate = (gameState) => {
      dispatch({ type: 'GAME_STATE_UPDATE', payload: gameState })
    }

    const handleWagerProposed = (payload) => {
      dispatch({ type: 'WAGER_PROPOSED', payload })
    }

    const handleChoiceMade = (payload) => {
      dispatch({ type: 'CHOICE_MADE', payload })
    }

    const handleWagerResolved = (payload) => {
      dispatch({ type: 'WAGER_RESOLVED', payload })
    }

    const handleWagerCancelled = () => {
      dispatch({ type: 'WAGER_CLEARED' })
    }

    const handleBetsLocking = (payload) => {
      dispatch({ type: 'BETS_LOCKING', payload })
    }

    const handleRankingsComplete = (payload) => {
      dispatch({ type: 'RANKINGS_COMPLETE', payload })
    }

    const handleRemovedFromGame = ({ reason }) => {
      dispatch({ type: 'GAME_NOT_FOUND' })
      if (reason) {
        window.alert(reason)
      }
      window.location.href = '/'
    }

    const handleError = ({ message }) => {
      console.error('Server error:', message)

      // If the error indicates the game was not found, clear the stored game and redirect
      if (message === 'Game not found' || message === 'Player not found in game') {
        dispatch({ type: 'GAME_NOT_FOUND' })
        window.location.href = '/'
        return
      }

      dispatch({ type: 'SET_ERROR', payload: message })
    }

    socket.on('connect', handleConnect)
    socket.on('gameCreated', handleGameCreated)
    socket.on('gameJoined', handleGameJoined)
    socket.on('gameStateUpdate', handleGameStateUpdate)
    socket.on('wagerProposed', handleWagerProposed)
    socket.on('choiceMade', handleChoiceMade)
    socket.on('wagerResolved', handleWagerResolved)
    socket.on('wagerCancelled', handleWagerCancelled)
    socket.on('betsLocking', handleBetsLocking)
    socket.on('rankingsComplete', handleRankingsComplete)
    socket.on('removedFromGame', handleRemovedFromGame)
    socket.on('error', handleError)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('gameCreated', handleGameCreated)
      socket.off('gameJoined', handleGameJoined)
      socket.off('gameStateUpdate', handleGameStateUpdate)
      socket.off('wagerProposed', handleWagerProposed)
      socket.off('choiceMade', handleChoiceMade)
      socket.off('wagerResolved', handleWagerResolved)
      socket.off('wagerCancelled', handleWagerCancelled)
      socket.off('betsLocking', handleBetsLocking)
      socket.off('rankingsComplete', handleRankingsComplete)
      socket.off('removedFromGame', handleRemovedFromGame)
      socket.off('error', handleError)
    }
  }, [socket])

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
    const targetGameId = gameId || state.currentGame
    const targetPlayerId = playerId || state.playerId

    if (targetGameId && targetPlayerId && socket) {
      socket.emit('rejoinGame', {
        gameId: targetGameId,
        playerID: targetPlayerId
      })
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

  // Wager system functions
  const proposeWager = (player1, player2, odds1 = 1, odds2 = 1, category = '') => {
    sendGameAction('proposeWager', { player1, player2, odds1, odds2, category })
  }

  const makeChoice = (choice, points) => {
    sendGameAction('makeChoice', { choice, points })
  }

  const resolveWager = (correctChoice) => {
    sendGameAction('resolveWager', { correctChoice })
  }

  const resetWagerState = () => {
    dispatch({ type: 'WAGER_CLEARED' })
  }

  const cancelWager = () => {
    sendGameAction('cancelWager', {})
  }

  const lockBets = () => {
    sendGameAction('lockBets', {})
  }

  const nextMatchup = (dogOdds) => {
    sendGameAction('nextMatchup', Number.isFinite(dogOdds) ? { dogOdds } : {})
  }

  const finishGame = () => {
    sendGameAction('finishGame', {})
  }

  const skipMatchup = () => {
    sendGameAction('skipMatchup', {})
  }

  const deferMatchup = () => {
    sendGameAction('deferMatchup', {})
  }

  const submitRankings = (rankings) => {
    sendGameAction('submitRankings', { rankings })
  }

  const removePlayer = (playerId) => {
    sendGameAction('removePlayer', { playerId })
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
    proposeWager,
    makeChoice,
    resolveWager,
    resetWagerState,
    cancelWager,
    lockBets,
    nextMatchup,
    finishGame,
    skipMatchup,
    deferMatchup,
    submitRankings,
    removePlayer,
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
