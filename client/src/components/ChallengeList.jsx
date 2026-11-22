import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import ChallengesTable from './shared/ChallengesTable'
import RulesModal from './shared/RulesModal'
import './ChallengeList.css'

function ChallengeList() {
  const [searchParams] = useSearchParams()
  const [allChallenges, setAllChallenges] = useState([])
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedChallenge, setSelectedChallenge] = useState(null)
  const [deselectedChallenges, setDeselectedChallenges] = useState(new Set())

  // Fetch all challenges from server
  useEffect(() => {
    const fetchChallenges = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const response = await fetch('/api/challenges')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const data = await response.json()
        setAllChallenges(data)
        
      } catch (err) {
        console.error('Error fetching challenges:', err)
        setError('Failed to load challenges. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchChallenges()
  }, [])

  // Filter challenges based on URL parameter
  useEffect(() => {
    if (allChallenges.length > 0) {
      const challengeIdsParam = searchParams.get('challenges')
      if (challengeIdsParam) {
        const challengeIds = challengeIdsParam.split(',').map(id => parseInt(id.trim()))
        const selectedChallenges = allChallenges.filter(challenge => 
          challengeIds.includes(challenge.id)
        ).sort((a, b) => {
          // First sort by selection status (selected first, deselected last)
          const aSelected = !deselectedChallenges.has(a.id)
          const bSelected = !deselectedChallenges.has(b.id)
          
          if (aSelected !== bSelected) {
            return bSelected - aSelected // true (selected) comes before false (deselected)
          }
          
          // Then sort by category, then by ID within each category
          if (a.category !== b.category) {
            return a.category.localeCompare(b.category)
          }
          return a.id - b.id
        })
        setChallenges(selectedChallenges)
      } else {
        // If no challenges parameter, show all challenges
        setChallenges(allChallenges)
      }
    }
  }, [allChallenges, searchParams, deselectedChallenges])

  const openRulesModal = (challenge) => {
    setSelectedChallenge(challenge)
    setModalOpen(true)
  }

  const closeRulesModal = () => {
    setModalOpen(false)
    setSelectedChallenge(null)
  }

  const toggleChallengeSelection = (challengeId) => {
    const newDeselected = new Set(deselectedChallenges)
    if (newDeselected.has(challengeId)) {
      newDeselected.delete(challengeId)
    } else {
      newDeselected.add(challengeId)
    }
    setDeselectedChallenges(newDeselected)
  }

  const createGame = () => {
    // Only use challenges that are not deselected
    const availableChallenges = challenges.filter(challenge => !deselectedChallenges.has(challenge.id))
    
    // Calculate categories and their counts
    const categoryCounts = {}
    availableChallenges.forEach(challenge => {
      categoryCounts[challenge.category] = (categoryCounts[challenge.category] || 0) + 1
    })
    
    // Create URL parameters
    const categoriesParam = Object.keys(categoryCounts).join(',')
    const countsParam = Object.values(categoryCounts).join(',')
    
    // Open in new tab
    const createGameUrl = `/create-game?categories=${categoriesParam}&counts=${countsParam}`
    window.open(createGameUrl, '_blank')
  }

  // Get unique categories from non-deselected challenges only
  const availableChallenges = challenges.filter(challenge => !deselectedChallenges.has(challenge.id))
  const categories = [...new Set(availableChallenges.map(challenge => challenge.category))]

  // Show loading state
  if (loading) {
    return (
      <div className="challenge-list">
        <div className="challenge-list-content">
          <div className="challenge-list-header">
            <h1>Challenge List</h1>
          </div>
          <div className="loading-state">
            <p>Loading challenges...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="challenge-list">
        <div className="challenge-list-content">
          <div className="challenge-list-header">
            <h1>Challenge List</h1>
          </div>
          <div className="error-state">
            <p>{error}</p>
            <button 
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="challenge-list">
      <div className="challenge-list-content">
        <div className="challenge-list-header">
          <h1>Challenge List</h1>
        </div>

        {/* Challenges Table */}
        <div className="challenges-section panel-spacing">
          <div className="challenges-panel standard-panel">
            <div className="challenges-summary">
              <span className="summary-text">
                Showing {availableChallenges.length} active challenges across {categories.length} categories
                {deselectedChallenges.size > 0 && (
                  <span> ({deselectedChallenges.size} deselected)</span>
                )}
              </span>
            </div>
            <ChallengesTable
              challenges={challenges}
              deselectedChallenges={deselectedChallenges}
              onToggleChallenge={toggleChallengeSelection}
              onShowRules={openRulesModal}
            />
          </div>
        </div>

        {/* Create Game Section */}
        <div className="create-game-section panel-spacing">
          <div className="create-game-panel standard-panel">
            <button 
              className="btn btn-primary btn-large"
              onClick={createGame}
              disabled={availableChallenges.length === 0}
            >
              Create Game
            </button>
          </div>
        </div>
      </div>

      {/* Rules Modal */}
      {modalOpen && <RulesModal challenge={selectedChallenge} onClose={closeRulesModal} />}
    </div>
  )
}

export default ChallengeList
