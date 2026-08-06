// Global selection (S1e): clicking any Metric, anywhere, sets it — that's
// what makes the Control Room feel like a console instead of a report. It
// lives here rather than in a Control-Room-specific context because Metric
// itself (ase/Metric.tsx) needs to write to it; putting the store behind a
// page-level React tree would make the engine layer depend on a particular
// page's component structure.

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Conflict } from './conflict'
import type { TracedValue } from './traced'

// The inspector's structure is identical for every selection type — the
// caller supplies the two bits of English prose a TracedValue can't carry
// itself: a short label and (optionally) the one-sentence "what this is".
// Metric doesn't take a `whatThisIs` prop (S1e's signature is exactly
// `{traced, label, format?, size?}`), so it's optional here and the
// Inspector falls back to a generic sentence when it's absent.
//
// S9.4 adds a second kind: a conflict has TWO TracedValues, not one, so it
// can't be squeezed into the single-`traced` shape below — the Inspector
// branches on `kind` and renders a different body for each.
//
// S9.5b adds a third kind, keyed by id rather than embedding the record
// itself — `IdentityRecord` is genuinely domain content (passports, blood
// groups), and this file stays domain-agnostic by only ever carrying a
// climber id; the Inspector (UI layer, already domain-aware) looks the
// record up through `useDataset()`.
//
// S9.9 adds a fourth kind, same discipline: "the entities currently firing
// a rule" isn't one TracedValue or one person, so it can't be squeezed into
// `value` or `identity` — this file only ever carries the plain names/ids
// needed to render the list, not a `Detection` or `DetectionRule` object.
export type Selection =
  | { kind: 'value'; traced: TracedValue<unknown>; label: string; whatThisIs?: string }
  | { kind: 'conflict'; conflict: Conflict }
  | { kind: 'identity'; climberId: string }
  | { kind: 'ruleFiring'; ruleLabel: string; entities: { climberId?: string; label: string; serial?: string }[] }

export interface SelectionContextValue {
  selection: Selection | null
  select: (selection: Selection | null) => void
}

const SelectionCtx = createContext<SelectionContextValue | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const select = useCallback((next: Selection | null) => setSelection(next), [])
  const value = useMemo(() => ({ selection, select }), [selection, select])
  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionCtx)
  if (!ctx) throw new Error('useSelection must be used within a SelectionProvider')
  return ctx
}
