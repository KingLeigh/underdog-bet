// Player avatars. Each entry has an id (what the server stores, per game, in
// game.playerAvatars) and an emoji. Add `"image": "/avatars/<id>.png"` to
// an entry in avatars.json (file under client/public) and every screen
// shows the image in its place: see components/Avatar.jsx.
import LIST from './avatars.json'

export const AVATARS = LIST

const BY_ID = new Map(LIST.map(a => [a.id, a]))

export const avatarById = (id) => BY_ID.get(id) || null

// A player's avatar: their pick, or for a game from before picking existed,
// a stable one derived from the player ID
export function avatarFor(pid, playerAvatars) {
  const picked = playerAvatars && avatarById(playerAvatars[pid])
  if (picked) return picked
  let h = 0
  for (const c of String(pid)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return LIST[h % LIST.length]
}
