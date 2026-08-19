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

export type AccessRequestResponse = {
  id: string
  submitted_at: string
}
