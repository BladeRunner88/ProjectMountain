/** Turning a finding's computed values into something a person can read. */

const FINDING_TYPE_LABELS: Record<string, string> = {
  RATE_SHIFT: "Rate shift",
  SOURCE_DIVERGENCE: "Source divergence",
  VOLUME_ANOMALY: "Volume anomaly",
  SILENT_SOURCE: "Silent source",
  CO_OCCURRENCE: "Co-occurrence",
}

/**
 * Keys that repeat the description or name the measure rather than quantify it.
 * Hidden from the summary line; every value is still in `computed`.
 */
const HIDDEN_KEYS = new Set(["unit", "measure"])

const MAX_SHOWN = 4

export function humaniseFindingType(findingType: string): string {
  return (
    FINDING_TYPE_LABELS[findingType] ??
    findingType.toLowerCase().replace(/_/g, " ")
  )
}

export interface ComputedEntry {
  label: string
  value: string
}

/**
 * The headline numbers behind a finding. Unknown keys are shown rather than
 * dropped: a detector the frontend has not been taught about should still be
 * able to show its working.
 */
export function formatComputed(
  computed: Record<string, unknown>
): ComputedEntry[] {
  return Object.entries(computed)
    .filter(
      ([key, value]) =>
        !HIDDEN_KEYS.has(key) && value !== null && value !== undefined
    )
    .slice(0, MAX_SHOWN)
    .map(([key, value]) => ({
      label: key.replace(/_/g, " "),
      value: formatValue(value),
    }))
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2)
  }
  if (typeof value === "string" || typeof value === "boolean")
    return String(value)
  return JSON.stringify(value)
}
