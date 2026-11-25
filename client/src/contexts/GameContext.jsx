import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react'

// The client is a thin renderer of server state. The server sends the whole
// game (current contest included) on every change and on every join, so
// all this context keeps is who we are and the latest copy of the game;
// every screen derives what it shows from that. A refresh, a reconnect or
// a phone waking from sleep is just "ask for the state again".

const GameContext = createContext()

const initialState = {
  currentGame: null,
  playerId: null,
  gameState: null,
  error: null
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_SESSION':
      // Game/player identity recovered from the URL on reconnect
      return { ...state, currentGame: action.payload.gameId, playerId: action.payload.playerId }

    case 'GAME_STATE': {
      const { gameState, playerId } = action.payload
      return {
        ...state,
        gameState,
        currentGame: gameState.id,
        playerId: playerId || state.playerId
      }
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

    const handleGameCreated = ({ playerID, ...gameState }) => {
      dispatch({ type: 'GAME_STATE', payload: { gameState, playerId: playerID } })
    }

    const handleGameJoined = ({ gameState, playerID }) => {
      lastJoinedAt = Date.now()
      dispatch({ type: 'GAME_STATE', payload: { gameState, playerId: playerID } })
    }

    const handleGameStateUpdate = (gameState) => {
      dispatch({ type: 'GAME_STATE', payload: { gameState } })
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
    socket.on('removedFromGame', handleRemovedFromGame)
    socket.on('error', handleError)
    document.addEventListener('visibilitychange', handleVisibility)

    // The socket may have connected before these handlers were registered
    // (its 'connect' already fired): ask for the state now
    if (socket.connected) resync()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      clearTimeout(watchdog)
      socket.off('connect', handleConnect)
      socket.off('gameCreated', handleGameCreated)
      socket.off('gameJoined', handleGameJoined)
      socket.off('gameStateUpdate', handleGameStateUpdate)
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

  const cancelWager = () => {
    sendGameAction('cancelWager', {})
  }

  const lockBets = () => {
    sendGameAction('lockBets', {})
  }

  // Leave the Result screen (host): the game goes back to between contests
  const dismissResult = () => {
    sendGameAction('dismissResult', {})
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

  // Everything screens read is derived from the one game state
  const gs = state.gameState
  const value = {
    ...state,
    isHost: !!state.playerId && gs?.host === state.playerId,
    players: gs?.players || [],
    playerPoints: gs?.playerPoints || {},
    playerNames: gs?.playerNames || {},
    playerWagerCount: gs?.playerWagerCount || {},
    categories: gs?.categories || [],
    challengesPerCategory: gs?.challengesPerCategory || [],
    playerRankings: gs?.playerRankings || {},
    rankingsComplete: !!gs?.rankingsComplete,
    socket,
    createGame,
    joinGame,
    rejoinGame,
    sendGameAction,
    proposeWager,
    makeChoice,
    resolveWager,
    cancelWager,
    lockBets,
    dismissResult,
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
