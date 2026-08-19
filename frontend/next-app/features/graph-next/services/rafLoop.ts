// S8.2 rule 4: ONE LOOP, IDEMPOTENT. Exactly one requestAnimationFrame
// handle. start() called while already running does nothing (asserted in
// dev, not silently ignored) — never a second loop stacked on top of the
// first. stop() cancels and fully clears, so a subsequent start() begins
// clean. Both safe under StrictMode's mount -> cleanup -> mount: that
// sequence is start() -> stop() -> start(), which is exactly the pattern
// this is built to handle correctly, not a special case.

import { IS_DEV } from "./env"

export interface RafLoop {
  start(): void
  stop(): void
  isRunning(): boolean
}

export function createRafLoop(onFrame: (nowMs: number) => void): RafLoop {
  let rafId: number | null = null
  let running = false

  function frame(now: number) {
    if (!running) return
    onFrame(now)
    rafId = requestAnimationFrame(frame)
  }

  function start() {
    if (running) {
      if (IS_DEV) {
        console.assert(
          false,
          "[graph] rafLoop.start() called while already running — a second loop must never stack on the first"
        )
      }
      return
    }
    running = true
    rafId = requestAnimationFrame(frame)
  }

  function stop() {
    running = false
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
  }

  return { start, stop, isRunning: () => running }
}
