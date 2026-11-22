# TODO

Work we'd like to address in follow-ups. Not in priority order.

## Features

- [ ] **Add a database layer** — server state is currently in-memory only (games are lost on restart). Likely SQLite (`better-sqlite3`) or a JSON snapshot/restore to start; also a home for challenge data so the game isn't coupled to the live Google Apps Script endpoint.
- [ ] **Add a "presentation" game state screen** — a display-oriented view of the game (scores, current contest) suitable for showing on a shared screen/TV during a party.
- [ ] **Extend sign-up window, so games can be planned in advance** — allow a game to be created and joined ahead of game night rather than only in a live lobby (depends on the database layer for games that outlive a server session).

## Code health (from the 2025-11 review)

- [x] **Correctness fixes** (done 2025-11-22): GameContext socket effect registers handlers once via reducer actions (stacked `connect` handlers and stale-closure races fixed); wager contestants identified by player ID (`wagerState.contestants`) instead of display-name matching; cross-game player-name collision in `getOrCreatePlayerID` fixed (name reconnection is now scoped to the game being joined); Matchmaker renders solver output and `?save=` data as React data instead of `dangerouslySetInnerHTML` (XSS vector removed); `wagerOptions` always `{ options, odds }`; simulation Cancel button fixed; a player's own bet now survives a page refresh (server replays their own choice on rejoin).
- [ ] **Structure**: split `server/index.js` into modules (game store, wager engine, challenge source, socket handlers, REST routes); extract shared client components (rules modal, challenges table, ranking UI shared by GameLobby/ChallengeSelector/ChallengeList); consolidate duplicated CSS (`.btn`, `.standard-panel`, `.form-group`, modal styles) into a common stylesheet; make `url-generator.js` an imported module instead of a window global; extract the matchmaker solver into a pure module (unit-testable, movable to a Web Worker).
- [ ] **Tests**: add coverage for wager resolution/bounty math and the matchmaker solver — the two places where regressions silently corrupt scores.
- [ ] Have the server send the bounty preview amount so the client doesn't duplicate the Min/Max/Average/Fixed math.
- [ ] **Restore the challenge data source** — the Google Apps Script URL (now in `server/.env`) returns HTTP 403 (deployment dead or permissions changed), so `/api/challenges` silently serves the 8 built-in demo challenges. Redeploy the Apps Script, or fold the challenge sheet into the repo/database.
