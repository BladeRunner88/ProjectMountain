"use client"

import { useEffect, useState, type ReactElement, type ReactNode } from "react"

import { CloseIcon } from "@/components/ui/icons"

import type { Machine, Company } from "../types/domain"
import { ANOMALY_COLOR, MACHINE_NORMAL_COLOR } from "./shapes"

const OEE_RED_THRESHOLD = 80

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function Sparkline({
  values,
  min,
  max,
  color,
  width = 132,
  height = 32,
}: {
  values: number[]
  min: number
  max: number
  color: string
  width?: number
  height?: number
}): ReactElement {
  const denom = Math.max(1, values.length - 1)
  const range = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / denom) * width
      const y = height - ((clamp(v, min, max) - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Row({
  label,
  value,
}: {
  label: string
  value: string
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[13px] text-white/45">{label}</span>
      <span className="font-mono text-[13px] text-white/85">{value}</span>
    </div>
  )
}

export function SectionHeading({
  children,
  right,
}: {
  children: string
  right?: ReactNode
}): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-medium tracking-[0.08em] text-white/40 uppercase">
        {children}
      </p>
      {right}
    </div>
  )
}

export function MachineSidePanel({
  machine,
  company,
  lenses,
  anomaly,
  oee,
  vibration,
  oeeHistory,
  hrHistory,
  onClose,
}: {
  machine: Machine
  company: Company | undefined
  lenses: Set<string>
  anomaly: boolean
  oee: number
  vibration: number
  oeeHistory: number[]
  hrHistory: number[]
  onClose: () => void
}): ReactElement {
  const oeeCritical = oee < OEE_RED_THRESHOLD
  const oeeColor = oeeCritical ? ANOMALY_COLOR : MACHINE_NORMAL_COLOR
  const showRampUp = lenses.has("Line progression")

  return (
    <PanelShell onClose={onClose}>
      <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
        <div>
          <h2 className="text-[18px] font-semibold text-white">
            {machine.name}
          </h2>
          <p
            className="mt-1 text-[13px] font-medium"
            style={{ color: anomaly ? ANOMALY_COLOR : MACHINE_NORMAL_COLOR }}
          >
            {anomaly ? (machine.anomalyReason ?? "Anomaly") : "Nominal"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="duration-fast flex h-7 w-7 shrink-0 items-center justify-center text-white/50 transition-colors ease-out hover:text-white"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-7 overflow-y-auto px-6 py-6">
        <section className="flex flex-col gap-1">
          <SectionHeading>Identity</SectionHeading>
          <div className="mt-1 divide-y divide-white/[0.06]">
            <Row label="Company" value={company?.name ?? machine.companyId} />
            <Row label="Line" value={machine.linePrefix} />
            <Row label="From" value={machine.from} />
            <Row label="Date of birth" value={machine.dob} />
            <Row
              label="Mountains climbed"
              value={String(machine.mountainsClimbed)}
            />
          </div>
        </section>

        {showRampUp && (
          <section className="flex flex-col gap-1">
            <SectionHeading>RampUp</SectionHeading>
            <div className="mt-1 divide-y divide-white/[0.06]">
              <Row label="Current position" value={machine.currentPosition} />
              <Row label="Time to EBC (from Lukla)" value={machine.timeToEBC} />
              <Row
                label="Ambient pressure"
                value={`${machine.ambientPressure_hPa} hPa`}
              />
            </div>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <SectionHeading
            right={
              <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.08em] text-white/40 uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4C8DFF] motion-safe:animate-pulse" />
                Live
              </span>
            }
          >
            Live readings
          </SectionHeading>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] text-white/45">Oee (%)</p>
              <p
                className="mt-1 font-mono text-[28px] leading-none"
                style={{ color: oeeColor }}
              >
                {oee}
              </p>
              <div className="mt-2">
                <Sparkline
                  values={oeeHistory}
                  min={65}
                  max={100}
                  color={oeeColor}
                />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-white/45">Vibration (mm/s)</p>
              <p className="mt-1 font-mono text-[28px] leading-none text-white">
                {vibration}
              </p>
              <div className="mt-2">
                <Sparkline
                  values={hrHistory}
                  min={50}
                  max={150}
                  color={MACHINE_NORMAL_COLOR}
                />
              </div>
            </div>
          </div>

          <div className="divide-y divide-white/[0.06] border-t border-white/[0.06] pt-1">
            <Row
              label="Hydraulic pressure"
              value={`${machine.hydraulicPressure.supplyBar}/${machine.hydraulicPressure.returnBar}`}
            />
            <Row label="Resting HR" value={`${machine.restingHr} mm/s`} />
          </div>
        </section>
      </div>
    </PanelShell>
  )
}

export function PanelShell({
  children,
  onClose,
}: {
  children: ReactNode
  onClose: () => void
}): ReactElement {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div
      className="absolute inset-y-0 right-0 z-10 flex w-[420px] flex-col border-l border-white/10 transition-transform ease-out motion-reduce:transition-none"
      style={{
        backgroundColor: "#0F1319",
        transform: visible ? "translateX(0)" : "translateX(100%)",
        transitionDuration: "350ms",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}
