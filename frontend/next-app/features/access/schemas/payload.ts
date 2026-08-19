import type { AccessSummary } from "@/lib/access"

import type { AccessRequestPayload } from "../types/access-request"
import type { AccessFormValues } from "../types/form"
import { toE164 } from "./validation"

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function toAccessRequestPayload(
  form: AccessFormValues
): AccessRequestPayload {
  return {
    company_name: form.companyName,
    business_email: form.businessEmail,
    phone: toE164(form.phoneDial, form.phoneNumber),
    website: form.website,
    industry: form.industry,
    company_size: form.companySize,
    country: form.country,
    address_line1: form.addressLine1,
    address_line2: emptyToNull(form.addressLine2),
    city: form.city,
    state_plant: form.statePlant,
    postal_code: form.postalCode,
    business_description: form.businessDescription,
    use_case: form.useCase,
    hear_about_us: emptyToNull(form.hearAboutUs),
    deployment_environment: form.deploymentEnvironment,
    expected_analysts: form.expectedAnalysts,
    systems: form.systems,
    systems_other: emptyToNull(form.systemsOther),
    target_timeline: form.targetTimeline,
    billing_contact_name: form.billingContactName,
    billing_contact_email: form.billingContactEmail,
    tax_id: emptyToNull(form.taxId),
  }
}

export function toAccessSummary(form: AccessFormValues): AccessSummary {
  return {
    companyName: form.companyName,
    industry: form.industry,
    country: form.country,
    deploymentEnvironment: form.deploymentEnvironment,
    billingContactEmail: form.billingContactEmail,
  }
}
