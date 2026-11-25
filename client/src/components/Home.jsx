import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import './Home.css'

function Home() {
  const [gameId, setGameId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [codeError, setCodeError] = useState('')

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { joinGame, currentGame, gameState, error, clearError } = useGame()

  const handleJoinGame = (e) => {
    e.preventDefault()
    if (gameId.trim() && playerName.trim()) {
      joinGame(gameId.trim().toUpperCase(), playerName.trim())
    }
  }

  // Step one of joining: check the code exists, then show the invite card
  const handleCodeSubmit = async (e) => {
    e.preventDefault()
    const code = gameId.trim().toUpperCase()
    if (!code) return
    try {
      const res = await fetch(`/api/games/${code}`)
      if (!res.ok) {
        setCodeError(`No game found with code ${code}`)
        return
      }
      setCodeError('')
      navigate(`/?game=${code}`)
    } catch {
      setCodeError('Could not reach the game server')
    }
  }

  // Auto-navigate when game is created/joined
  useEffect(() => {
    if (currentGame && gameState) {
      navigate(`/lobby/${currentGame}`)
    }
  }, [currentGame, gameState, navigate])

  // Listen for errors and clear them
  useEffect(() => {
    if (error) {
      clearError()
    }
  }, [error, clearError])

  // Parse query parameter to pre-populate game ID
  useEffect(() => {
    const gameParam = searchParams.get('game')
    if (gameParam) {
      setGameId(gameParam.toUpperCase())
    }
  }, [searchParams])

  const hasGameParam = searchParams.get('game')

  return (
    <div className="home">
      <div className="home-hero">
        <div className="round-strip">A Gambling Party Game</div>
        <h1 className="home-title">UNDERDOGS</h1>
      </div>

      {hasGameParam ? (
        <div className="join-card">
          <div className="invite-line">
            🎉 You're invited to game <b>{gameId}</b>
          </div>
          <form onSubmit={handleJoinGame} className="join-form">
            <input
              type="text"
              placeholder="Your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="stage-input"
              required
              autoFocus
            />
            <button type="submit" className="mega-btn">JOIN THE GAME ★</button>
          </form>
        </div>
      ) : (
        <>
          <button className="mega-btn host-btn" onClick={() => navigate('/create-game')}>
            HOST A NEW GAME ★
          </button>

          <div className="home-divider">or join one</div>

          <form onSubmit={handleCodeSubmit} className="join-form">
            <input
              type="text"
              placeholder="GAME CODE"
              value={gameId}
              onChange={(e) => { setGameId(e.target.value.toUpperCase()); setCodeError('') }}
              className="stage-input code-input"
              maxLength="6"
              required
            />
            <button type="submit" className="mega-btn violet">JOIN GAME</button>
            {codeError && <div className="code-error">{codeError}</div>}
          </form>
        </>
      )}
    </div>
  )
}

export default Home
