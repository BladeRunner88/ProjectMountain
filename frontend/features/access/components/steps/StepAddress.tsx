import type { ReactNode } from "react"

import { COUNTRY_NAMES } from "../../types/countries"
import type { StepFieldProps } from "../../types/form"
import { SelectField, TextField } from "../fields"

export function StepAddress({
  form,
  setField,
  errors,
  onBlurField,
}: StepFieldProps): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <SelectField
        label="Country"
        value={form.country}
        onChange={(v) => setField("country", v)}
        onBlur={() => onBlurField("country")}
        error={errors.country}
        options={COUNTRY_NAMES}
      />
      <TextField
        label="Address line 1"
        value={form.addressLine1}
        onChange={(v) => setField("addressLine1", v)}
        onBlur={() => onBlurField("addressLine1")}
        error={errors.addressLine1}
      />
      <TextField
        label="Address line 2"
        value={form.addressLine2}
        onChange={(v) => setField("addressLine2", v)}
        placeholder="Optional"
      />
      <TextField
        label="City"
        value={form.city}
        onChange={(v) => setField("city", v)}
        onBlur={() => onBlurField("city")}
        error={errors.city}
      />
      <TextField
        label="State or plant"
        value={form.statePlant}
        onChange={(v) => setField("statePlant", v)}
        onBlur={() => onBlurField("statePlant")}
        error={errors.statePlant}
      />
      <TextField
        label="Postal code"
        value={form.postalCode}
        onChange={(v) => setField("postalCode", v)}
        onBlur={() => onBlurField("postalCode")}
        error={errors.postalCode}
      />
    </div>
  )
}
