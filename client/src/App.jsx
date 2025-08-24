import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import io from 'socket.io-client'
import Home from './components/Home'
import GameLobby from './components/GameLobby'
import GameBoard from './components/GameBoard'
import { GameProvider } from './contexts/GameContext'
import './App.css'

// Socket connection
const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001')

function App() {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    socket.on('connect', () => {
      setIsConnected(true)
      console.log('Connected to server')
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
      console.log('Disconnected from server')
    })

    return () => {
      socket.off('connect')
      socket.off('disconnect')
    }
  }, [])

  return (
    <GameProvider socket={socket}>
      <Router>
        <div className="App">
          <header className="App-header">
            <h1>Underdog Bet</h1>
            <div className="connection-status">
              {isConnected ? (
                <span className="connected">🟢 Connected</span>
              ) : (
                <span className="disconnected">🔴 Disconnected</span>
              )}
            </div>
          </header>
          
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/lobby/:gameId" element={<GameLobby />} />
              <Route path="/game/:gameId" element={<GameBoard />} />
              <Route path="/game/:gameId/player/:playerId" element={<GameBoard />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </Router>
    </GameProvider>
  )
}

export default App
