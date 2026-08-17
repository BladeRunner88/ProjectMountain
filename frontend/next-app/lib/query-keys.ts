export const queryKeys = {
  objects: {
    all: ["objects"] as const,
    detail: (id: string): readonly ["objects", string] => ["objects", id],
  },
  graph: {
    all: ["graph"] as const,
  },
  search: {
    q: (query: string): readonly ["search", string] => ["search", query],
  },
  stats: {
    all: ["stats"] as const,
  },
  accessRequests: {
    all: ["access-requests"] as const,
  },
  findings: {
    all: ["findings"] as const,
    detail: (id: string): readonly ["findings", string] => ["findings", id],
  },
  health: ["health"] as const,
  connectors: ["connectors"] as const,
  sources: ["sources"] as const,
  metrics: {
    byName: (name: string): readonly ["metrics", string] => ["metrics", name],
  },
  correlate: ["correlate"] as const,
  lineage: {
    byId: (id: string): readonly ["lineage", string] => ["lineage", id],
  },
}
