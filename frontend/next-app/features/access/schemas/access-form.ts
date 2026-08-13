import { z } from "zod"

import type {
  AccessFieldErrors,
  AccessFormValues,
  AccessStep,
} from "../types/form"
import {
  validateMinLength,
  validateMultiSelect,
  validatePhone,
  validateRequired,
  validateUrl,
  validateWorkEmail,
} from "./validation"

type ZodIssueLike = {
  path: readonly PropertyKey[]
  message: string
}

type IssueCtx = {
  addIssue: (issue: {
    code: "custom"
    message: string
    path?: PropertyKey[]
  }) => void
}

function applyRule(
  ctx: IssueCtx,
  message: string | undefined,
  path?: PropertyKey[]
): void {
  if (!message) return
  ctx.addIssue(
    path ? { code: "custom", message, path } : { code: "custom", message }
  )
}

function stringRule(
  rule: (value: string) => string | undefined
): z.ZodType<string> {
  return z.string().superRefine((value, ctx) => {
    applyRule(ctx, rule(value))
  })
}

export const step1Schema = z
  .object({
    companyName: stringRule((v) =>
      validateMinLength(v, 2, "Legal company name")
    ),
    businessEmail: stringRule((v) => validateWorkEmail(v)),
    phoneDial: z.string(),
    phoneNumber: z.string(),
    website: stringRule((v) => validateUrl(v)),
    industry: stringRule((v) => validateRequired(v, "Industry")),
    companySize: stringRule((v) => validateRequired(v, "Company size")),
  })
  .superRefine((value, ctx) => {
    applyRule(ctx, validatePhone(value.phoneDial, value.phoneNumber), [
      "phoneNumber",
    ])
  })

export const step2Schema = z.object({
  country: stringRule((v) => validateRequired(v, "Country")),
  addressLine1: stringRule((v) => validateRequired(v, "Address line 1")),
  addressLine2: z.string(),
  city: stringRule((v) => validateRequired(v, "City")),
  stateRegion: stringRule((v) => validateRequired(v, "State or region")),
  postalCode: stringRule((v) => validateRequired(v, "Postal code")),
})

export const step3Schema = z.object({
  businessDescription: stringRule((v) =>
    validateMinLength(v, 100, "Business description")
  ),
  useCase: stringRule((v) => validateMinLength(v, 50, "This field")),
  hearAboutUs: z.string(),
})

export const step4Schema = z.object({
  deploymentEnvironment: stringRule((v) =>
    validateRequired(v, "Deployment environment")
  ),
  expectedAnalysts: stringRule((v) =>
    validateRequired(v, "Expected number of analysts")
  ),
  systems: z.array(z.string()).superRefine((value, ctx) => {
    applyRule(ctx, validateMultiSelect(value, "systems you need to connect"))
  }),
  systemsOther: z.string(),
  targetTimeline: stringRule((v) => validateRequired(v, "Target timeline")),
  billingContactName: stringRule((v) =>
    validateRequired(v, "Billing contact name")
  ),
  billingContactEmail: stringRule((v) =>
    validateWorkEmail(v, "Billing contact email")
  ),
  taxId: z.string(),
})

export const accessFormSchema = step1Schema
  .and(step2Schema)
  .and(step3Schema)
  .and(step4Schema)

export const STEP_SCHEMAS: Record<AccessStep, z.ZodType> = {
  1: step1Schema,
  2: step2Schema,
  3: step3Schema,
  4: step4Schema,
}

export function fieldErrorsFromZod(error: {
  issues: readonly ZodIssueLike[]
}): AccessFieldErrors {
  const errors: AccessFieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === "string" && errors[key] === undefined) {
      errors[key] = issue.message
    }
  }
  return errors
}

export function validateStep(
  step: AccessStep,
  form: AccessFormValues
): AccessFieldErrors {
  const parsed = STEP_SCHEMAS[step].safeParse(form)
  if (parsed.success) return {}
  return fieldErrorsFromZod(parsed.error)
}

export function validateAccessForm(form: AccessFormValues): AccessFieldErrors {
  const parsed = accessFormSchema.safeParse(form)
  if (parsed.success) return {}
  return fieldErrorsFromZod(parsed.error)
}
