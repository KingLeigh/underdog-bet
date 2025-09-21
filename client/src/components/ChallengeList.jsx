import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import './ChallengeList.css'

function ChallengeList() {
  const [searchParams] = useSearchParams()
  const [challenges, setChallenges] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedChallenge, setSelectedChallenge] = useState(null)

  // Demo data matching the Challenge Selector format
  const demoChallenges = [
    {
      id: 1,
      category: "Trivia (USA)",
      challengeName: "Name State Capitals",
      requirements: "Timer",
      rules: "Each player takes it in turns to name a US state capital. Whichever players' turn it is when 60 seconds is reached loses."
    },
    {
      id: 2,
      category: "Hand Eye Coordination",
      challengeName: "Tallest solo-cup stack",
      requirements: "Solo cups, Timer",
      rules: "Both players attempt to build the tallest tower using cups. Tallest stack after 60 seconds wins"
    },
    {
      id: 3,
      category: "Hand Eye Coordination",
      challengeName: "Flip cup race",
      requirements: "Solo cups",
      rules: "Both players attempt to flip cups at the same time. First to flip 10 cups wins."
    },
    {
      id: 4,
      category: "Cardio",
      challengeName: "Balloon burst race",
      requirements: "Balloons, Timer",
      rules: "Both players inflate a balloon at the same time. First balloon to burst wins"
    },
    {
      id: 5,
      category: "Brain Games",
      challengeName: "Spot It drag race",
      requirements: "Spot It cards, Timer",
      rules: "The Underdog has 45 seconds to match as many Spot It cards as possible. The Favorite then has 45 seconds to beat that number"
    },
    {
      id: 6,
      category: "Trivia (USA)",
      challengeName: "Presidential Facts",
      requirements: "Timer, Paper, Pen",
      rules: "Players take turns naming US presidents. First to make a mistake loses."
    },
    {
      id: 7,
      category: "Cardio",
      challengeName: "Jump rope endurance",
      requirements: "Jump rope, Timer",
      rules: "Both players jump rope simultaneously. Last one standing wins."
    },
    {
      id: 8,
      category: "Brain Games",
      challengeName: "Memory sequence",
      requirements: "Cards, Timer",
      rules: "Players memorize and repeat card sequences. Longest correct sequence wins."
    }
  ]

  useEffect(() => {
    // Parse challenge IDs from URL parameter
    const challengeIdsParam = searchParams.get('challenges')
    if (challengeIdsParam) {
      const challengeIds = challengeIdsParam.split(',').map(id => parseInt(id.trim()))
      const selectedChallenges = demoChallenges.filter(challenge => 
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
      setChallenges(demoChallenges)
    }
  }, [searchParams])

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
