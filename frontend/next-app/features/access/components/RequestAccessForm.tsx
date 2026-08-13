"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
import { useForm, useWatch, type Path, type PathValue } from "react-hook-form"
import { useRouter } from "next/navigation"

import { LoadingState } from "@/components/ui/loading-state"
import { SquareButton } from "@/components/ui/square-button"
import type { AccessSummary } from "@/lib/access"

import { useAccessGrant } from "../hooks/useAccessGrant"
import { useRequestAccess } from "../hooks/useRequestAccess"
import { validateAccessForm, validateStep } from "../schemas/access-form"
import { toAccessRequestPayload, toAccessSummary } from "../schemas/payload"
import { accessFormResolver } from "../schemas/resolver"
import { describeAccessRequestError } from "../services/access-request"
import type {
  AccessFieldErrors,
  AccessFormValues,
  AccessStep,
} from "../types/form"
import { ACCESS_FORM_DEFAULTS } from "../types/form"
import { AccessPageChrome } from "./AccessPageChrome"
import { Confirmation } from "./Confirmation"
import { ProgressBar } from "./ProgressBar"
import { StepAbout } from "./steps/StepAbout"
import { StepAddress } from "./steps/StepAddress"
import { StepCompany } from "./steps/StepCompany"
import { StepDeployment } from "./steps/StepDeployment"

const TOTAL_STEPS = 4

const STEP_COPY: Record<AccessStep, { headline: string; sub?: string }> = {
  1: {
    headline: "Tell us about your organization.",
    sub: "We review every organization before granting access.",
  },
  2: {
    headline: "Where is the organization registered?",
    sub: "This must be your registered legal address, not a mailing address.",
  },
  3: {
    headline: "What does your organization do?",
  },
  4: {
    headline: "How would you deploy Isildur?",
    sub: "This helps us prepare the right proposal. Nothing is billed until an agreement is in place.",
  },
}

function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

