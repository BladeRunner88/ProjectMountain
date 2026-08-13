import type { FieldErrors, Resolver } from "react-hook-form"

import type { AccessFormValues } from "../types/form"
import { accessFormSchema, fieldErrorsFromZod } from "./access-form"

function toRhfErrors(
  fieldErrors: Record<string, string>
): FieldErrors<AccessFormValues> {
  const errors: FieldErrors<AccessFormValues> = {}
  for (const [key, message] of Object.entries(fieldErrors)) {
    Object.assign(errors, {
      [key]: { type: "zod", message },
    })
  }
  return errors
}

export const accessFormResolver: Resolver<AccessFormValues> = async (
  values
) => {
  const parsed = accessFormSchema.safeParse(values)
  if (parsed.success) {
    return { values, errors: {} }
  }
  return {
    values: {},
    errors: toRhfErrors(fieldErrorsFromZod(parsed.error)),
  }
}
