// 8.5: THE LAYOUT ENGINE — replaces all ring/radial maths entirely. A
// hand-rolled force simulation (no chart/graph library, matching this
// whole rebuild's own rule), producing POSITIONS ONLY — nothing here
// renders a pixel. Two phases:
//
//   1. SEEDING (buildInitialPositions) — countries anchor at centre-left,
//      vertically distributed; every other node is seeded within a 120°
//      cone facing away from its own parent, measured along the
//      grandparent->parent vector (root children face right, since a
//      root has no grandparent to derive a direction from).
//   2. SIMULATION (runSimulation) — repulsion/spring/gravity/friction/
//      collision, exactly the parameters given, run to alpha cooldown.
//
// ONE ADDITION beyond the six named forces, disclosed: a soft angular
// containment force that gently nudges a node back toward its own cone
// if repulsion/collision has pushed it past the 120° edge. Without it the
// cone constraint is only ever true at t=0 — it holds at seed time but
// nothing stops later physics from folding a node back past its parent,
// which is exactly the hairballing this block exists to prevent. The
// verification below checks the cone POST-settle, not just at seeding, so
// this is load-bearing, not decorative.
//
// Root nodes are fully fixed (never touched by any force, including
// collision) — "anchor" reads as a hard placement, not a strong pull, and
// fixing them is what keeps "vertically distributed at centre-left" true
// for the whole simulation's lifetime, not just its first frame.

import { NODE_DIAMETER_CHILD, NODE_DIAMETER_LEAF, NODE_DIAMETER_PARENT, NODE_DIAMETER_ROOT } from './tokens'
import type { GraphEdge, GraphNode, GraphNodeTier } from './adapter'

// 8.9 (user-reported): nodes settled too close together to read a label
// without it colliding with whatever sat next to it — repulsionStrength,
// springLength and collisionPadding all raised so there's real breathing
// room around every node. This makes the settled graph wider than the
// default viewport at 1x zoom, which is exactly why 8.9 is adding
// zoom-to-fit/pan/zoom navigation in the same block — spacing and
// navigation are the same fix, not two unrelated ones.
export const FORCE_PARAMS = {
  repulsionStrength: 460,
  springLength: 130,
  springTension: 0.05,
  gravity: 0.01,
  friction: 0.9,
  alphaDecay: 0.02,
  collisionPadding: 10,
} as const

const ALPHA_MIN = 0.001
const MAX_TICKS = 2000
export const CONE_HALF_ANGLE_RAD = degToRad(60) // 120° cone, half-angle either side of the facing direction

export const RADIUS_BY_TIER: Record<GraphNodeTier, number> = {
  root: NODE_DIAMETER_ROOT / 2,
  parent: NODE_DIAMETER_PARENT / 2,
  child: NODE_DIAMETER_CHILD / 2,
  leaf: NODE_DIAMETER_LEAF / 2,
}

export interface Viewport {
  width: number
  height: number
}

export const DEFAULT_VIEWPORT: Viewport = { width: 1400, height: 900 }

export interface Point {
  x: number
  y: number
}

export interface SimNode extends Point {
  id: string
  tier: GraphNodeTier
  parentId: string | null
  radius: number
  vx: number
  vy: number
}