function isAccessStep(value: number): value is AccessStep {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function asAccessForm(values: Partial<AccessFormValues>): AccessFormValues {
  return {
    companyName: values.companyName ?? ACCESS_FORM_DEFAULTS.companyName,
    businessEmail: values.businessEmail ?? ACCESS_FORM_DEFAULTS.businessEmail,
    phoneDial: values.phoneDial ?? ACCESS_FORM_DEFAULTS.phoneDial,
    phoneNumber: values.phoneNumber ?? ACCESS_FORM_DEFAULTS.phoneNumber,
    website: values.website ?? ACCESS_FORM_DEFAULTS.website,
    industry: values.industry ?? ACCESS_FORM_DEFAULTS.industry,
    companySize: values.companySize ?? ACCESS_FORM_DEFAULTS.companySize,
    country: values.country ?? ACCESS_FORM_DEFAULTS.country,
    addressLine1: values.addressLine1 ?? ACCESS_FORM_DEFAULTS.addressLine1,
    addressLine2: values.addressLine2 ?? ACCESS_FORM_DEFAULTS.addressLine2,
    city: values.city ?? ACCESS_FORM_DEFAULTS.city,
    stateRegion: values.stateRegion ?? ACCESS_FORM_DEFAULTS.stateRegion,
    postalCode: values.postalCode ?? ACCESS_FORM_DEFAULTS.postalCode,
    businessDescription:
      values.businessDescription ?? ACCESS_FORM_DEFAULTS.businessDescription,
    useCase: values.useCase ?? ACCESS_FORM_DEFAULTS.useCase,
    hearAboutUs: values.hearAboutUs ?? ACCESS_FORM_DEFAULTS.hearAboutUs,
    deploymentEnvironment:
      values.deploymentEnvironment ??
      ACCESS_FORM_DEFAULTS.deploymentEnvironment,
    expectedAnalysts:
      values.expectedAnalysts ?? ACCESS_FORM_DEFAULTS.expectedAnalysts,
    systems: values.systems ?? ACCESS_FORM_DEFAULTS.systems,
    systemsOther: values.systemsOther ?? ACCESS_FORM_DEFAULTS.systemsOther,
    targetTimeline:
      values.targetTimeline ?? ACCESS_FORM_DEFAULTS.targetTimeline,
    billingContactName:
      values.billingContactName ?? ACCESS_FORM_DEFAULTS.billingContactName,
    billingContactEmail:
      values.billingContactEmail ?? ACCESS_FORM_DEFAULTS.billingContactEmail,
    taxId: values.taxId ?? ACCESS_FORM_DEFAULTS.taxId,
  }
}

export function RequestAccessForm(): ReactNode {
  const router = useRouter()
  const isClient = useIsClient()
  const { summary, grantAccess } = useAccessGrant()
  const {
    mutateAsync,
    isPending,
    error: mutationError,
    reset: resetMutation,
  } = useRequestAccess()

  const [step, setStep] = useState<AccessStep>(1)

  const { control, setValue, getValues } = useForm<AccessFormValues>({
    defaultValues: ACCESS_FORM_DEFAULTS,
    mode: "onSubmit",
    resolver: accessFormResolver,
  })

  const watched = useWatch({ control, defaultValue: ACCESS_FORM_DEFAULTS })
  const form = asAccessForm(watched)
  const [errors, setErrors] = useState<AccessFieldErrors>({})
  const [sessionSummary, setSessionSummary] = useState<AccessSummary | null>(
    null
  )

  const grantedSummary = sessionSummary ?? summary

  const setField = <K extends keyof AccessFormValues>(
    key: K,
    value: AccessFormValues[K]
  ): void => {
    setValue(
      key as Path<AccessFormValues>,
      value as PathValue<AccessFormValues, Path<AccessFormValues>>,
      { shouldDirty: true, shouldTouch: true }
    )
  }

  const onBlurField = (key: string): void => {
    const stepErrors = validateStep(step, getValues())
    setErrors((current) => {
      const next: AccessFieldErrors = {}
      for (const k of new Set([...Object.keys(current), key])) {
        if (stepErrors[k]) next[k] = stepErrors[k]
      }
      return next
    })
  }

  const handleBack = (): void => {
    if (step === 1) {
      router.push("/")
      return
    }
    const previous = step - 1
    if (isAccessStep(previous)) setStep(previous)
  }

  const handleContinue = async (): Promise<void> => {
    const values = getValues()
    const stepErrors = validateStep(step, values)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    setErrors({})

    if (step < TOTAL_STEPS) {
      const next = step + 1
      if (isAccessStep(next)) setStep(next)
      return
    }

    const allErrors = validateAccessForm(values)
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors)
      return
    }

    resetMutation()
    try {
      await mutateAsync(toAccessRequestPayload(values))
      const nextSummary = toAccessSummary(values)
      grantAccess(nextSummary)
      setSessionSummary(nextSummary)
    } catch {
      // Surface via mutationError + describeAccessRequestError.
    }
  }

  if (!isClient) {
    return (
      <AccessPageChrome>
        <div className="min-h-[40vh]">
          <LoadingState label="Loading" />
        </div>
      </AccessPageChrome>
    )
  }

  if (grantedSummary) {
    return (
      <AccessPageChrome>
        <Confirmation summary={grantedSummary} />
      </AccessPageChrome>
    )
  }

  const copy = STEP_COPY[step]
  const submitError = mutationError
    ? describeAccessRequestError(mutationError)
    : null

  return (
    <AccessPageChrome>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void handleContinue()
        }}
        noValidate
        aria-busy={isPending}
        data-state={isPending ? "submitting" : submitError ? "error" : "idle"}
      >
        <ProgressBar step={step} total={TOTAL_STEPS} />

        <div className="mt-12">
          <h1 className="text-[36px] leading-[1.15] font-semibold tracking-[-0.025em] text-ink">
            {copy.headline}
          </h1>
          {copy.sub ? (
            <p className="mt-3 text-[17px] leading-[1.5] text-ink-soft">
              {copy.sub}
            </p>
          ) : null}
        </div>

        <div className="mt-10">
          {step === 1 ? (
            <StepCompany
              form={form}
              setField={setField}
              errors={errors}
              onBlurField={onBlurField}
            />
          ) : null}
          {step === 2 ? (
            <StepAddress
              form={form}
              setField={setField}
              errors={errors}
              onBlurField={onBlurField}
            />
          ) : null}
          {step === 3 ? (
            <StepAbout
              form={form}
              setField={setField}
              errors={errors}
              onBlurField={onBlurField}
            />
          ) : null}
          {step === 4 ? (
            <StepDeployment
              form={form}
              setField={setField}
              errors={errors}
              onBlurField={onBlurField}
            />
          ) : null}
        </div>

        {submitError ? (
          <p
            className="mt-6 text-[13px]"
            style={{ color: "#C7392B" }}
            role="alert"
            aria-live="polite"
          >
            {submitError}
          </p>
        ) : null}

        <div className="mt-12 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            className="duration-fast text-[14px] text-ink-soft transition-colors ease-out hover:text-ink"
          >
            Back
          </button>
          <SquareButton
            tone="light"
            type="submit"
            disabled={isPending}
            className="disabled:opacity-60"
          >
            {step < TOTAL_STEPS
              ? "Continue"
              : isPending
                ? "Submitting…"
                : "Submit request"}
          </SquareButton>
        </div>
      </form>
    </AccessPageChrome>
  )
}
