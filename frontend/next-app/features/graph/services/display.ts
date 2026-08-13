const TYPE_COLOR: Record<string, string> = {
  Person: "#9DB4C9",
  Organization: "#C9A876",
  Location: "#8FA893",
  Player: "#9DB4C9",
  Account: "#C9A876",
  Game: "#8FA893",
  GameProvider: "#A89BB8",
  PaymentProvider: "#B8A07A",
  Transaction: "#7A8FA8",
  Campaign: "#A8B07A",
  AffiliateSource: "#B08A7A",
  Market: "#7AA8A0",
}

export const GRAPH_ACCENT = "#0071E3"
export const GRAPH_CANVAS_BG = "#0A0A0C"

export function typeColor(type: string): string {
  return TYPE_COLOR[type] ?? "#999999"
}

export function typeLabel(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase()
}

export function objectDisplayName(object: {
  id: string
  name?: unknown
  title?: unknown
  account_ref?: unknown
}): string {
  if (typeof object.name === "string" && object.name.length > 0) return object.name
  if (typeof object.title === "string" && object.title.length > 0) return object.title
  if (typeof object.account_ref === "string" && object.account_ref.length > 0) {
    return object.account_ref
  }
  return object.id
}

export function pickHeading(
  properties: Record<string, unknown>,
  fallback: string
): { heading: string; rest: Record<string, unknown> } {
  for (const key of ["name", "title", "account_ref"] as const) {
    const value = properties[key]
    if (typeof value === "string" && value.length > 0) {
      const rest = { ...properties }
      delete rest[key]
      return { heading: value, rest }
    }
  }
  return { heading: fallback, rest: properties }
}
