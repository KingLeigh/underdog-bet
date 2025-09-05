import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import io from 'socket.io-client'
import Home from './components/Home'
import CreateGame from './components/CreateGame'
import GameLobby from './components/GameLobby'
import GameBoard from './components/GameBoard'
import { GameProvider } from './contexts/GameContext'
import './App.css'

// Socket connection - use relative URL in production, absolute in development
const getSocketUrl = () => {
  if (import.meta.env.PROD) {
    // In production, connect to the same domain
    return window.location.origin;
  } else {
    // In development, use the environment variable or default
    return import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
  }
};

const socket = io(getSocketUrl())

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
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create-game" element={<CreateGame />} />
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
