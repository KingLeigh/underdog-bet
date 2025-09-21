import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './ChallengeSelector.css'

function ChallengeSelector() {
  const navigate = useNavigate()
  
  // State for challenges data
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Filter and selection state
  const [selectedCategories, setSelectedCategories] = useState(new Set())
  const [selectedRequirements, setSelectedRequirements] = useState(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedChallenge, setSelectedChallenge] = useState(null)
  const [deselectedChallenges, setDeselectedChallenges] = useState(new Set())

  // Fetch challenges from server
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
        setChallenges(data)
        
        // Initialize filter selections with all available options
        const categories = [...new Set(data.map(challenge => challenge.category))]
        const allRequirements = data.flatMap(challenge => 
          challenge.requirements.split(',').map(req => req.trim())
        )
        const requirements = [...new Set(allRequirements)]
        
        setSelectedCategories(new Set(categories))
        setSelectedRequirements(new Set(requirements))
        
      } catch (err) {
        console.error('Error fetching challenges:', err)
        setError('Failed to load challenges. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchChallenges()
  }, [])

  // Get unique categories for filtering
  const categories = [...new Set(challenges.map(challenge => challenge.category))]
  
  // Get unique requirements for filtering (split comma-separated values)
  const allRequirements = challenges.flatMap(challenge => 
    challenge.requirements.split(',').map(req => req.trim()).filter(req => req !== '')
  )
  const requirements = [...new Set(allRequirements)]

  const toggleCategory = (category) => {
    const newSelected = new Set(selectedCategories)
    if (newSelected.has(category)) {
      newSelected.delete(category)
    } else {
      newSelected.add(category)
    }
    setSelectedCategories(newSelected)
  }

  const toggleRequirement = (requirement) => {
    const newSelected = new Set(selectedRequirements)
    if (newSelected.has(requirement)) {
      newSelected.delete(requirement)
    } else {
      newSelected.add(requirement)
    }
    setSelectedRequirements(newSelected)
  }

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

  const saveChallenges = () => {
    const selectedChallengeIds = availableChallenges.map(challenge => challenge.id)
    const challengeIdsParam = selectedChallengeIds.join(',')
    navigate(`/challenge-list?challenges=${challengeIdsParam}`)
  }

  const testMatchmaker = () => {
    // Calculate categories and their counts
    const categoryCounts = {}
    availableChallenges.forEach(challenge => {
      categoryCounts[challenge.category] = (categoryCounts[challenge.category] || 0) + 1
    })
    
    // Create URL parameters
    const categoriesParam = Object.keys(categoryCounts).join(',')
    const countsParam = Object.values(categoryCounts).join(',')
    
    // Open in new tab with unlocked fields
    const matchmakerUrl = `/matchmaker?categories=${categoriesParam}&counts=${countsParam}&unlocked=true`
    window.open(matchmakerUrl, '_blank')
  }

  // Filter challenges based on selected categories AND requirements
  const filteredChallenges = challenges.filter(challenge => {
    // Check category filter
    const categoryMatch = selectedCategories.size === 0 || selectedCategories.has(challenge.category)
    
    // Check requirements filter - challenge must have at least one selected requirement
    const challengeRequirements = challenge.requirements.split(',').map(req => req.trim())
    const requirementMatch = selectedRequirements.size === 0 || 
      challengeRequirements.some(req => selectedRequirements.has(req))
    
    return categoryMatch && requirementMatch
  }).sort((a, b) => {
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

  // Separate available challenges (not deselected) from all filtered challenges
  const availableChallenges = filteredChallenges.filter(challenge => !deselectedChallenges.has(challenge.id))
  
  // Get unique categories from available challenges only
  const availableCategories = [...new Set(availableChallenges.map(challenge => challenge.category))]

  // Show loading state
  if (loading) {
    return (
      <div className="challenge-selector">
        <div className="challenge-selector-content">
          <div className="challenge-selector-header">
            <h1>Challenge Selector</h1>
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
      <div className="challenge-selector">
        <div className="challenge-selector-content">
          <div className="challenge-selector-header">
            <h1>Challenge Selector</h1>
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
    <div className="challenge-selector">
      <div className="challenge-selector-content">
        <div className="challenge-selector-header">
          <h1>Challenge Selector</h1>
        </div>

        {/* Filter Section */}
        <div className="filter-section">
          <div className="filter-panel">
            <h3>Filter by Category</h3>
            <div className="category-filters">
              {categories.map(category => (
                <label key={category} className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(category)}
                    onChange={() => toggleCategory(category)}
                  />
                  <span className="checkbox-label">{category}</span>
                </label>
              ))}
            </div>
            <div className="filter-actions">
              <button 
                className="btn btn-secondary"
                onClick={() => setSelectedCategories(new Set())}
              >
                Clear All
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setSelectedCategories(new Set(categories))}
              >
                Select All
              </button>
            </div>
          </div>
        </div>

        {/* Requirements Filter Section */}
        <div className="filter-section">
          <div className="filter-panel">
            <h3>Filter by Requirements</h3>
            <div className="requirements-filters">
              {requirements.map(requirement => (
                <label key={requirement} className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedRequirements.has(requirement)}
                    onChange={() => toggleRequirement(requirement)}
                  />
                  <span className="checkbox-label">{requirement}</span>
                </label>
              ))}
            </div>
            <div className="filter-actions">
              <button 
                className="btn btn-secondary"
                onClick={() => setSelectedRequirements(new Set())}
              >
                Clear All
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setSelectedRequirements(new Set(requirements))}
              >
                Select All
              </button>
            </div>
          </div>
        </div>

        {/* Challenges Table */}
        <div className="challenges-section">
          <div className="challenges-panel">
            <h3>Active Challenges</h3>
            <div className="challenges-summary">
              <span className="summary-text">
                Showing {availableChallenges.length} challenges across {availableCategories.length} categories
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
                  {filteredChallenges.map(challenge => {
                    const isDeselected = deselectedChallenges.has(challenge.id)
                    return (
                      <tr 
                        key={challenge.id}
                        className={isDeselected ? 'deselected-row' : ''}
                        onClick={() => toggleChallengeSelection(challenge.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="challenge-category">{challenge.category}</td>
                        <td className="challenge-name">{challenge.challengeName}</td>
                        <td className="challenge-requirements">{challenge.requirements}</td>
                        <td className="challenge-rules">
                          <a 
                            href="#"
                            className="rules-link"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              openRulesModal(challenge)
                            }}
                          >
                            Show Rules
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Save Challenges Section */}
        <div className="save-section">
          <div className="save-panel">
            <div className="save-content">
              <div className="save-buttons">
                <button 
                  className="btn btn-primary btn-large"
                  onClick={saveChallenges}
                  disabled={availableChallenges.length === 0}
                >
                  Save Challenges
                </button>
                <button 
                  className="btn btn-secondary btn-large"
                  onClick={testMatchmaker}
                  disabled={availableChallenges.length === 0}
                >
                  Test Matchmaker
                </button>
              </div>
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

export default ChallengeSelector