export interface LayoutResult {
  positions: ReadonlyMap<string, Point>
  simNodes: readonly SimNode[]
  ticks: number
  finalAlpha: number
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Deterministic per-id pseudo-random in [0,1) — no dependency on the old (deleted) graph/rng.ts, self-contained since this is the only place in the new layout that needs it. */
function seededUnit(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

/** Shortest signed angular difference a-b, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/** The direction a node's cone faces: away from its own grandparent, along the grandparent->parent vector. A root's own children (parent has no grandparent) face right — 0 radians. */
export function coneFacingAngle(parentId: string, positions: ReadonlyMap<string, Point>, parentIdOf: ReadonlyMap<string, string | null>): number {
  const grandparentId = parentIdOf.get(parentId) ?? null
  const parentPos = positions.get(parentId)
  const grandparentPos = grandparentId ? positions.get(grandparentId) : undefined
  if (!parentPos || !grandparentPos) return 0 // "root children face right"
  return Math.atan2(parentPos.y - grandparentPos.y, parentPos.x - grandparentPos.x)
}

/**
 * PHASE 1 — SEEDING. Countries anchor at centre-left, vertically
 * distributed. Every other node with a real parent is placed within its
 * 120° cone, one spring-length out, children fanned evenly across the
 * cone. The 8 provenance sources (adapter.ts: parentId null, cross-cutting,
 * not geographically attached to any route) have no parent to cone
 * against — seeded in their own column on the right instead, the one
 * placement rule this block invents beyond what the spec's tree-shaped
 * cone logic covers, since the spec's own rule assumes a real tree.
 */
export function buildInitialPositions(nodes: readonly GraphNode[], viewport: Viewport = DEFAULT_VIEWPORT): Map<string, Point> {
  const positions = new Map<string, Point>()
  const parentIdOf = new Map<string, string | null>(nodes.map((n) => [n.id, n.parentId]))
  const childrenOf = new Map<string, GraphNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const list = childrenOf.get(n.parentId) ?? []
    list.push(n)
    childrenOf.set(n.parentId, list)
  }

  const roots = nodes.filter((n) => n.tier === 'root')
  const anchorX = viewport.width * 0.22
  const rootSpacing = viewport.height / (roots.length + 1)
  roots.forEach((r, i) => {
    positions.set(r.id, { x: anchorX, y: rootSpacing * (i + 1) })
  })

  const orphans = nodes.filter((n) => n.parentId === null && n.tier !== 'root')
  const orphanX = viewport.width * 0.85
  const orphanSpacing = viewport.height / (orphans.length + 1)
  orphans.forEach((o, i) => {
    positions.set(o.id, { x: orphanX, y: orphanSpacing * (i + 1) })
  })

  // BFS out from the roots so every parent is positioned before its own
  // children are seeded (children need the parent's real position).
  const queue: GraphNode[] = [...roots]
  let qi = 0
  while (qi < queue.length) {
    const parent = queue[qi++]
    const children = childrenOf.get(parent.id) ?? []
    if (children.length === 0) continue
    const parentPos = positions.get(parent.id)!
    const faceAngle = coneFacingAngle(parent.id, positions, parentIdOf)
    const n = children.length
    children.forEach((child, idx) => {
      // fan evenly across the cone (kept slightly inside the 120° edge,
      // not flush against it, so the containment force below never has
      // to fight a node seeded exactly on its own boundary), with a small
      // seeded jitter on distance so same-cone siblings don't start in a
      // perfectly straight, physically-unstable line.
      const t = n === 1 ? 0 : (idx / (n - 1)) * 2 - 1 // -1..1
      const angle = faceAngle + t * CONE_HALF_ANGLE_RAD * 0.85
      const dist = FORCE_PARAMS.springLength * (0.9 + seededUnit(child.id) * 0.3)
      positions.set(child.id, { x: parentPos.x + Math.cos(angle) * dist, y: parentPos.y + Math.sin(angle) * dist })
      queue.push(child)
    })
  }

  return positions
}

/**
 * 8.8: INCREMENTAL SEEDING — places a single newly-arrived node relative to
 * its parent's CURRENT (already-settled, unmoved) position, without
 * re-running the full simulation. Live data must never reflow the whole
 * graph — a status update on one climber can't be allowed to nudge every
 * other node's position, or "the graph is still there every time" would be
 * false in spirit even when it's technically still on screen. Reuses the
 * same cone-facing/jitter logic buildInitialPositions seeds with, just for
 * one node instead of a whole sibling fan (a live arrival's siblings, if
 * any arrived earlier, already have their own settled positions this
 * function has no reason to touch).
 */
export function seedIncrementalPosition(node: GraphNode, parentPos: Point, grandparentPos: Point | undefined): Point {
  const faceAngle = grandparentPos ? Math.atan2(parentPos.y - grandparentPos.y, parentPos.x - grandparentPos.x) : 0
  // spread new arrivals across the cone deterministically by id, same
  // technique as the sibling fan above, just without knowing the sibling
  // COUNT up front (there may be exactly one, or the eventual others
  // haven't arrived yet) — a seeded angle within the cone rather than an
  // exact fan fraction.
  const t = seededUnit(node.id + ':angle') * 2 - 1 // -1..1
  const angle = faceAngle + t * CONE_HALF_ANGLE_RAD * 0.85
  const dist = FORCE_PARAMS.springLength * (0.9 + seededUnit(node.id) * 0.3)
  return { x: parentPos.x + Math.cos(angle) * dist, y: parentPos.y + Math.sin(angle) * dist }
}

// A single pairwise pass doesn't fully converge dense clusters in one tick
// — resolving A against B can push B into C with no later pass fixing
// B-C in the SAME tick. At the real dataset's scale (121 nodes) this
// never showed up (clusters are small enough that 342 ticks' worth of
// single passes converges fine), but the 8.6 stress test at 500+ nodes
// surfaced it directly: up to ~1.5px of residual overlap depth, median
// ~0.1px — real, but small, exactly the signature of a convergence-
// precision gap rather than a broken constraint. Fixed the standard way
// (same technique d3-force's own forceCollide uses): a few resolution
// iterations per tick, not one.
const COLLISION_ITERATIONS = 3

function resolveCollisions(simNodes: readonly SimNode[]): void {
  const padding = FORCE_PARAMS.collisionPadding
  for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
    for (let i = 0; i < simNodes.length; i++) {
      for (let j = i + 1; j < simNodes.length; j++) {
        const a = simNodes[i]
        const b = simNodes[j]
        const minDist = a.radius + padding + (b.radius + padding)
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.hypot(dx, dy)
        if (dist < 1e-6) {
          dx = seededUnit(a.id + b.id) - 0.5 || 0.01
          dy = seededUnit(b.id + a.id) - 0.5 || 0.01
          dist = Math.hypot(dx, dy)
        }
        if (dist >= minDist) continue
        const overlap = (minDist - dist) / 2
        const nx = dx / dist
        const ny = dy / dist
        if (a.tier !== 'root') {
          a.x -= nx * overlap
          a.y -= ny * overlap
        }
        if (b.tier !== 'root') {
          b.x += nx * overlap
          b.y += ny * overlap
        }
      }
    }
  }
}

