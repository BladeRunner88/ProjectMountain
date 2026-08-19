import type { AccessSummary } from "@/lib/access"

export type AccessFormValues = {
  companyName: string
  businessEmail: string
  phoneDial: string
  phoneNumber: string
  website: string
  industry: string
  companySize: string
  country: string
  addressLine1: string
  addressLine2: string
  city: string
  statePlant: string
  postalCode: string
  businessDescription: string
  useCase: string
  hearAboutUs: string
  deploymentEnvironment: string
  expectedAnalysts: string
  systems: string[]
  systemsOther: string
  targetTimeline: string
  billingContactName: string
  billingContactEmail: string
  taxId: string
}

export type AccessStep = 1 | 2 | 3 | 4

export type AccessFieldErrors = Record<string, string>

export type StepFieldProps = {
  form: AccessFormValues
  setField: <K extends keyof AccessFormValues>(
    key: K,
    value: AccessFormValues[K]
  ) => void
  errors: AccessFieldErrors
  onBlurField: (key: string) => void
}

export type { AccessSummary }

export const ACCESS_FORM_DEFAULTS: AccessFormValues = {
  companyName: "",
  businessEmail: "",
  phoneDial: "+1",
  phoneNumber: "",
  website: "",
  industry: "",
  companySize: "",
  country: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  statePlant: "",
  postalCode: "",
  businessDescription: "",
  useCase: "",
  hearAboutUs: "",
  deploymentEnvironment: "",
  expectedAnalysts: "",
  systems: [],
  systemsOther: "",
  targetTimeline: "",
  billingContactName: "",
  billingContactEmail: "",
  taxId: "",
}
