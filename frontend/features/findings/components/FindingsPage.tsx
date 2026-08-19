"use client"

import { useMemo, type ReactElement } from "react"
import { useRouter } from "next/navigation"

import { ErrorState } from "@/components/ui/error-state"
import { LoadingState } from "@/components/ui/loading-state"

import { useFindingsQuery } from "../hooks/useFindingsQuery"
import { describeFindingsError } from "../services/findings"
import { FindingRow } from "./FindingRow"

export function FindingsPage(): ReactElement {
  const router = useRouter()
  const { data, isPending, isError, error, refetch } = useFindingsQuery()

  const findings = useMemo(() => data ?? [], [data])

  if (isPending) return <LoadingState label="Loading findings" />
  if (isError) {
    return (
      <ErrorState
        message={describeFindingsError(error, "Findings could not be loaded.")}
        onRetry={() => void refetch()}
      />
    )
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-app">
      <div className="mx-auto max-w-3xl px-8 py-16">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">
          Findings
        </h1>
        <p className="mt-2 text-[14px] text-ink-soft">
          {findings.length === 1
            ? "1 computed discrepancy awaiting review."
            : `${findings.length} computed discrepancies awaiting review.`}
        </p>

        {findings.length === 0 ? (
          <p className="mt-10 text-[14px] text-ink-soft">
            No findings. Every source agrees, within the thresholds each
            detector uses.
          </p>
        ) : (
          <div className="mt-10">
            {findings.map((finding, index) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                isFirst={index === 0}
                onOpenLineage={() =>
                  router.push(`/app/control-room/model?finding=${finding.id}`)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
