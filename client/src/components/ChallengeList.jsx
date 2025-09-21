import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import './ChallengeList.css'

function ChallengeList() {
  const [searchParams] = useSearchParams()
  const [allChallenges, setAllChallenges] = useState([])
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedChallenge, setSelectedChallenge] = useState(null)

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
          // Sort by category first, then by ID within each category
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
  }, [allChallenges, searchParams])

  const openRulesModal = (challenge) => {
    setSelectedChallenge(challenge)
    setModalOpen(true)
  }

  const closeRulesModal = () => {
    setModalOpen(false)
    setSelectedChallenge(null)
  }

  const createGame = () => {
    // Calculate categories and their counts
    const categoryCounts = {}
    challenges.forEach(challenge => {
      categoryCounts[challenge.category] = (categoryCounts[challenge.category] || 0) + 1
    })
    
    // Create URL parameters
    const categoriesParam = Object.keys(categoryCounts).join(',')
    const countsParam = Object.values(categoryCounts).join(',')
    
    // Open in new tab
    const createGameUrl = `/create-game?categories=${categoriesParam}&counts=${countsParam}`
    window.open(createGameUrl, '_blank')
  }

  // Get unique categories from challenges
  const categories = [...new Set(challenges.map(challenge => challenge.category))]

  // Show loading state
  if (loading) {
    return (
      <div className="challenge-list">
        <div className="challenge-list-content">
          <div className="challenge-list-header">
            <h1>Selected Challenges</h1>
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
            <h1>Selected Challenges</h1>
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
          <h1>Selected Challenges</h1>
        </div>

        {/* Challenges Table */}
        <div className="challenges-section">
          <div className="challenges-panel">
            <h3>Your Challenge List ({challenges.length})</h3>
            <div className="challenges-summary">
              <span className="summary-text">
                Showing {challenges.length} challenges across {categories.length} categories
              </span>
            </div>
            <div className="challenges-table-container">
              <table className="challenges-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Challenge Name</th>
                    <th>Requirements</th>
                    <th>Rules</th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.map(challenge => (
                    <tr key={challenge.id}>
                      <td className="challenge-category">{challenge.category}</td>
                      <td className="challenge-name">{challenge.challengeName}</td>
                      <td className="challenge-requirements">{challenge.requirements}</td>
                      <td className="challenge-rules">
                        <a 
                          href="#"
                          className="rules-link"
                          onClick={(e) => {
                            e.preventDefault()
                            openRulesModal(challenge)
                          }}
                        >
                          Show Rules
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Create Game Section */}
        <div className="create-game-section">
          <div className="create-game-panel">
            <div className="create-game-content">
              <h3>Ready to Start Your Game?</h3>
              <p>Create a new game with your selected {challenges.length} challenges.</p>
              <button 
                className="btn btn-primary btn-large"
                onClick={createGame}
              >
                Create Game
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Rules Modal */}
      {modalOpen && selectedChallenge && (
        <div className="rules-modal-overlay" onClick={closeRulesModal}>
          <div className="rules-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="rules-modal-header">
              <h3>{selectedChallenge.challengeName}</h3>
              <button className="modal-close-btn" onClick={closeRulesModal}>
                ×
              </button>
            </div>
            <div className="rules-modal-body">
              <div className="challenge-info">
                <p><strong>Category:</strong> {selectedChallenge.category}</p>
                <p><strong>Requirements:</strong> {selectedChallenge.requirements}</p>
              </div>
              <div className="rules-content">
                <h4>Rules</h4>
                <p>{selectedChallenge.rules}</p>
              </div>
            </div>
            <div className="rules-modal-footer">
              <button className="btn btn-primary" onClick={closeRulesModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChallengeList
