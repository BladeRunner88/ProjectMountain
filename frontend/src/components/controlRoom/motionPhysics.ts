// S9.1h: the one place direct-manipulation physics live — the Detection
// Map's canvas pan/zoom and the custom threshold/weight sliders both use
// this (9.9's own Map spec says so explicitly: "All canvas interaction
// follows 9.1h"). A single rAF-driven critically-damped spring plus one
// rubber-band curve, reused rather than re-derived per surface.

/**
 * iOS-style rubber band: a value past [min, max] still moves with the
 * pointer, but with progressively increasing resistance — never a hard
 * stop (which reads as frozen) and never unlimited travel (which reads as
 * broken). `resistance` in (0, 1]; lower = stiffer.
 */
export function rubberBand(value: number, min: number, max: number, resistance = 0.55, dimension = 200): number {
  if (value < min) {
    const overshoot = min - value
    return min - (overshoot * resistance * dimension) / (dimension + resistance * overshoot)
  }
  if (value > max) {
    const overshoot = value - max
    return max + (overshoot * resistance * dimension) / (dimension + resistance * overshoot)
  }
  return value
}

export interface SpringConfig {
  /** Seconds to (imperceptibly) settle — SwiftUI's `response`. */
  response: number
  /** 1.0 = critically damped, no bounce. */
  dampingRatio: number
}

/**
 * A single-value critically-damped spring, advanced by an external rAF
 * loop (callers own the loop so several springs can share one frame tick).
 * Semi-implicit Euler on `acceleration = -k(x - target) - c*v` — cheap,
 * stable at any reasonable dt, and exactly reproduces "no bounce" when
 * dampingRatio is 1.
 */
export class Spring {
  value: number
  velocity = 0
  target: number
  private config: SpringConfig

  constructor(initial: number, config: SpringConfig) {
    this.value = initial
    this.target = initial
    this.config = config
  }

  setTarget(target: number) {
    this.target = target
  }

  /** Interrupts mid-settle without a jump — the spring already starts from `value`, this only injects a release velocity (e.g. a flick) on top of whatever it's currently doing. */
  addVelocity(delta: number) {
    this.velocity += delta
  }

  /** Snaps both value and target with zero velocity — for programmatic resets (RESET VIEW), never for interrupting a live gesture. */
  jumpTo(value: number) {
    this.value = value
    this.target = value
    this.velocity = 0
  }

  isSettled(epsilon = 0.01): boolean {
    return Math.abs(this.target - this.value) < epsilon && Math.abs(this.velocity) < epsilon
  }

  step(dt: number) {
    const angularFrequency = (2 * Math.PI) / this.config.response
    const stiffness = angularFrequency * angularFrequency
    const damping = 2 * this.config.dampingRatio * angularFrequency
    const acceleration = -stiffness * (this.value - this.target) - damping * this.velocity
    this.velocity += acceleration * dt
    this.value += this.velocity * dt
  }
}

export const SPRING_SETTLE: SpringConfig = { response: 0.3, dampingRatio: 1.0 }

/**
 * Runs a rAF loop stepping every spring in `springs` while any of them
 * hasn't settled, calling `onFrame` after each step so the caller can push
 * the new values into React state/DOM. Stops itself once everything is
 * settled — no timer runs while the UI is idle. `active` lets a caller
 * (e.g. "user is actively dragging, don't fight their input") suppress
 * stepping without tearing the loop down.
 */
export function driveSprings(springs: Spring[], onFrame: () => void, isActive: () => boolean): () => void {
  let raf = 0
  let last = performance.now()
  function tick(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    if (isActive()) {
      for (const s of springs) s.step(dt)
      onFrame()
    }
    const anySettled = springs.some((s) => !s.isSettled())
    if (anySettled || isActive()) {
      raf = requestAnimationFrame(tick)
    } else {
      raf = 0
    }
  }
  raf = requestAnimationFrame((n) => {
    last = n
    tick(n)
  })
  return () => {
    if (raf) cancelAnimationFrame(raf)
  }
}
