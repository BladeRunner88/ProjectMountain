import type { FormData } from '../formTypes'
import { TextField, SelectField } from '../fields'
import { COUNTRY_NAMES } from '../../../lib/countries'

type StepProps = {
  form: FormData
  setField: <K extends keyof FormData>(key: K, value: FormData[K]) => void
  errors: Record<string, string>
  onBlurField: (key: string) => void
}

export function StepAddress({ form, setField, errors, onBlurField }: StepProps) {
  return (
    <div className="flex flex-col gap-6">
      <SelectField
        label="Country"
        value={form.country}
        onChange={(v) => setField('country', v)}
        onBlur={() => onBlurField('country')}
        error={errors.country}
        options={COUNTRY_NAMES}
      />
      <TextField
        label="Address line 1"
        value={form.addressLine1}
        onChange={(v) => setField('addressLine1', v)}
        onBlur={() => onBlurField('addressLine1')}
        error={errors.addressLine1}
      />
      <TextField
        label="Address line 2"
        value={form.addressLine2}
        onChange={(v) => setField('addressLine2', v)}
        placeholder="Optional"
      />
      <TextField
        label="City"
        value={form.city}
        onChange={(v) => setField('city', v)}
        onBlur={() => onBlurField('city')}
        error={errors.city}
      />
      <TextField
        label="State or region"
        value={form.stateRegion}
        onChange={(v) => setField('stateRegion', v)}
        onBlur={() => onBlurField('stateRegion')}
        error={errors.stateRegion}
      />
      <TextField
        label="Postal code"
        value={form.postalCode}
        onChange={(v) => setField('postalCode', v)}
        onBlur={() => onBlurField('postalCode')}
        error={errors.postalCode}
      />
    </div>
  )
}
