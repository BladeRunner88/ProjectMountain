/** A computed operational discrepancy, as the backend serves it. */
export interface FindingWindow {
  start: string
  end: string
}

/**
 * A thing a finding is about. `type` is a display label — "Plant", "Supplier",
 * "Measure" — and is not always an ontology object type.
 */
export interface FindingEntity {
  type: string
  name: string
}

export interface Finding {
  id: string
  finding_type: string
  title: string
  description: string
  /** The vendor files the finding was computed from. */
  sources: string[]
  /** Every number behind the claim, so a reader can check it. */
  computed: Record<string, unknown>
  window: FindingWindow
  entities: FindingEntity[]
  reviewer_status: string
  reviewed_by: string | null
  reviewed_at: string | null
  evidence: Record<string, unknown>
}
