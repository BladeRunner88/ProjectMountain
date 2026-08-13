import type { ReactNode } from "react"

import type { StepFieldProps } from "../../types/form"
import { SelectField, TextareaField } from "../fields"

const HEAR_ABOUT_OPTIONS = [
  "Search",
  "Referral",
  "Conference or event",
  "Press or article",
  "Social media",
  "Other",
]

export function StepAbout({
  form,
  setField,
  errors,
  onBlurField,
}: StepFieldProps): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <TextareaField
        label="Business description"
        value={form.businessDescription}
        onChange={(v) => setField("businessDescription", v)}
        onBlur={() => onBlurField("businessDescription")}
        error={errors.businessDescription}
        minLength={100}
        placeholder="What your organization does, who it serves, and the systems you work with today."
      />
      <TextareaField
        label="What do you want to use Isildur for"
        value={form.useCase}
        onChange={(v) => setField("useCase", v)}
        onBlur={() => onBlurField("useCase")}
        error={errors.useCase}
        minLength={50}
      />
      <SelectField
        label="How did you hear about us"
        value={form.hearAboutUs}
        onChange={(v) => setField("hearAboutUs", v)}
        options={HEAR_ABOUT_OPTIONS}
        placeholder="Optional"
      />
    </div>
  )
}