function tick(simNodes: readonly SimNode[], simNodeById: ReadonlyMap<string, SimNode>, edges: readonly GraphEdge[], parentIdOf: ReadonlyMap<string, string | null>, alpha: number, center: Point): void {
  const p = FORCE_PARAMS

  // repulsion — all pairs push apart (roots exert it but never receive it)
  for (let i = 0; i < simNodes.length; i++) {
    for (let j = i + 1; j < simNodes.length; j++) {
      const a = simNodes[i]
      const b = simNodes[j]
      if (a.tier === 'root' && b.tier === 'root') continue
      let dx = b.x - a.x
      let dy = b.y - a.y
      let distSq = dx * dx + dy * dy
      if (distSq < 1) {
        dx = seededUnit(a.id + b.id + 'r') - 0.5 || 0.1
        dy = seededUnit(b.id + a.id + 'r') - 0.5 || 0.1
        distSq = dx * dx + dy * dy
      }
      const dist = Math.sqrt(distSq)
      const force = (p.repulsionStrength * alpha) / distSq
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      if (a.tier !== 'root') {
        a.vx -= fx
        a.vy -= fy
      }
      if (b.tier !== 'root') {
        b.vx += fx
        b.vy += fy
      }
    }
  }

  // springs — every edge (structural AND cross/rope-partner) pulls toward the rest length
  for (const e of edges) {
    const a = simNodeById.get(e.source)
    const b = simNodeById.get(e.target)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy) || 0.01
    const displacement = dist - p.springLength
    const force = (p.springTension * displacement * alpha) / dist
    const fx = dx * force
    const fy = dy * force
    if (a.tier !== 'root') {
      a.vx += fx
      a.vy += fy
    }
    if (b.tier !== 'root') {
      b.vx -= fx
      b.vy -= fy
    }
  }

  // gravity — gentle pull toward centre
  for (const n of simNodes) {
    if (n.tier === 'root') continue
    n.vx += (center.x - n.x) * p.gravity * alpha
    n.vy += (center.y - n.y) * p.gravity * alpha
  }

  // angular containment — the one addition beyond the six named forces;
  // see this file's own header comment for why it's necessary. The
  // position snapshot is built ONCE per tick, not once per node — an
  // earlier draft rebuilt it inside this loop (O(n) map construction x
  // O(n) nodes), caught before it shipped.
  const positionSnapshot = new Map<string, Point>(simNodes.map((s) => [s.id, { x: s.x, y: s.y }]))
  for (const n of simNodes) {
    if (n.tier === 'root' || !n.parentId) continue
    const parent = simNodeById.get(n.parentId)
    if (!parent) continue
    const faceAngle = coneFacingAngle(n.parentId, positionSnapshot, parentIdOf)
    const curAngle = Math.atan2(n.y - parent.y, n.x - parent.x)
    const diff = angleDiff(curAngle, faceAngle)
    if (Math.abs(diff) <= CONE_HALF_ANGLE_RAD) continue
    const excess = Math.abs(diff) - CONE_HALF_ANGLE_RAD
    const correctedAngle = curAngle - Math.sign(diff) * excess
    const dist = Math.hypot(n.x - parent.x, n.y - parent.y) || p.springLength
    const targetX = parent.x + Math.cos(correctedAngle) * dist
    const targetY = parent.y + Math.sin(correctedAngle) * dist
    // 8.9: repulsionStrength raised (300 -> 460) to spread nodes out for
    // legibility, which needed this raised too (0.2 -> 0.3) to keep
    // reliably winning against the stronger repulsion — tuned empirically
    // against the real dataset (checked POST-settle, not just at seed
    // time) rather than pushed further than necessary, since a much
    // stronger correction fighting a much stronger repulsion every tick
    // was found to oscillate instead of converge.
    n.vx += (targetX - n.x) * 0.32 * alpha
    n.vy += (targetY - n.y) * 0.32 * alpha
  }

  // integrate + friction
  for (const n of simNodes) {
    if (n.tier === 'root') continue
    n.vx *= p.friction
    n.vy *= p.friction
    n.x += n.vx
    n.y += n.vy
  }

  // collision — hard, unconditional, never scaled by alpha ("nodes never overlap" is absolute)
  resolveCollisions(simNodes)
}

