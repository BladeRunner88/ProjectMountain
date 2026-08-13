import type { ReactElement } from 'react'

import { CompanyNodeShape, EdgeLine, GRAPH_CANVAS_COLOR, MajorNodeShape, SubNodeShape } from './shapes'

const COUNTRY = { x: 90, y: 24 }
const REGION = { x: 90, y: 70 }
const COMPANY = { x: 90, y: 116 }
const CLIMBER_OK = { x: 52, y: 164 }
const CLIMBER_ANOMALY = { x: 128, y: 164 }

export function LegendDiagram(): ReactElement {
  return (
    <svg
      viewBox="0 0 180 190"
      width="100%"
      height="100%"
      role="img"
      aria-label="Diagram showing country, region, company, and climber nodes linked by grey structural edges and blue/red climber edges"
    >
      <rect x={0} y={0} width={180} height={190} fill={GRAPH_CANVAS_COLOR} />
      <EdgeLine x1={COUNTRY.x} y1={COUNTRY.y} x2={REGION.x} y2={REGION.y} colorKind="grey" />
      <EdgeLine x1={REGION.x} y1={REGION.y} x2={COMPANY.x} y2={COMPANY.y} colorKind="grey" />
      <EdgeLine x1={COMPANY.x} y1={COMPANY.y} x2={CLIMBER_OK.x} y2={CLIMBER_OK.y} colorKind="blue" />
      <EdgeLine
        x1={COMPANY.x}
        y1={COMPANY.y}
        x2={CLIMBER_ANOMALY.x}
        y2={CLIMBER_ANOMALY.y}
        colorKind="red"
      />
      <MajorNodeShape x={COUNTRY.x} y={COUNTRY.y} size={16} label="Country" status="nominal" />
      <MajorNodeShape x={REGION.x} y={REGION.y} size={12} label="Region" status="nominal" />
      <CompanyNodeShape x={COMPANY.x} y={COMPANY.y} size={11} status="nominal" />
      <SubNodeShape x={CLIMBER_OK.x} y={CLIMBER_OK.y} />
      <SubNodeShape x={CLIMBER_ANOMALY.x} y={CLIMBER_ANOMALY.y} anomaly />
    </svg>
  )
}
