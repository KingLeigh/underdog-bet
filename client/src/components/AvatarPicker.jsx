import React from 'react'
import Avatar from './Avatar'
import { AVATARS } from '../lib/avatars'
import './Avatar.css'

// Grid of every avatar. `taken` maps an avatar id to the name of the player
// holding it; those can't be picked.
function AvatarPicker({ value, onChange, taken = new Map(), label = 'Pick your avatar' }) {
  return (
    <div className="avatar-picker-wrap">
      {label && <div className="avatar-picker-label">{label}</div>}
      <div className="avatar-picker" role="radiogroup" aria-label={label || 'Avatar'}>
        {AVATARS.map(a => {
          const holder = taken.get(a.id)
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={value === a.id}
              aria-label={holder ? `${a.id} (taken by ${holder})` : a.id}
              title={holder ? `Taken by ${holder}` : undefined}
              className={`avatar-option ${value === a.id ? 'picked' : ''}`}
              disabled={!!holder}
              onClick={() => onChange(a.id)}
            >
              <Avatar avatar={a} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Avatars held by a game's players other than `self`, as AvatarPicker's
// `taken` map
export function takenBy(game, self) {
  const taken = new Map()
  if (!game) return taken
  for (const pid of game.players || []) {
    const id = game.playerAvatars && game.playerAvatars[pid]
    if (pid !== self && id) taken.set(id, game.playerNames[pid] || 'another player')
  }
  return taken
}

// A random avatar nobody holds yet (null if all are held)
export function freeAvatar(taken) {
  const free = AVATARS.filter(a => !taken.has(a.id))
  return free.length ? free[Math.floor(Math.random() * free.length)].id : null
}

export default AvatarPicker
