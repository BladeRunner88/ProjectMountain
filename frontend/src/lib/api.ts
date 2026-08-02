const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8010'

export type ObjectType = 'Person' | 'Organization' | 'Location'

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
  direction: 'in' | 'out'
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
}

export type SearchResult = {
  id: string
  type: ObjectType
  name: string
  connections: number
  matched_alias: string | null
}

export type Stats = {
  by_type: Record<string, number>
  resolution: { raw_records: number; resolved_entities: number; merged: number }
  most_connected: { id: string; type: ObjectType; name: string; connections: number }[]
  links_by_type: Record<string, number>
}

export type AccessRequestPayload = {
  company_name: string
  business_email: string
  phone: string
  website: string
  industry: string
  company_size: string
  country: string
  address_line1: string
  address_line2: string | null
  city: string
  state_region: string
  postal_code: string
  business_description: string
  use_case: string
  hear_about_us: string | null
  deployment_environment: string
  expected_analysts: string
  systems: string[]
  systems_other: string | null
  target_timeline: string
  billing_contact_name: string
  billing_contact_email: string
  tax_id: string | null
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(`Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function parseErrorBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal })
  if (!res.ok) throw new ApiError(res.status, await parseErrorBody(res))
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorBody(res))
  }
  return res.json()
}

export const api = {
  objects: (type?: ObjectType) => get<GraphObject[]>(`/objects${type ? `?type=${type}` : ''}`),
  object: (id: string) => get<ObjectDetail>(`/objects/${id}`),
  search: (q: string, signal?: AbortSignal) =>
    get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`, signal),
  stats: () => get<Stats>('/stats'),

  // The graph view needs the full node + edge set, but the API only
  // exposes /objects (list) and /objects/{id} (one node's connections) —
  // there is no bulk graph endpoint. Derive the edge list by fetching
  // every object's detail and keeping only "out" edges (each link has
  // exactly one out + one in record, so this avoids double-counting).
  async fullGraph(): Promise<{ objects: GraphObject[]; links: GraphLink[] }> {
    const objects = await get<GraphObject[]>('/objects')
    const details = await Promise.all(objects.map((o) => get<ObjectDetail>(`/objects/${o.id}`)))
    const links: GraphLink[] = []
    details.forEach((d) => {
      d.connections
        .filter((c) => c.direction === 'out')
        .forEach((c) => links.push({ source: d.id, target: c.id, rel_type: c.rel_type }))
    })
    return { objects, links }
  },

  submitAccessRequest: (payload: AccessRequestPayload) =>
    post<{ id: string; submitted_at: string }>('/access-requests', payload),
}
