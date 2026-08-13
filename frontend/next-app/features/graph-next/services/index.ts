export { mulberry32, randInt, seedFromString, seededShuffle, weightedPick } from './rng'
export { IS_DEV } from './env'

export { buildGraphDataset, GRAPH_SEED, validateGraphDataset } from './dataset'
export {
  ENVIRONMENT_FREEZING_BREACH_M,
  ENVIRONMENT_TEMP_BREACH_C,
  ENVIRONMENT_VISIBILITY_BREACH_KM,
  ENVIRONMENT_WIND_BREACH_KPH,
} from './dataset'
export { CURRENT_DATASET } from './currentDataset'

export { isFiniteSize, withLayoutSafety, type LayoutFn } from './layoutSafety'
export { networkLayout, resetNetworkLayoutCache } from './networkLayout'
export {
  BAND_HEIGHT,
  BAND_INDEX,
  BAND_LABEL,
  BAND_ORDER,
  STRATA_TOTAL_HEIGHT,
  computeBandStats,
  computeDensityStrip,
  computeStrataLayout,
  pluralizeTier,
  resetStrataLayoutCache,
  type BandStats,
  type StrataLayout,
} from './strataLayout'

export { createRafLoop, type RafLoop } from './rafLoop'
export { buildDriftParams, computeOffsets, type DriftParams } from './offsets'
export { assertFiniteNumber, assertFinitePoint, resetNanGuard } from './nanGuard'

export {
  DEFAULT_VIEWPORT,
  NETWORK_ZOOM_MAX,
  NETWORK_ZOOM_MIN,
  clampZoom,
  isValidViewport,
  loadPersistedViewport,
  savePersistedViewport,
  zoomAt,
} from './viewport'

export { DEFAULT_FILTER, computeFilterVisible, type FilterKind, type GraphFilter } from './filters'
export { computeWatchIds } from './watchStatus'
export { buildHoverChainIndex, type HoverChain } from './hoverChain'
export { buildSearchIndex, computeSearchMatches, firstSearchMatch } from './search'
export { nextEntity, siblingInTier } from './keyboardNav'
export { boundingBoxOf, computeTwoHopNeighbourhood, viewportToFit } from './focusMode'
export { computeConnections, type ConnectedEntity } from './connections'

export {
  EDGE_WIDTH,
  ENVIRONMENT_EDGE_WIDTH,
  FILAMENT_WIDTH_END,
  FILAMENT_WIDTH_START,
  HISTORY_LINK_WIDTH,
  buildAnomalyPathEdgeKeys,
  buildEdgeAppearanceResolver,
  type EdgeAppearance,
} from './edgeAppearance'
export {
  computeHistoryLinkCurve,
  computeQuadraticCurve,
  quadraticPointAt,
  quadraticSvgPath,
  taperedRibbonPoints,
  type QuadraticCurve,
} from './edgeGeometry'

export {
  DRIFT_AMPLITUDE_BY_TIER,
  ENVIRONMENT_DRIFT_AMPLITUDE,
  ENVIRONMENT_RADIUS_PX,
  SUBNODE_ALERT_RADIUS_PX,
  SUBNODE_DRIFT_AMPLITUDE,
  SUBNODE_RADIUS_PX,
  TIER_RADIUS_PX,
} from './sizes'

export { fullSerialFor, serialFor } from './serial'
export { computeFlaggedRecords, computeRecentRecords, computeRecordCounts, type RecordCount } from './attachedRecords'
export { buildColorResolver, darkenColor, type ColorResolver } from './color'
export {
  DIMMED_OPACITY,
  isFilterVisible,
  resolveEdgeOpacity,
  resolveOpacity,
  resolveSubNodeOpacity,
  type EmphasisContext,
} from './emphasis'
export { buildTooltipIndex, type TooltipInfo } from './tooltipInfo'

export {
  ANOMALY_FLUSH_HOPS,
  ANOMALY_FLUSH_TOTAL_MS,
  ANOMALY_TURN_RED_DELAY_MS,
  ANOMALY_TURN_RED_DURATION_MS,
  ARRIVAL_RING_DURATION_MS,
  ARRIVAL_RING_MAX_RADIUS_PX,
  BUD_CHILD_MIGRATE_EASING,
  BUD_CHILD_MIGRATE_END_SCALE,
  BUD_CHILD_MIGRATE_MS,
  BUD_CHILD_SETTLE_MS,
  BUD_CHILD_SETTLE_PEAK_SCALE,
  BUD_CHILD_START_SCALE,
  BUD_CHILD_TOTAL_MS,
  BUD_PARENT_RELAX_MS,
  BUD_PARENT_SWELL_MS,
  BUD_PARENT_SWELL_SCALE,
  CLIMBER_STAGGER_MS,
  COUNTRY_NAME_DELAY_AFTER_LAND_MS,
  COUNTRY_NAME_FADE_MS,
  COUNTRY_STAGGER_MS,
  HISTORY_DRAW_MS,
  HISTORY_REST_OPACITY,
  OPERATOR_STAGGER_MS,
  POP_A_DURATION_MS,
  POP_A_EASE_IN,
  POP_A_EASE_OUT,
  REGION_STAGGER_MS,
  ROUTES_OPERATORS_OVERLAP_MS,
  ROUTE_STAGGER_MS,
  STAGE_START_MS,
  SUBNODE_MASS_DURATION_MS,
  TICKER_FADE_DELAY_MS,
  TICKER_FADE_MS,
  buildSpawnPlan,
  getHasEverSpawned,
  markHasSpawned,
  resetHasEverSpawned,
  type ParentPopEpisode,
  type SpawnPlan,
  type TickerLine,
} from './spawnStages'

export { buildClimberProfiles, type ClimberProfile } from './climberProfile'

export { WORLD_HALF_WIDTH_UNITS, WORLD_LENGTH_UNITS, toWorldX, toWorldZ } from './terrainWorld'
export {
  CAMPS,
  altitudeAt,
  buildClimberPlacements,
  buildRouteConditions,
  buildRouteProfiles,
  defaultRouteId,
  summarizeRouteClimbers,
  type ClimberPlacement,
  type RouteClimberSummary,
  type RouteConditions,
  type RouteProfile,
  type TrailPoint,
} from './terrainProfile'
export {
  POINT_COUNT,
  computeHeightField,
  noiseSeedForRoute,
  resetHeightFieldCache,
  surfaceHeightAt,
  type AnomalyMarker,
  type HeightField,
} from './terrainHeightField'
export {
  DEFAULT_ELEVATION_DEG,
  ELEVATION_MAX_DEG,
  ELEVATION_MIN_DEG,
  ISO_COS30,
  ISO_SIN30,
  RUBBER_BAND_RANGE_DEG,
  clampElevation,
  depthKey,
  depthRangeForWorld,
  isValidCamera,
  loadPersistedCamera,
  projectPoint,
  rubberBandElevation,
  savePersistedCamera,
  type Camera,
} from './terrainCamera'

export {
  HR_BREACH_HIGH_BPM,
  HR_BREACH_LOW_BPM,
  SPO2_BREACH_PCT,
  computeEntityDetail,
  computeLabels,
  type EntityDetail,
  type EntityPropertiesContext,
  type LabelChips,
  type PropertyRow,
  type VitalsReading,
} from './entityProperties'
