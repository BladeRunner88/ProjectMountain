// S9.6b convention #2: "ONE NODE LANGUAGE, EVERYWHERE." 9.6's associates
// chart established the visual grammar for a node/edge rendering; every
// other one in the Control Room (9.8's dependency map, 9.12's source
// dependency view) and the main Graph reads from this one place, so two
// surfaces can never draw the same relationship in different colours.
//
//   NODE COLOUR   blue = nominal · red = anomaly · amber RING = watch
//                 (watch is a ring around a nominal-coloured node, not a
//                 third fill colour — it says "otherwise fine, but flagged"
//                 rather than putting it visually on par with anomaly)
//   EDGE COLOUR   follows the node it connects to
//   SOLID edge    a present, current relationship
//   DASHED edge   a verified past or structural relationship
//   NODE SIZE     by association strength or tier, never aesthetics —
//                 each consumer supplies its own strength/tier scale, this
//                 file only fixes colour and dash, not size

import { ANOMALY, NOMINAL, WATCH } from './tokens'

export type NodeStatus = 'nominal' | 'watch' | 'anomaly'
export type EdgeRelationship = 'present' | 'past'

export interface NodeVisual {
  fill: string
  /** Non-null only for 'watch' — an amber ring drawn around the fill, never its own fill colour. */
  ring: string | null
}

export function nodeVisual(status: NodeStatus): NodeVisual {
  if (status === 'anomaly') return { fill: ANOMALY, ring: null }
  if (status === 'watch') return { fill: NOMINAL, ring: WATCH }
  return { fill: NOMINAL, ring: null }
}

/** A solid edge for a present/current relationship, dashed for a verified past or structural one. Returns the `strokeDasharray` value, or undefined for solid. */
export function edgeDashArray(relationship: EdgeRelationship): string | undefined {
  return relationship === 'past' ? '4 4' : undefined
}
