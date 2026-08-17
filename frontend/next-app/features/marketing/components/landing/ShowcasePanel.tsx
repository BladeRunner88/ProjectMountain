"use client"

import { useState } from "react"
import type { ReactElement } from "react"
import Image from "next/image"

import { SquareButton } from "@/components/ui/square-button"
import { cn } from "@/lib/cn"

type Tab = {
  key: string
  label: string
  headline: string
  description: string
  image: string
}

const TABS: Tab[] = [
  {
    key: "unify",
    label: "Unify",
    headline: "One picture from every system.",
    description:
      "Connect the systems you already run and bring their data together in one place, " +
      "without replacing anything.",
    image: "/showcase/unify.png",
  },
  {
    key: "resolve",
    label: "Resolve",
    headline: "The same thing, everywhere it appears.",
    description:
      "Recognize when scattered records describe one real entity, across every source and " +
      "every naming difference.",
    image: "/showcase/resolve.png",
  },
  {
    key: "explore",
    label: "Explore",
    headline: "Follow every connection.",
    description:
      "Move from any entity to everything it touches, and see relationships no single system " +
      "could show on its own.",
    image: "/showcase/explore.png",
  },
  {
    key: "reconcile",
    label: "Reconcile",
    headline: "One number you can trust.",
    description:
      "See how a figure was assembled across sources, every adjustment named, and exactly " +
      "where each value came from.",
    image: "/showcase/reconcile.png",
  },
  {
    key: "trace",
    label: "Trace",
    headline: "Every value back to its origin.",
    description:
      "Follow any result down to the raw record and the source it came from, with nothing " +
      "hidden in between.",
    image: "/showcase/trace.png",
  },
]

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d={direction === "left" ? "M10 3L5 8L10 13" : "M6 3L11 8L6 13"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShowcaseVisual({ tab }: { tab: Tab }): ReactElement {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return <div className="h-full w-full bg-white/[0.03]" />
  }
  return (
    // `fill` needs no intrinsic dimensions, which suits these optional assets.
    // The wrapper is `relative` and sizes itself (`aspect-[16/10]` on mobile,
    // grid stretch against the text column from `md` up), so the image is
    // absolutely positioned inside an already-sized box and never shifts layout.
    <Image
      src={tab.image}
      alt={`${tab.label} product screenshot`}
      fill
      sizes="(min-width: 768px) 66vw, 100vw"
      onError={() => setFailed(true)}
      className="object-cover"
    />
  )
}

export function ShowcasePanel() {
  const [active, setActive] = useState(0)
  const tab = TABS[active]
  if (!tab) return null

  const prev = () => setActive((i) => (i - 1 + TABS.length) % TABS.length)
  const next = () => setActive((i) => (i + 1) % TABS.length)

  return (
    <section className="border-t border-hairline-on-canvas bg-canvas py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6 md:px-10">
        <div className="flex flex-wrap items-center gap-3">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "duration-fast border px-4 py-2 text-[14px] transition-colors ease-out",
                i === active
                  ? "border-white/30 bg-white/10 text-ink-on-canvas"
                  : "border-hairline-on-canvas text-ink-on-canvas-soft hover:text-ink-on-canvas"
              )}
            >
              {t.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous"
              className="duration-fast flex h-9 w-9 items-center justify-center border border-app bg-app text-ink transition-colors ease-out hover:bg-transparent hover:text-app"
            >
              <ArrowIcon direction="left" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next"
              className="duration-fast flex h-9 w-9 items-center justify-center border border-app bg-app text-ink transition-colors ease-out hover:bg-transparent hover:text-app"
            >
              <ArrowIcon direction="right" />
            </button>
            <SquareButton tone="dark">See all</SquareButton>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 border border-hairline-on-canvas md:grid-cols-3">
          <div className="relative aspect-[16/10] overflow-hidden md:col-span-2 md:aspect-auto">
            <ShowcaseVisual key={tab.key} tab={tab} />
          </div>
          <div className="flex flex-col justify-center gap-5 border-t border-hairline-on-canvas px-8 py-10 md:border-t-0 md:border-l md:px-10">
            <p className="text-[13px] text-ink-on-canvas-soft">{tab.label}</p>
            <h3 className="text-[28px] leading-[1.2] font-semibold tracking-[-0.01em] text-ink-on-canvas">
              {tab.headline}
            </h3>
            <p className="text-[15px] leading-[1.6] text-ink-on-canvas-soft">
              {tab.description}
            </p>
            <SquareButton tone="dark" href="/how-it-works" className="w-fit">
              Learn more
            </SquareButton>
          </div>
        </div>
      </div>
    </section>
  )
}