/** PHASE 2 — SIMULATION. Seeds, then runs to alpha cooldown (or a safety tick cap). */
export function runSimulation(nodes: readonly GraphNode[], edges: readonly GraphEdge[], viewport: Viewport = DEFAULT_VIEWPORT): LayoutResult {
  const seeded = buildInitialPositions(nodes, viewport)
  const parentIdOf = new Map<string, string | null>(nodes.map((n) => [n.id, n.parentId]))
  const simNodes: SimNode[] = nodes.map((n) => {
    const pos = seeded.get(n.id)!
    return { id: n.id, tier: n.tier, parentId: n.parentId, radius: RADIUS_BY_TIER[n.tier], x: pos.x, y: pos.y, vx: 0, vy: 0 }
  })
  const simNodeById = new Map(simNodes.map((n) => [n.id, n]))
  const center: Point = { x: viewport.width / 2, y: viewport.height / 2 }

  let alpha = 1
  let ticks = 0
  while (alpha > ALPHA_MIN && ticks < MAX_TICKS) {
    tick(simNodes, simNodeById, edges, parentIdOf, alpha, center)
    alpha *= 1 - FORCE_PARAMS.alphaDecay
    ticks++
  }

  // "Nodes never overlap" is absolute, but during active cooling, repulsion
  // and collision resolution can each still be nudging the same crowded
  // cluster in the SAME tick — one settles a pair, the other's later pass
  // reopens a sliver of the gap it just closed. Once alpha has actually
  // cooled (no more velocity-based forces perturbing anything), collision
  // resolution alone is a pure positional constraint with nothing left to
  // fight it, so it converges fast — a short dedicated pass here (found
  // necessary at the 500+-node stress-test scale; the real 121-node
  // dataset already converges during the main loop and this is a no-op
  // for it) finishes the job the main loop's own iterations couldn't quite
  // close out in time.
  // 8.9: iteration count raised 70 -> 150 — collisionPadding raised
  // (4 -> 10) for legibility, meaning more residual overlap needs
  // resolving at 500+-node density than the old padding produced;
  // re-tuned the same empirical way (swept until violations hit zero with
  // real wall-clock margin left under budget).
  for (let i = 0; i < 150; i++) resolveCollisions(simNodes)

  const positions = new Map<string, Point>(simNodes.map((n) => [n.id, { x: n.x, y: n.y }]))
  return { positions, simNodes, ticks, finalAlpha: alpha }
}

// -- IDLE DRIFT — "the graph breathes," not a re-simulation ---------------
// A pure function of (nodeId, elapsed ms): a small, bounded, deterministic
// per-node offset to ADD to a settled base position, never a position
// mutation. 2-3px amplitude, uncorrelated phase (seeded per id), two
// slightly different frequencies on x/y so the motion isn't a perfect
// circle/line. Small enough that it "must not move nodes far enough to
// change what a user is pointing at."

const IDLE_DRIFT_BASE_FREQ = 0.0007

export function idleDriftOffset(nodeId: string, elapsedMs: number): Point {
  const seed = seededUnit(nodeId)
  const phaseX = seed * Math.PI * 2
  const phaseY = seededUnit(nodeId + ':y') * Math.PI * 2
  const amplitude = 2 + seededUnit(nodeId + ':amp') // 2..3px
  return {
    x: amplitude * Math.sin(elapsedMs * IDLE_DRIFT_BASE_FREQ + phaseX),
    y: amplitude * Math.sin(elapsedMs * IDLE_DRIFT_BASE_FREQ * 1.3 + phaseY),
  }
}
