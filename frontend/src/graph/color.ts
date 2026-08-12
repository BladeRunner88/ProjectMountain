// S8.5: COLOUR BY BRANCH, NOT BY TIER. A node inherits its country's hue;
// lightness increases with depth (terminals glow brighter than the core);
// saturation drops slightly at the extremities (the outer spray recedes).
// Anomaly overrides hue entirely — a fixed red, regardless of branch.

import { isDomainEntity, isEnvironmentNode } from './domain'
import { ANOMALY_RED, COUNTRY_COLOR, ENVIRONMENT_TEAL, UNKNOWN_BRANCH_GREY } from './tokens'
import type { DomainDataset, DomainEntity, EntityTier, GraphNode } from './domain'
import type { GraphId } from './types'

const TIER_DEPTH: Record<EntityTier, number> = { country: 0, region: 1, route: 2, operator: 3, sensor: 3, climber: 4 }
const SUBNODE_DEPTH = 5

// index = depth (0..5, country..sub-node)
const LIGHTNESS_BY_DEPTH = [45, 51, 57, 62, 68, 78]
const SATURATION_BY_DEPTH = [75, 72, 69, 65, 62, 55]

function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

/** The "1px darker ring" entities carry (S8.5) — sub-nodes never call this, they have no ring. */
export function darkenColor(color: string): string {
  const hslMatch = /^hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/.exec(color)
  if (hslMatch) {
    const [, h, s, l] = hslMatch
    const newL = Math.max(0, parseFloat(l) - 16)
    return `hsl(${h}, ${s}%, ${newL}%)`
  }
  const hex = color.replace('#', '')
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 45)
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 45)
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 45)
  return `rgb(${r}, ${g}, ${b})`
}

export interface ColorResolver {
  colorFor(id: GraphId): string
  /** S8.5N: the country-hued colour this node would carry IGNORING anomaly status — colorFor() always returns ANOMALY_RED immediately for an anomalous entity, which is exactly right for its own fill, but the bud animation needs the "arrives normal" colour to animate FROM before the node later, separately, turns red. */
  normalColorFor(id: GraphId): string
  glowFor(id: GraphId): boolean
}

/** Built once per dataset (the country -> hue table never changes within a session); returns a fast per-node lookup. */
export function buildColorResolver(dataset: DomainDataset): ColorResolver {
  const countryHueById = new Map<GraphId, number>()
  for (const c of dataset.domainEntities) {
    if (c.tier !== 'country') continue
    countryHueById.set(c.id, hexToHue(COUNTRY_COLOR[c.label] ?? UNKNOWN_BRANCH_GREY))
  }
  const byId = new Map<GraphId, GraphNode>(dataset.entities.map((e) => [e.id, e]))

  function hueColorFor(node: DomainEntity): string {
    const hue = countryHueById.get(node.countryId) ?? 0
    const depth = TIER_DEPTH[node.tier]
    return `hsl(${hue.toFixed(1)}, ${SATURATION_BY_DEPTH[depth]}%, ${LIGHTNESS_BY_DEPTH[depth]}%)`
  }

  function colorFor(id: GraphId): string {
    const node = byId.get(id)
    if (!node) return UNKNOWN_BRANCH_GREY
    if (isDomainEntity(node)) {
      if (node.status === 'anomaly') return ANOMALY_RED
      return hueColorFor(node)
    }
    // S8.4b: "it ignores the country hue — an environment node is about the
    // mountain, not the flag." Teal nominal, red on any breach — never a
    // branch colour.
    if (isEnvironmentNode(node)) return node.breached ? ANOMALY_RED : ENVIRONMENT_TEAL
    if (node.status === 'alert') return ANOMALY_RED
    const parent = byId.get(node.parentId)
    const countryId = parent && isDomainEntity(parent) ? parent.countryId : null
    const hue = countryId ? (countryHueById.get(countryId) ?? 0) : 0
    return `hsl(${hue.toFixed(1)}, ${SATURATION_BY_DEPTH[SUBNODE_DEPTH]}%, ${LIGHTNESS_BY_DEPTH[SUBNODE_DEPTH]}%)`
  }

  function normalColorFor(id: GraphId): string {
    const node = byId.get(id)
    if (!node) return UNKNOWN_BRANCH_GREY
    if (isDomainEntity(node)) return hueColorFor(node)
    if (isEnvironmentNode(node)) return ENVIRONMENT_TEAL
    return colorFor(id)
  }

  function glowFor(id: GraphId): boolean {
    const node = byId.get(id)
    if (!node) return false
    if (isDomainEntity(node)) return node.status === 'anomaly'
    if (isEnvironmentNode(node)) return node.breached
    return node.status === 'alert'
  }

  return { colorFor, normalColorFor, glowFor }
}
