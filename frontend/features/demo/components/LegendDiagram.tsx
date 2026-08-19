import type { ReactElement } from 'react'

import { CompanyNodeShape, EdgeLine, GRAPH_CANVAS_COLOR, MajorNodeShape, SubNodeShape } from './shapes'

const COUNTRY = { x: 90, y: 24 }
const PLANT = { x: 90, y: 70 }
const COMPANY = { x: 90, y: 116 }
const MACHINE_OK = { x: 52, y: 164 }
const MACHINE_ANOMALY = { x: 128, y: 164 }

export function LegendDiagram(): ReactElement {
  return (
    <svg
      viewBox="0 0 180 190"
      width="100%"
      height="100%"
      role="img"
      aria-label="Diagram showing country, plant, company, and machine nodes linked by grey structural edges and blue/red machine edges"
    >
      <rect x={0} y={0} width={180} height={190} fill={GRAPH_CANVAS_COLOR} />
      <EdgeLine x1={COUNTRY.x} y1={COUNTRY.y} x2={PLANT.x} y2={PLANT.y} colorKind="grey" />
      <EdgeLine x1={PLANT.x} y1={PLANT.y} x2={COMPANY.x} y2={COMPANY.y} colorKind="grey" />
      <EdgeLine x1={COMPANY.x} y1={COMPANY.y} x2={MACHINE_OK.x} y2={MACHINE_OK.y} colorKind="blue" />
      <EdgeLine
        x1={COMPANY.x}
        y1={COMPANY.y}
        x2={MACHINE_ANOMALY.x}
        y2={MACHINE_ANOMALY.y}
        colorKind="red"
      />
      <MajorNodeShape x={COUNTRY.x} y={COUNTRY.y} size={16} label="Country" status="nominal" />
      <MajorNodeShape x={PLANT.x} y={PLANT.y} size={12} label="Plant" status="nominal" />
      <CompanyNodeShape x={COMPANY.x} y={COMPANY.y} size={11} status="nominal" />
      <SubNodeShape x={MACHINE_OK.x} y={MACHINE_OK.y} />
      <SubNodeShape x={MACHINE_ANOMALY.x} y={MACHINE_ANOMALY.y} anomaly />
    </svg>
  )
}
