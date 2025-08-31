import React, { useState, useRef, useEffect } from 'react'
import './DragDropRanking.css'

function DragDropRanking({ categories, onSubmit, onCancel }) {
  const [rankedCategories, setRankedCategories] = useState([])
  const [draggedItem, setDraggedItem] = useState(null)
  const [dragOverItem, setDragOverItem] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [touchStartY, setTouchStartY] = useState(0)
  const [touchStartItem, setTouchStartItem] = useState(null)

  // Initialize categories with default order
  useEffect(() => {
    if (categories && categories.length > 0) {
      setRankedCategories(categories.map((category, index) => ({
        id: category,
        name: category,
        rank: index + 1
      })))
    }
  }, [categories])

  // Handle mouse/touch events for drag start
  const handleDragStart = (e, item) => {
    setIsDragging(true)
    setDraggedItem(item)
    
    // Set drag image (optional)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/html', item.name)
    }
  }

  // Handle drag over
  const handleDragOver = (e, item) => {
    e.preventDefault()
    if (draggedItem && draggedItem.id !== item.id) {
      setDragOverItem(item)
    }
  }

  // Handle drop
  const handleDrop = (e, dropTarget) => {
    e.preventDefault()
    if (draggedItem && dropTarget && draggedItem.id !== dropTarget.id) {
      reorderItems(draggedItem, dropTarget)
    }
    setDraggedItem(null)
    setDragOverItem(null)
    setIsDragging(false)
  }

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverItem(null)
    setIsDragging(false)
  }

  // Touch event handlers for mobile
  const handleTouchStart = (e, item) => {
    e.preventDefault()
    setTouchStartY(e.touches[0].clientY)
    setTouchStartItem(item)
    setIsDragging(true)
    setDraggedItem(item)
  }

  const handleTouchMove = (e) => {
    if (!touchStartItem) return
    
    e.preventDefault()
    const touchY = e.touches[0].clientY
    const deltaY = touchY - touchStartY
    
    // Only process if there's significant movement
    if (Math.abs(deltaY) < 10) return
    
    // Find the item under the current touch position
    const touchElement = document.elementFromPoint(e.touches[0].clientX, touchY)
    const categoryItem = touchElement?.closest('.category-item')
    
    if (categoryItem) {
      const itemId = categoryItem.dataset.id
      const targetItem = rankedCategories.find(item => item.id === itemId)
      if (targetItem && targetItem.id !== touchStartItem.id) {
        setDragOverItem(targetItem)
      }
    }
  }

  const handleTouchEnd = (e) => {
    e.preventDefault()
    if (draggedItem && dragOverItem) {
      reorderItems(draggedItem, dragOverItem)
    }
    setDraggedItem(null)
    setDragOverItem(null)
    setIsDragging(false)
    setTouchStartItem(null)
  }

  // Reorder items
  const reorderItems = (draggedItem, dropTarget) => {
    const newRankedCategories = [...rankedCategories]
    const draggedIndex = newRankedCategories.findIndex(item => item.id === draggedItem.id)
    const targetIndex = newRankedCategories.findIndex(item => item.id === dropTarget.id)
    
    // Remove dragged item
    const [removed] = newRankedCategories.splice(draggedIndex, 1)
    
    // Insert at target position
    newRankedCategories.splice(targetIndex, 0, removed)
    
    // Update ranks
    newRankedCategories.forEach((item, index) => {
      item.rank = index + 1
    })
    
    setRankedCategories(newRankedCategories)
  }

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
    shuffled.forEach((item, index) => {
      item.rank = index + 1
    })
    setRankedCategories(shuffled)
  }

  if (!categories || categories.length === 0) {
    return null
  }

  return (
    <div className="drag-drop-ranking">
      <div className="ranking-header">
        <h3>Rank Your Categories</h3>
        <p>Drag and drop to reorder categories. Rank 1 is your strongest, {categories.length} is your weakest.</p>
        <button 
          type="button" 
          className="btn btn-secondary shuffle-btn"
          onClick={shuffleCategories}
        >
          🔀 Shuffle Order
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="ranking-form">
        <div className="categories-list">
          {rankedCategories.map((item, index) => (
            <div
              key={item.id}
              data-id={item.id}
              className={`category-item ${draggedItem?.id === item.id ? 'dragging' : ''} ${dragOverItem?.id === item.id ? 'drag-over' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, item)}
              onDragOver={(e) => handleDragOver(e, item)}
              onDrop={(e) => handleDrop(e, item)}
              onDragEnd={handleDragEnd}
              onTouchStart={(e) => handleTouchStart(e, item)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="drag-handle">⋮⋮</div>
              <div className="category-content">
                <span className="category-name">{item.name}</span>
                <span className="rank-badge">Rank {item.rank}</span>
              </div>
              <div className="rank-number">#{item.rank}</div>
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
