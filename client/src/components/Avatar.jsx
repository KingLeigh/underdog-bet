import React from 'react'
import { useGame } from '../contexts/GameContext'
import { avatarFor } from '../lib/avatars'
import './Avatar.css'

// One avatar, drawn as its image when it has one, else its emoji. Sized by
// the surrounding font-size (an image is 1em square), so each screen sizes
// avatars the way it sizes text.
//
// Pass `avatar` (an entry from lib/avatars) directly, or `pid` to look the
// player up in the current game (or in `playerAvatars` where a page has no
// game of its own, like the Matchmaker).
function Avatar({ pid, avatar, playerAvatars }) {
  const { gameState } = useGame()
  const a = avatar || avatarFor(pid, playerAvatars || gameState?.playerAvatars)
  return a.image
    ? <img className="avatar-glyph avatar-img" src={a.image} alt="" draggable="false" />
    : <span className="avatar-glyph" aria-hidden="true">{a.emoji}</span>
}

export default Avatar
