// Runs the Matchmaker's solver off the main thread, so the page stays live
// (and can animate) while a schedule is found
import { solveSchedule } from './matchmakerSolver'

self.onmessage = (e) => {
  const { id, args } = e.data
  self.postMessage({ id, result: solveSchedule(args) })
}
