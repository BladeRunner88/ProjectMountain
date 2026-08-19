export { ControlRoomShell } from './components/ControlRoomShell'
export { ControlRoomSkeleton, ControlRoomTabSkeleton } from './components/ControlRoomSkeleton'
export { ControlRoomErrorBoundary } from './components/ControlRoomErrorBoundary'
export { TopBar, type LiveStatus, type TopBarProps } from './components/TopBar'
export { SectionHeader, type SectionHeaderProps } from './components/SectionHeader'
export { Inspector } from './components/Inspector'
export { IdentityRecordPanel } from './components/IdentityRecordPanel'
export { ActivityLane } from './components/ActivityLane'
export { CommandPalette, type CommandPaletteProps } from './components/CommandPalette'
export { DemoRunner } from './components/DemoRunner'
export { Scrubber } from './components/Scrubber'
export { DirectManipulationSlider, type DirectManipulationSliderProps } from './components/DirectManipulationSlider'
export { FilterBar, type FilterBarProps } from './components/FilterBar'
export { DensityToggle } from './components/DensityToggle'
export { PersonBadge, type PersonBadgeProps } from './components/PersonBadge'
export { RecommendationCard, RecommendedSection, type Recommendation } from './components/RecommendationCard'
export { RatingRing, SegmentedBar, type RatingRingProps, type SegmentedBarProps } from './components/athleteCard'
export { EvidenceStrip } from './components/EvidenceStrip'
export { EvidenceTable, type EvidenceRow } from './components/EvidenceTable'
export { FlowDiagram } from './components/FlowDiagram'
export { Overview } from './components/Overview'
export { Processing } from './components/Processing'

export {
  CONTROL_ROOM_BASE,
  DEFAULT_TAB_ID,
  TABS,
  isTabId,
  tabById,
  tabFromPathname,
  tabHref,
  type TabDef,
  type TabId,
  type TabLine,
  type Density,
  type CommandItem,
  type CommandKind,
} from './types'

export {
  useControlRoomKeyboard,
  useDensity,
  useFocusRing,
  useInspectorChrome,
  useSectionHeaderSlot,
  useIdentitySubnav,
  IDENTITY_SUB_TABS,
  isIdentitySubTab,
  SectionHeaderSlotProvider,
  type ControlRoomKeyboardOptions,
  type FocusRingHandlers,
  type FocusRingValue,
  type InspectorChromeValue,
  type SectionHeaderSlotValue,
  type IdentitySubTab,
  type IdentitySubnavValue,
} from './hooks'

export { useChromeStore, type ChromePersisted, type ChromeState } from './stores'

export {
  canDo,
  canDoOnPanel,
  compareValues,
  computeVisibleRange,
  disabledReason,
  disabledReasonOnPanel,
  driveSprings,
  focusRingStyle,
  formatUnknownNumber,
  hasRenderableWhy,
  rubberBand,
  tracedDisplayString,
  Spring,
  SPRING_SETTLE,
  EXPOSURE_ROLE_LABEL,
  REVISION_ROLE_LABEL,
  type ExposureActionId,
  type ExposurePanel,
  type ExposureRole,
  type RevisionActionId,
  type RevisionRole,
  type SpringConfig,
  type VisibleRange,
} from './services'
