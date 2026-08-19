import type { ReactNode } from "react"

import type { StepFieldProps } from "../../types/form"
import { MultiSelectField, SelectField, TextField } from "../fields"

const DEPLOYMENT_OPTIONS = [
  "Cloud, hosted by Isildur",
  "Private cloud, your own infrastructure",
  "On premise",
  "Air gapped, no external network",
]

const ANALYST_OPTIONS = ["1 to 10", "11 to 50", "51 to 200", "200 plus"]

const SYSTEM_OPTIONS = [
  "Databases",
  "Spreadsheets and files",
  "ERP",
  "CRM",
  "Internal legacy systems",
  "Live sensor or telemetry feeds",
  "Other",
]

const TIMELINE_OPTIONS = [
  "Evaluating now",
  "Within 3 months",
  "Within 6 months",
  "Exploring for later",
]

export function StepDeployment({
  form,
  setField,
  errors,
  onBlurField,
}: StepFieldProps): ReactNode {
  const toggleSystem = (option: string): void => {
    setField(
      "systems",
      form.systems.includes(option)
        ? form.systems.filter((s) => s !== option)
        : [...form.systems, option]
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <SelectField
        label="Deployment environment"
        value={form.deploymentEnvironment}
        onChange={(v) => setField("deploymentEnvironment", v)}
        onBlur={() => onBlurField("deploymentEnvironment")}
        error={errors.deploymentEnvironment}
        options={DEPLOYMENT_OPTIONS}
      />
      <SelectField
        label="Expected number of analysts"
        value={form.expectedAnalysts}
        onChange={(v) => setField("expectedAnalysts", v)}
        onBlur={() => onBlurField("expectedAnalysts")}
        error={errors.expectedAnalysts}
        options={ANALYST_OPTIONS}
      />
      <MultiSelectField
        label="Systems you need to connect"
        options={SYSTEM_OPTIONS}
        selected={form.systems}
        onToggle={toggleSystem}
        error={errors.systems}
        otherValue={form.systemsOther}
        onOtherChange={(v) => setField("systemsOther", v)}
      />
      <SelectField
        label="Target timeline"
        value={form.targetTimeline}
        onChange={(v) => setField("targetTimeline", v)}
        onBlur={() => onBlurField("targetTimeline")}
        error={errors.targetTimeline}
        options={TIMELINE_OPTIONS}
      />
      <TextField
        label="Billing contact name"
        value={form.billingContactName}
        onChange={(v) => setField("billingContactName", v)}
        onBlur={() => onBlurField("billingContactName")}
        error={errors.billingContactName}
      />
      <TextField
        label="Billing contact email"
        type="email"
        value={form.billingContactEmail}
        onChange={(v) => setField("billingContactEmail", v)}
        onBlur={() => onBlurField("billingContactEmail")}
        error={errors.billingContactEmail}
        placeholder="you@company.com"
      />
      <TextField
        label="Tax or business registration number"
        value={form.taxId}
        onChange={(v) => setField("taxId", v)}
        placeholder="Optional"
      />
    </div>
  )
}
