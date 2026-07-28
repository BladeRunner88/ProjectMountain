import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ProgressBar } from '../components/access/ProgressBar'
import { StepCompany } from '../components/access/steps/StepCompany'
import { StepAddress } from '../components/access/steps/StepAddress'
import { StepAbout } from '../components/access/steps/StepAbout'
import { StepDeployment } from '../components/access/steps/StepDeployment'
import { Confirmation } from '../components/access/Confirmation'
import { initialFormData, validateStep, type FormData } from '../components/access/formTypes'
import { useAccess, type AccessSummary } from '../lib/access'
import { api } from '../lib/api'
import { toE164 } from '../lib/validation'
import { SquareButton } from '../components/SquareButton'

const TOTAL_STEPS = 4

const STEP_COPY: Record<number, { headline: string; sub?: string }> = {
  1: {
    headline: 'Tell us about your organization.',
    sub: 'We review every organization before granting access.',
  },
  2: {
    headline: 'Where is the organization registered?',
    sub: 'This must be your registered legal address, not a mailing address.',
  },
  3: {
    headline: 'What does your organization do?',
  },
  4: {
    headline: 'How would you deploy Isildur?',
    sub: 'This helps us prepare the right proposal. Nothing is billed until an agreement is in place.',
  },
}

export function RequestAccess() {
  const navigate = useNavigate()
  const { grantAccess } = useAccess()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(initialFormData)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [summary, setSummary] = useState<AccessSummary | null>(null)

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const onBlurField = (key: string) => {
    // Re-validate every field that currently has a shown error, not just the
    // one that just blurred — otherwise a field whose value became valid
    // through a change that never fired its own blur (a <select> the user
    // never revisits) keeps showing a stale error forever.
    const stepErrors = validateStep(step, form)
    setErrors((e) => {
      const next: Record<string, string> = {}
      for (const k of new Set([...Object.keys(e), key])) {
        if (stepErrors[k]) next[k] = stepErrors[k]
      }
      return next
    })
  }

  const handleBack = () => {
    if (step === 1) {
      navigate('/')
      return
    }
    setStep((s) => s - 1)
  }

  const handleContinue = async () => {
    const stepErrors = validateStep(step, form)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    setErrors({})

    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await api.submitAccessRequest({
        company_name: form.companyName,
        business_email: form.businessEmail,
        phone: toE164(form.phoneDial, form.phoneNumber),
        website: form.website,
        industry: form.industry,
        company_size: form.companySize,
        country: form.country,
        address_line1: form.addressLine1,
        address_line2: form.addressLine2 || null,
        city: form.city,
        state_region: form.stateRegion,
        postal_code: form.postalCode,
        business_description: form.businessDescription,
        use_case: form.useCase,
        hear_about_us: form.hearAboutUs || null,
        deployment_environment: form.deploymentEnvironment,
        expected_analysts: form.expectedAnalysts,
        systems: form.systems,
        systems_other: form.systemsOther || null,
        target_timeline: form.targetTimeline,
        billing_contact_name: form.billingContactName,
        billing_contact_email: form.billingContactEmail,
        tax_id: form.taxId || null,
      })
      const s: AccessSummary = {
        companyName: form.companyName,
        industry: form.industry,
        country: form.country,
        deploymentEnvironment: form.deploymentEnvironment,
        billingContactEmail: form.billingContactEmail,
      }
      grantAccess(s)
      setSummary(s)
    } catch {
      setSubmitError('Something went wrong submitting your request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const copy = STEP_COPY[step]

  return (
    <div className="min-h-screen bg-app font-inter">
      <div className="px-6 pt-8 md:px-10">
        <Link to="/" className="text-[15px] font-semibold text-ink">
          Isildur
        </Link>
      </div>

      <div className="mx-auto w-full max-w-[560px] px-6 pb-24 pt-16 md:pt-24">
        {summary ? (
          <Confirmation summary={summary} />
        ) : (
          <>
            <ProgressBar step={step} total={TOTAL_STEPS} />

            <div className="mt-12">
              <h1 className="text-[36px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink">
                {copy.headline}
              </h1>
              {copy.sub && (
                <p className="mt-3 text-[17px] leading-[1.5] text-ink-soft">{copy.sub}</p>
              )}
            </div>

            <div className="mt-10">
              {step === 1 && (
                <StepCompany form={form} setField={setField} errors={errors} onBlurField={onBlurField} />
              )}
              {step === 2 && (
                <StepAddress form={form} setField={setField} errors={errors} onBlurField={onBlurField} />
              )}
              {step === 3 && (
                <StepAbout form={form} setField={setField} errors={errors} onBlurField={onBlurField} />
              )}
              {step === 4 && (
                <StepDeployment form={form} setField={setField} errors={errors} onBlurField={onBlurField} />
              )}
            </div>

            {submitError && (
              <p className="mt-6 text-[13px]" style={{ color: '#C7392B' }}>
                {submitError}
              </p>
            )}

            <div className="mt-12 flex items-center justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="text-[14px] text-ink-soft transition-colors duration-fast ease-out hover:text-ink"
              >
                Back
              </button>
              <SquareButton
                tone="light"
                onClick={handleContinue}
                disabled={submitting}
                className="disabled:opacity-60"
              >
                {step < TOTAL_STEPS ? 'Continue' : submitting ? 'Submitting…' : 'Submit request'}
              </SquareButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
