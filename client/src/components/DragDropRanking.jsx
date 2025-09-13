import React, { useState, useEffect, useRef } from 'react'
import Sortable from 'sortablejs'
import './DragDropRanking.css'

function DragDropRanking({ categories, onSubmit, onCancel }) {
  const [rankedCategories, setRankedCategories] = useState([])
  const sortableRef = useRef(null)
  const sortableInstance = useRef(null)

  // Initialize categories with random order
  useEffect(() => {
    if (categories && categories.length > 0) {
      // Create a shuffled copy of categories
      const shuffledCategories = [...categories].sort(() => Math.random() - 0.5)
      
      setRankedCategories(shuffledCategories.map((category, index) => ({
        id: category,
        name: category,
        rank: index + 1
      })))
    }
  }, [categories])

  // Initialize SortableJS when component mounts and categories are loaded
  useEffect(() => {
    if (sortableRef.current && rankedCategories.length > 0) {
      // Destroy existing sortable instance if it exists
      if (sortableInstance.current) {
        sortableInstance.current.destroy()
      }

      // Create new sortable instance
      sortableInstance.current = Sortable.create(sortableRef.current, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        onEnd: (evt) => {
          const { oldIndex, newIndex } = evt
          if (oldIndex !== newIndex) {
            // Update the ranked categories array
            setRankedCategories(prevCategories => {
              const newCategories = [...prevCategories]
              const [movedItem] = newCategories.splice(oldIndex, 1)
              newCategories.splice(newIndex, 0, movedItem)
              
              // Update rank numbers
              return newCategories.map((item, index) => ({
                ...item,
                rank: index + 1
              }))
            })
          }
        }
      })
    }

    // Cleanup function
    return () => {
      if (sortableInstance.current) {
        sortableInstance.current.destroy()
        sortableInstance.current = null
      }
    }
  }, [rankedCategories.length])

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Convert to the expected format: { category: rank }
    const rankings = {}
    rankedCategories.forEach(item => {
      rankings[item.name] = item.rank
    })
    
    onSubmit(rankings)
  }

  // Shuffle categories randomly
  const shuffleCategories = () => {
    const shuffled = [...rankedCategories].sort(() => Math.random() - 0.5)
    const updatedShuffled = shuffled.map((item, index) => ({
      ...item,
      rank: index + 1
    }))
    setRankedCategories(updatedShuffled)
  }

  if (!categories || categories.length === 0) {
    return null
  }

  return (
    <div className="drag-drop-ranking">
      <div className="ranking-header">
        <h3>Rank Your Categories</h3>
        <p>Use the shuffle button to randomize the order. Rank 1 is your strongest, {categories.length} is your weakest.</p>
        <button 
          type="button" 
          className="btn btn-secondary shuffle-btn"
          onClick={shuffleCategories}
        >
          🔀 Shuffle Order
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="ranking-form">
        <div className="categories-list" ref={sortableRef}>
          {rankedCategories.map((item, index) => (
            <div
              key={item.id}
              className="category-item"
              data-id={item.id}
            >
              <div className="rank-number">#{item.rank}</div>
              <div className="category-content">
                <span className="category-name">{item.name}</span>
              </div>
            </div>
          ))}
        </div>
        
        <div className="ranking-actions">
          <button type="submit" className="btn btn-primary">
            Submit Rankings
          </button>
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export default DragDropRanking
