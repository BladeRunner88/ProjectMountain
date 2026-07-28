import type { FormData } from '../formTypes'
import { TextField, SelectField, PhoneField } from '../fields'

const INDUSTRIES = [
  'Government',
  'Manufacturing',
  'Telecom',
  'Logistics',
  'Energy and Utilities',
  'Other',
]

const COMPANY_SIZES = ['1 to 50', '51 to 200', '201 to 1000', '1000 plus']

type StepProps = {
  form: FormData
  setField: <K extends keyof FormData>(key: K, value: FormData[K]) => void
  errors: Record<string, string>
  onBlurField: (key: string) => void
}

export function StepCompany({ form, setField, errors, onBlurField }: StepProps) {
  return (
    <div className="flex flex-col gap-6">
      <TextField
        label="Legal company name"
        value={form.companyName}
        onChange={(v) => setField('companyName', v)}
        onBlur={() => onBlurField('companyName')}
        error={errors.companyName}
      />
      <TextField
        label="Business email"
        type="email"
        value={form.businessEmail}
        onChange={(v) => setField('businessEmail', v)}
        onBlur={() => onBlurField('businessEmail')}
        error={errors.businessEmail}
        placeholder="you@company.com"
      />
      <PhoneField
        label="Phone number"
        dial={form.phoneDial}
        onDialChange={(v) => setField('phoneDial', v)}
        number={form.phoneNumber}
        onNumberChange={(v) => setField('phoneNumber', v)}
        onBlur={() => onBlurField('phoneNumber')}
        error={errors.phoneNumber}
      />
      <TextField
        label="Company website"
        value={form.website}
        onChange={(v) => setField('website', v)}
        onBlur={() => onBlurField('website')}
        error={errors.website}
        placeholder="www.company.com"
      />
      <SelectField
        label="Industry"
        value={form.industry}
        onChange={(v) => setField('industry', v)}
        onBlur={() => onBlurField('industry')}
        error={errors.industry}
        options={INDUSTRIES}
      />
      <SelectField
        label="Company size"
        value={form.companySize}
        onChange={(v) => setField('companySize', v)}
        onBlur={() => onBlurField('companySize')}
        error={errors.companySize}
        options={COMPANY_SIZES}
      />
    </div>
  )
}
