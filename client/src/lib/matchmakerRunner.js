// Solve a schedule in a Web Worker, or on the page itself if this browser
// can't start one (the page then freezes while it solves, as it used to)
import { solveSchedule } from './matchmakerSolver'

let worker = null
let workerBroken = false
let nextId = 0

function onPage(args) {
  // Let the "Solving…" state paint before the solver blocks the thread
  return new Promise(resolve => setTimeout(() => resolve(solveSchedule(args)), 30))
}

export function runSolveSchedule(args) {
  if (!workerBroken && !worker && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./matchmakerWorker.js', import.meta.url), { type: 'module' })
    } catch {
      workerBroken = true
    }
  }
  if (workerBroken || !worker) return onPage(args)

  const id = ++nextId
  return new Promise(resolve => {
    const done = () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
    }
    const onMessage = (e) => {
      if (e.data.id !== id) return
      done()
      resolve(e.data.result)
    }
    // The worker failed to load or crashed: solve on the page from now on
    const onError = () => {
      done()
      worker.terminate()
      worker = null
      workerBroken = true
      onPage(args).then(resolve)
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    worker.postMessage({ id, args })
  })
}
