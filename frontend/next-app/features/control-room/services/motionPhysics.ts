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

  setTarget(target: number): void {
    this.target = target
  }

  addVelocity(delta: number): void {
    this.velocity += delta
  }

  jumpTo(value: number): void {
    this.value = value
    this.target = value
    this.velocity = 0
  }

  isSettled(epsilon = 0.01): boolean {
    return Math.abs(this.target - this.value) < epsilon && Math.abs(this.velocity) < epsilon
  }

  step(dt: number): void {
    const angularFrequency = (2 * Math.PI) / this.config.response
    const stiffness = angularFrequency * angularFrequency
    const damping = 2 * this.config.dampingRatio * angularFrequency
    const acceleration = -stiffness * (this.value - this.target) - damping * this.velocity
    this.velocity += acceleration * dt
    this.value += this.velocity * dt
  }
}

export const SPRING_SETTLE: SpringConfig = { response: 0.3, dampingRatio: 1.0 }

export function driveSprings(springs: Spring[], onFrame: () => void, isActive: () => boolean): () => void {
  let raf = 0
  let last = performance.now()
  function tick(now: number): void {
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    if (isActive()) {
      for (const s of springs) s.step(dt)
      onFrame()
    }
    const anyUnsettled = springs.some((s) => !s.isSettled())
    if (anyUnsettled || isActive()) {
      raf = requestAnimationFrame(tick)
    } else {
      raf = 0
    }
  }
  raf = requestAnimationFrame((n) => {
    last = n
    tick(n)
  })
  return (): void => {
    if (raf) cancelAnimationFrame(raf)
  }
}
