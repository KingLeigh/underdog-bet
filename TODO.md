# TODO

Work we'd like to address in follow-ups. Not in priority order.

## Features

- [ ] **Add a database layer** — server state is currently in-memory only (games are lost on restart). Likely SQLite (`better-sqlite3`) or a JSON snapshot/restore to start; also a home for challenge data so the game isn't coupled to the live Google Apps Script endpoint.
- [ ] **Add a "presentation" game state screen** — a display-oriented view of the game (scores, current contest) suitable for showing on a shared screen/TV during a party.
- [ ] **Extend sign-up window, so games can be planned in advance** — allow a game to be created and joined ahead of game night rather than only in a live lobby (depends on the database layer for games that outlive a server session).

## Code health (from the 2025-11 review)

- [x] **Correctness fixes** (done 2025-11-22): GameContext socket effect registers handlers once via reducer actions (stacked `connect` handlers and stale-closure races fixed); wager contestants identified by player ID (`wagerState.contestants`) instead of display-name matching; cross-game player-name collision in `getOrCreatePlayerID` fixed (name reconnection is now scoped to the game being joined); Matchmaker renders solver output and `?save=` data as React data instead of `dangerouslySetInnerHTML` (XSS vector removed); `wagerOptions` always `{ options, odds }`; simulation Cancel button fixed; a player's own bet now survives a page refresh (server replays their own choice on rejoin).
- [x] **Structure** (done 2025-11-22): server split into `server/lib/` modules (store, gameActions, challenges, sockets, routes) with a thin `index.js`; shared `RulesModal` + `ChallengesTable` components (and `shared/challenges.css`) replace the duplicated table/modal in ChallengeSelector and ChallengeList; the matchmaker solver is a pure module (`client/src/lib/matchmakerSolver.js`) and the share-URL encoding is `client/src/lib/matchmakerUrl.js` (the `url-generator.js` window global is gone); dead `.mobile-*`/utility CSS removed. Remaining CSS work is tracked under "CSS class-name collisions" below.
- [ ] **Tests**: add coverage for wager resolution/bounty math and the matchmaker solver — the two places where regressions silently corrupt scores. (The ad-hoc Socket.IO smoke script used during the 2025-11 cleanup would make a good starting point for server tests.)
- [ ] **CSS class-name collisions across pages**: all component CSS is bundled globally, and several pages define the same class names with different styles (`.form-group`, `.player-info`, `.player-name`, `.points-value`, `.category-name`, `.rank-number`, `.btn-large`, `.btn:disabled` in CategoryRanking.css, etc.) — which rules win currently depends on import order. Adopt CSS Modules (or per-page class prefixes) to scope page styles. CategoryRanking.css in particular is a leftover import in GameLobby that globally overrides `.btn:disabled`.
- [ ] **Move the matchmaker solver to a Web Worker** — `solveMatchmaking` can run up to its 10s timeout on the main thread and freezes the UI; it's now a pure module (`client/src/lib/matchmakerSolver.js`), so a worker wrapper is straightforward.
- [ ] **Server-side authorization for `startGame`** — only the client gates it today; any player in the game can emit `startGame` (and start before rankings are complete). Validate host + rankings server-side.
- [ ] **playerRegistry reverse lookup** — socket→player resolution is a linear scan of the registry on every event; maintain a `socketID → playerID` map alongside it.
- [ ] **Solver memoization is ineffective** — the memo key includes the accumulated gap cost and a serialized per-player category map, so hits are near zero while the map grows unboundedly during a solve. Rework the key (or drop the memo).
- [ ] Have the server send the bounty preview amount so the client doesn't duplicate the Min/Max/Average/Fixed math.
- [ ] **Restore the challenge data source** — the Google Apps Script URL (now in `server/.env`) returns HTTP 403 (deployment dead or permissions changed), so `/api/challenges` silently serves the 8 built-in demo challenges. Redeploy the Apps Script, or fold the challenge sheet into the repo/database.
