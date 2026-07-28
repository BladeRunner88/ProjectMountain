import {
  validateMinLength,
  validateMultiSelect,
  validatePhone,
  validateRequired,
  validateUrl,
  validateWorkEmail,
} from '../../lib/validation'

export type FormData = {
  // step 1: company
  companyName: string
  businessEmail: string
  phoneDial: string
  phoneNumber: string
  website: string
  industry: string
  companySize: string
  // step 2: legal address
  country: string
  addressLine1: string
  addressLine2: string
  city: string
  stateRegion: string
  postalCode: string
  // step 3: about the business
  businessDescription: string
  useCase: string
  hearAboutUs: string
  // step 4: deployment and billing contact
  deploymentEnvironment: string
  expectedAnalysts: string
  systems: string[]
  systemsOther: string
  targetTimeline: string
  billingContactName: string
  billingContactEmail: string
  taxId: string
}

export const initialFormData: FormData = {
  companyName: '',
  businessEmail: '',
  phoneDial: '+1',
  phoneNumber: '',
  website: '',
  industry: '',
  companySize: '',
  country: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  stateRegion: '',
  postalCode: '',
  businessDescription: '',
  useCase: '',
  hearAboutUs: '',
  deploymentEnvironment: '',
  expectedAnalysts: '',
  systems: [],
  systemsOther: '',
  targetTimeline: '',
  billingContactName: '',
  billingContactEmail: '',
  taxId: '',
}

type Validator = (f: FormData) => string | undefined

const STEP_1_FIELDS: Record<string, Validator> = {
  companyName: (f) => validateMinLength(f.companyName, 2, 'Legal company name'),
  businessEmail: (f) => validateWorkEmail(f.businessEmail),
  phoneNumber: (f) => validatePhone(f.phoneDial, f.phoneNumber),
  website: (f) => validateUrl(f.website),
  industry: (f) => validateRequired(f.industry, 'Industry'),
  companySize: (f) => validateRequired(f.companySize, 'Company size'),
}

const STEP_2_FIELDS: Record<string, Validator> = {
  country: (f) => validateRequired(f.country, 'Country'),
  addressLine1: (f) => validateRequired(f.addressLine1, 'Address line 1'),
  city: (f) => validateRequired(f.city, 'City'),
  stateRegion: (f) => validateRequired(f.stateRegion, 'State or region'),
  postalCode: (f) => validateRequired(f.postalCode, 'Postal code'),
}

const STEP_3_FIELDS: Record<string, Validator> = {
  businessDescription: (f) =>
    validateMinLength(f.businessDescription, 100, 'Business description'),
  useCase: (f) => validateMinLength(f.useCase, 50, 'This field'),
}

const STEP_4_FIELDS: Record<string, Validator> = {
  deploymentEnvironment: (f) => validateRequired(f.deploymentEnvironment, 'Deployment environment'),
  expectedAnalysts: (f) => validateRequired(f.expectedAnalysts, 'Expected number of analysts'),
  systems: (f) => validateMultiSelect(f.systems, 'systems you need to connect'),
  targetTimeline: (f) => validateRequired(f.targetTimeline, 'Target timeline'),
  billingContactName: (f) => validateRequired(f.billingContactName, 'Billing contact name'),
  billingContactEmail: (f) => validateWorkEmail(f.billingContactEmail, 'Billing contact email'),
}

export const STEP_VALIDATORS: Record<number, Record<string, Validator>> = {
  1: STEP_1_FIELDS,
  2: STEP_2_FIELDS,
  3: STEP_3_FIELDS,
  4: STEP_4_FIELDS,
}

export function validateStep(step: number, form: FormData): Record<string, string> {
  const validators = STEP_VALIDATORS[step] ?? {}
  const errors: Record<string, string> = {}
  for (const [field, validate] of Object.entries(validators)) {
    const error = validate(form)
    if (error) errors[field] = error
  }
  return errors
}
