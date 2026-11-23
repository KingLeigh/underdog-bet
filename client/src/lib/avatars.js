// Stable playful avatar per player ID
export const AVATARS = ['🦁', '🦊', '🐻', '🐸', '🐙', '🦉', '🐯', '🐨', '🦄', '🐺', '🦅', '🐷']

export function avatarFor(pid) {
  let h = 0
  for (const c of String(pid)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATARS[h % AVATARS.length]
}
