const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "aol.com",
  "mail.com",
  "gmx.com",
  "inbox.com",
  "zoho.com",
  "fastmail.com",
  "yandex.com",
])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRequired(
  value: string,
  label: string
): string | undefined {
  if (!value || !value.trim()) return `${label} is required.`
  return undefined
}

export function validateMinLength(
  value: string,
  min: number,
  label: string
): string | undefined {
  if (!value || !value.trim()) return `${label} is required.`
  if (value.trim().length < min) {
    return `${label} must be at least ${min} characters.`
  }
  return undefined
}

export function validateWorkEmail(
  value: string,
  label = "Business email"
): string | undefined {
  if (!value || !value.trim()) return `${label} is required.`
  const v = value.trim()
  if (!EMAIL_RE.test(v)) return "Enter a valid email address."
  const domain = v.split("@")[1]?.toLowerCase()
  if (domain && FREE_EMAIL_DOMAINS.has(domain)) {
    return "Please use your work email address."
  }
  return undefined
}

export function validateUrl(value: string): string | undefined {
  if (!value || !value.trim()) return "Company website is required."
  const v = /^https?:\/\//i.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`
  try {
    const url = new URL(v)
    if (!url.hostname.includes(".")) return "Enter a valid URL."
    return undefined
  } catch {
    return "Enter a valid URL."
  }
}

export function validatePhone(
  dial: string,
  number: string
): string | undefined {
  if (!number || !number.trim()) return "Phone number is required."
  const national = number.replace(/[^0-9]/g, "")
  if (national.length < 7) return "Enter a valid phone number."
  const dialDigits = dial.replace(/[^0-9]/g, "")
  if (dialDigits.length + national.length > 15) {
    return "Enter a valid phone number."
  }
  return undefined
}

export function toE164(dial: string, number: string): string {
  return `${dial}${number.replace(/[^0-9]/g, "")}`
}

export function validateMultiSelect(
  selected: string[],
  label: string
): string | undefined {
  if (selected.length === 0) return `Select at least one option for ${label}.`
  return undefined
}
