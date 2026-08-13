import type { CSSProperties, ReactElement } from 'react'

import { ANOMALY, NOMINAL, WATCH } from '@/features/ase/tokens'

import type { NodeStatus } from '../types/domain'

export const GRAPH_CANVAS_COLOR = '#0B0E12'
export const TEAM_NODE_FILL = '#151A21'
export const TEAM_NODE_STROKE = 'rgba(233,237,242,0.35)'
export const CLIMBER_NORMAL_COLOR = NOMINAL
export const ANOMALY_COLOR = ANOMALY
export const WATCH_COLOR = WATCH

export const STRUCTURAL_FILL = '#2A2F38'
export const STRUCTURAL_STROKE = TEAM_NODE_STROKE
export const WATCH_STROKE = WATCH_COLOR

function structuralAppearance(status: NodeStatus): {
  fill: string
  stroke: string
  strokeWidth: number
  halo: boolean
} {
  if (status === 'anomaly') return { fill: ANOMALY_COLOR, stroke: STRUCTURAL_STROKE, strokeWidth: 1, halo: true }
  if (status === 'watch') return { fill: STRUCTURAL_FILL, stroke: WATCH_STROKE, strokeWidth: 1.5, halo: false }
  return { fill: STRUCTURAL_FILL, stroke: STRUCTURAL_STROKE, strokeWidth: 1, halo: false }
}

export type EdgeColorKind = 'grey' | 'blue' | 'red'

export const EDGE_APPEARANCE: Record<
  EdgeColorKind,
  { color: string; width: number; opacity: number; pulse: boolean }
> = {
  grey: { color: '#6E7480', width: 1, opacity: 0.4, pulse: false },
  blue: { color: CLIMBER_NORMAL_COLOR, width: 1.5, opacity: 1, pulse: false },
  red: { color: ANOMALY_COLOR, width: 2, opacity: 1, pulse: true },
}

export const WEATHER_EDGE_DASH = '6 5'

export function MajorNodeShape({
  x,
  y,
  size = 34,
  label,
  status = 'nominal',
  isMajor = false,
}: {
  x: number
  y: number
  size?: number
  label?: string
  status?: NodeStatus
  isMajor?: boolean
}): ReactElement {
  const { fill, stroke, strokeWidth, halo } = structuralAppearance(status)
  return (
    <g>
      {halo && <circle cx={x} cy={y} r={size * 0.85} fill={ANOMALY_COLOR} opacity={0.16} />}
      <rect
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        rx={4}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {label && (
        <text
          x={x}
          y={y + size / 2 + 16}
          textAnchor="middle"
          fontSize={10}
          className="font-mono"
          letterSpacing="0.05em"
          fill="rgba(233,237,242,0.55)"
        >
          {label.toUpperCase()}
        </text>
      )}
      {isMajor && (
        <text
          x={x}
          y={y + size / 2 + (label ? 30 : 16)}
          textAnchor="middle"
          fontSize={8}
          className="font-mono"
          letterSpacing="0.08em"
          fill="rgba(233,237,242,0.4)"
        >
          MAJOR
        </text>
      )}
    </g>
  )
}

export function SubNodeShape({
  x,
  y,
  radius = 7,
  anomaly = false,
  selected = false,
}: {
  x: number
  y: number
  radius?: number
  anomaly?: boolean
  selected?: boolean
}): ReactElement {
  return (
    <g>
      {anomaly && <circle cx={x} cy={y} r={radius * 2.4} fill={ANOMALY_COLOR} opacity={0.16} />}
      <circle cx={x} cy={y} r={radius} fill={anomaly ? ANOMALY_COLOR : CLIMBER_NORMAL_COLOR} />
      {selected && <circle cx={x} cy={y} r={radius + 3} fill="none" stroke="#FFFFFF" strokeWidth={2} />}
    </g>
  )
}

export function CompanyNodeShape({
  x,
  y,
  size = 14,
  status,
  selected = false,
}: {
  x: number
  y: number
  size?: number
  status: NodeStatus
  selected?: boolean
}): ReactElement {
  const radius = size / 2
  const { fill, stroke, strokeWidth, halo } = structuralAppearance(status)
  return (
    <g>
      {halo && <circle cx={x} cy={y} r={radius * 2.4} fill={ANOMALY_COLOR} opacity={0.16} />}
      <circle cx={x} cy={y} r={radius} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      {selected && <circle cx={x} cy={y} r={radius + 3} fill="none" stroke="#FFFFFF" strokeWidth={2} />}
    </g>
  )
}

export function EnvironmentNodeShape({
  x,
  y,
  size = 20,
  status,
  selected = false,
}: {
  x: number
  y: number
  size?: number
  status: NodeStatus
  selected?: boolean
}): ReactElement {
  const half = size / 2
  const fill = status === 'anomaly' ? ANOMALY_COLOR : status === 'watch' ? WATCH_COLOR : STRUCTURAL_FILL
  const points = `${x},${y - half} ${x + half},${y} ${x},${y + half} ${x - half},${y}`
  return (
    <g>
      <polygon points={points} fill={fill} stroke={STRUCTURAL_STROKE} strokeWidth={1} />
      {selected && (
        <polygon
          points={`${x},${y - half - 4} ${x + half + 4},${y} ${x},${y + half + 4} ${x - half - 4},${y}`}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2}
        />
      )}
    </g>
  )
}

export function EdgeLine({
  x1,
  y1,
  x2,
  y2,
  colorKind,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  colorKind: EdgeColorKind
}): ReactElement {
  const style = EDGE_APPEARANCE[colorKind]
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={style.color}
      strokeWidth={style.width}
      opacity={style.pulse ? undefined : style.opacity}
      style={style.pulse ? ({ '--pulse-peak': style.opacity } as CSSProperties) : undefined}
      className={style.pulse ? 'demo-edge-pulse' : undefined}
    />
  )
}
