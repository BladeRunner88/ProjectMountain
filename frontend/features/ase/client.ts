'use client'

// Client ASE bindings: Zustand stores, React hooks, and the two engine-layer
// presentational components (Metric, LiteralsAuditPanel).

export {
  AseProviders,
  AsOfProvider,
  DatasetProvider,
  DemoModeProvider,
  HoverProvider,
  SelectionProvider,
  SimulationModeProvider,
  isDimmed,
  useAsOf,
  useDataset,
  useDemoMode,
  useHover,
  usePrefersReducedMotion,
  useSelection,
  useSimulationMode,
  DEMO_AUDIENCE_LABEL,
  DEMO_AUDIENCE_NOTE,
  DEMO_AUDIENCE_STEP_INDICES,
  DEMO_CLOSING_LINE,
  DEMO_STEPS,
  DEMO_TOTAL_SECONDS,
  type AsOfValue,
  type AuditEntry,
  type DatasetValue,
  type DemoAudience,
  type DemoModeValue,
  type DemoStatus,
  type DemoStepDef,
  type DemoStepId,
  type HoverValue,
  type RevisionEntry,
  type Selection,
  type SelectionValue,
  type SimulationModeValue,
} from './hooks'

export {
  useAsOfStore,
  useDatasetStore,
  useDemoModeStore,
  useHoverStore,
  useSelectionStore,
  useSimulationModeStore,
  type AsOfAt,
} from './stores'

export { LiteralsAuditPanel, Metric, type LiteralsAuditResult, type MetricProps } from './components'
