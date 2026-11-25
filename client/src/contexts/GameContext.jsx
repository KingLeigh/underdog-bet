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
  // The result the host has moved on from (Next Matchup), so a rejoin's
  // replay of that same result doesn't drag them back to it
  dismissedResultId: null,
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
  wagerChallenge: '',
  betsLockAt: null,
  wagerMatchupNumber: null
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
      const { gameId, playerID, isHost, gameState, wagerActive } = action.payload
      return {
        ...state,
        // A (re)join is a full resync: with no contest live on the server,
        // drop any contest this client still remembers (a phone that slept
        // through the resolution). A live one is replayed right after, and
        // so is the last result between contests.
        ...(wagerActive ? {} : clearedWagerFields),
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
      const { options, contestants, odds, category, challenge, betsLockAt, matchupNumber } = action.payload
      return {
        ...state,
        ...clearedWagerFields,
        wagerOptions: { options, odds },
        wagerContestants: contestants || [],
        wagerActive: true,
        wagerCategory: category || '',
        wagerChallenge: challenge || '',
        betsLockAt: betsLockAt || null,
        wagerMatchupNumber: matchupNumber || null
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

    case 'WAGER_RESOLVED': {
      const result = action.payload
      // A replayed result the host already moved on from stays dismissed
      if (result.replay && result.resultId && result.resultId === state.dismissedResultId) {
        return state
      }
      // The resolved contest travels with the result, so a replay (which
      // arrives with no contest in memory) still shows the right odds
      const contest = result.wagerState
      return {
        ...state,
        wagerResolved: true,
        wagerResults: result,
        wagerActive: false,
        ...(contest && Array.isArray(contest.options) && contest.options.length
          ? {
              wagerOptions: { options: contest.options, odds: contest.odds || [1, 1] },
              wagerContestants: contest.contestants || []
            }
          : {})
      }
    }

    case 'WAGER_CLEARED':
      // Wager cancelled by the host, or reset locally for the next round
      return {
        ...state,
        ...clearedWagerFields,
        dismissedResultId: state.wagerResults?.resultId ?? state.dismissedResultId
      }

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

    // Ask the server for a fresh copy of this page's game: rejoin as the
    // player in the URL (or in memory), or watch it from the TV screen.
    // Returns false when this page isn't in a game.
    const resync = () => {
      const path = window.location.pathname
      const gameMatch = path.match(/\/game\/([^\/]+)\/player\/([^\/]+)/)
      const tvMatch = path.match(/^\/tv\/([^\/]+)/)

      if (gameMatch) {
        const [, gameId, playerId] = gameMatch
        dispatch({ type: 'SET_SESSION', payload: { gameId, playerId } })
        socket.emit('rejoinGame', { gameId, playerID: playerId })
      } else if (tvMatch) {
        socket.emit('watchGame', { gameId: tvMatch[1] })
      } else if (stateRef.current.currentGame && stateRef.current.playerId) {
        socket.emit('rejoinGame', {
          gameId: stateRef.current.currentGame,
          playerID: stateRef.current.playerId
        })
      } else {
        return false
      }
      return true
    }

    // Every (re)connection — a refresh, a network blip, a phone waking —
    // rejoins and resyncs
    const handleConnect = () => { resync() }

    // A locked phone suspends the page, and its socket can look connected
    // while actually dead, missing everything the host did meanwhile. When
    // the page comes back after more than a moment away, resync; if no
    // answer arrives quickly, the socket is dead — force a reconnect (whose
    // connect handler rejoins).
    let hiddenAt = null
    let lastJoinedAt = 0
    let watchdog = null
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = null
      if (away < 3000 || !socket.connected) return // reconnect logic covers a dropped socket
      const askedAt = Date.now()
      if (!resync()) return
      clearTimeout(watchdog)
      watchdog = setTimeout(() => {
        if (lastJoinedAt < askedAt) {
          socket.disconnect()
          socket.connect()
        }
      }, 3000)
    }

    const handleGameCreated = (gameData) => {
      const { playerID, ...gameState } = gameData
      dispatch({ type: 'GAME_CREATED', payload: { playerID, gameState } })
    }

    const handleGameJoined = ({ gameId, gameState, playerID, isHost, wagerActive }) => {
      lastJoinedAt = Date.now()
      dispatch({ type: 'GAME_JOINED', payload: { gameId, gameState, playerID, isHost, wagerActive } })
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
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      clearTimeout(watchdog)
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

  const nextMatchup = (number, dogOdds) => {
    const payload = {}
    if (Number.isFinite(number)) payload.number = number
    if (Number.isFinite(dogOdds)) payload.dogOdds = dogOdds
    sendGameAction('nextMatchup', payload)
  }

  const finishGame = () => {
    sendGameAction('finishGame', {})
  }

  const skipMatchup = (number) => {
    sendGameAction('skipMatchup', Number.isFinite(number) ? { number } : {})
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
