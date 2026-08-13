export type ObjectType = string

export type GraphObject = {
  id: string
  type: ObjectType
  name: string
  [property: string]: unknown
}

export type GraphLink = {
  source: string
  target: string
  rel_type: string
}

export type Connection = {
  direction: "in" | "out"
  rel_type: string
  id: string
  type: ObjectType | null
  name: string
}

export type ResolvedFrom = {
  source_table: string
  source_id: number
  raw_name: string
}

export type ObjectDetail = {
  id: string
  type: ObjectType
  properties: Record<string, unknown>
  connections: Connection[]
  resolved_from: ResolvedFrom[]
  provenance?: Record<string, string>
}

export type FullGraphData = {
  objects: GraphObject[]
  links: GraphLink[]
}
