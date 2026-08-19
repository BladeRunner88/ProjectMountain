"use client"

// S8.5N: THE DETAIL PANEL — rebuilt as a PERSISTENT 380px panel (not the
// S8.9 slide-in card): "not a floating card... always present." Lives as a
// real flex sibling of the canvas in GraphNext.tsx now, not an absolutely-
// positioned overlay, so it never draws over content and the canvas's own
// ResizeObserver picks up the narrower width automatically.
//
// One uniform shape for every kind (country/plant/line/operator/machine/
// sensor/record) — HEADER, IDENTIFIERS, PROPERTIES, SUMMARY, ATTACHED
// RECORDS, STRUCTURE, LABELS, ACTIONS, always in this order. Per-kind
// content (the property rows, the written summary) comes from
// graph/entityProperties.ts, which is what actually varies by kind — this
// file is just the one shape everything renders through.
//
// The panel owns no timers of its own: LIVE values read readingsStore.ts
// (machines) and environmentStore.ts (plants/sensors), each of which owns
// its own interval; this component only ever calls
// readingsStore.setActiveMachine() on mount/selection-change/unmount, the
// same reset-on-switch discipline S8.9 established. It does NOT start/stop
// environmentStore itself — NetworkView already owns that lifecycle, and
// starting a second interval here would double-own it. If the store isn't
// currently running (NETWORK unmounted, viewing STRATA/TERRAIN instead),
// readings simply stay at whatever they last were — a disclosed, honest
// degrade rather than a second ticking clock.

import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react"
import type { Route } from "next"
import Link from "next/link"
import { useClientNow } from "@/hooks/use-client"
import { graphStore } from "../stores/graphStore"
import { getGraphDataset } from "../services/currentDataset"
import {
  buildLineProfiles,
  buildMachinePlacements,
} from "../services/terrainProfile"
import { buildMachineProfiles } from "../services/machineProfile"
import { buildColorResolver } from "../services/color"
import {
  computeEntityDetail,
  computeLabels,
  type EntityDetail,
  type LabelChips,
  type PropertyRow,
} from "../services/entityProperties"
import {
  computeRecentRecords,
  computeRecordCounts,
} from "../services/attachedRecords"
import { computeWatchIds } from "../services/watchStatus"
import { serialFor, fullSerialFor } from "../services/serial"
import { readingsStore, type ReadingsTrend } from "../stores/readingsStore"
import { environmentStore } from "../stores/environmentStore"
import {
  ANOMALY,
  BADGE_PADDING_V,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  SPACE_8,
  SPACE_16,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from "@/features/ase/tokens"
import type { DomainEntity, SubNode } from "../types/domain"
import type { GraphId } from "../types/graph"
import { once } from "../services/once"

export const PANEL_WIDTH_PX = 380
const RECENT_RECORDS_LIMIT = 6
const STRUCTURE_CHILDREN_LIMIT = 20

// -- data derived once, module scope, same pattern every other graph view uses --
const LINE_PROFILES = once(() => buildLineProfiles(getGraphDataset()!))
const MACHINE_PLACEMENTS = once(() =>
  buildMachinePlacements(getGraphDataset()!, LINE_PROFILES())
)
const MACHINE_PROFILES = once(() =>
  buildMachineProfiles(
    getGraphDataset()!,
    MACHINE_PLACEMENTS(),
    LINE_PROFILES()
  )
)
const COLORS = once(() => buildColorResolver(getGraphDataset()!))
const ENTITY_BY_ID = once(
  () => new Map(getGraphDataset()!.domainEntities.map((e) => [e.id, e]))
)
const SUBNODE_BY_ID = once(
  () => new Map(getGraphDataset()!.subNodes.map((s) => [s.id, s]))
)
const WATCH_IDS = once(() => computeWatchIds(getGraphDataset()!))

function controlRoomMachineId(graphMachineId: GraphId): string | null {
  // The ONE guaranteed-accurate cross-link: the worked-example machine is machine
  // index 0 in both systems (S8.3's deliberate alignment), and ase/
  // dataset.ts's machines are 1-indexed (`machine-${i+1}`). Every other
  // graph machine has no real Control Room counterpart, so this
  // deliberately returns null rather than guessing an unrelated record.
  return graphMachineId === "machine-0" ? "machine-1" : null
}

function trendFor(
  entity: DomainEntity,
  watchIds: ReadonlySet<GraphId>
): ReadingsTrend {
  if (entity.status === "anomaly") return "anomaly"
  if (watchIds.has(entity.id)) return "watch"
  return "nominal"
}

function statusColor(trend: ReadingsTrend): string {
  return trend === "anomaly" ? ANOMALY : trend === "watch" ? WATCH : NOMINAL
}

function formatAgo(ts: number, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - ts) / 60000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function firstLastSeen(parentId: GraphId): {
  first: number | null
  last: number | null
} {
  let first: number | null = null
  let last: number | null = null
  for (const s of getGraphDataset()!.subNodes) {
    if (s.parentId !== parentId) continue
    if (first === null || s.ts < first) first = s.ts
    if (last === null || s.ts > last) last = s.ts
  }
  return { first, last }
}

function controlRoomHref(entity: DomainEntity | undefined): Route {
  if (entity?.tier === "machine") {
    const id = controlRoomMachineId(entity.id)
    return id
      ? `/app/control-room/identity?machineId=${id}`
      : "/app/control-room/identity"
  }
  return "/app/control-room/identity"
}

export function InvestigationPanel(): ReactElement {
  const snapshot = useSyncExternalStore(
    graphStore.subscribe,
    graphStore.getSnapshot,
    graphStore.getServerSnapshot
  )
  const selectedId = snapshot.selection

  const entity = selectedId ? ENTITY_BY_ID().get(selectedId) : undefined
  const sub =
    !entity && selectedId ? SUBNODE_BY_ID().get(selectedId) : undefined

  // -- LIVE: hand the readings store the currently-selected machine, never a
  // timer of our own. Resets on every dependency change's cleanup — a
  // plain entity switch, a switch to a non-machine, or unmount all take
  // the same path, so nothing here can leak a previous person's readings.
  useEffect(() => {
    if (entity?.tier === "machine") {
      readingsStore.setActiveMachine(entity.id, trendFor(entity, WATCH_IDS()))
    }
    return () => readingsStore.setActiveMachine(null, "nominal")
  }, [entity])
  const readings = useSyncExternalStore(
    readingsStore.subscribe,
    readingsStore.getSnapshot,
    readingsStore.getServerSnapshot
  )
  const environmentSnapshot = useSyncExternalStore(
    environmentStore.subscribe,
    environmentStore.getSnapshot,
    environmentStore.getServerSnapshot
  )
  const now = useClientNow()
  const nowMs = now ? now.getTime() : 0

  const detail: EntityDetail | null = useMemo(() => {
    if (!selectedId) return null
    const ready =
      readings.machineId &&
      readings.oee.length > 0 &&
      readings.vibration.length > 0
    return computeEntityDetail(
      getGraphDataset()!,
      selectedId,
      {
        environmentReadings: environmentSnapshot.readings,
        lineProfiles: LINE_PROFILES(),
        machinePlacements: MACHINE_PLACEMENTS(),
        machineProfiles: MACHINE_PROFILES(),
        activeReadings: ready
          ? {
              machineId: readings.machineId!,
              reading: {
                oee: readings.oee[readings.oee.length - 1],
                vibration: readings.vibration[readings.vibration.length - 1],
              },
            }
          : null,
      },
      nowMs
    )
  }, [selectedId, readings, environmentSnapshot, nowMs])

  const labels: LabelChips | null = useMemo(
    () => (selectedId ? computeLabels(getGraphDataset()!, selectedId) : null),
    [selectedId]
  )

  if (!selectedId) {
    return (
      <PanelShell>
        <div style={{ padding: SPACE_16 }}>
          <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>
            Select anything in the graph.
          </p>
        </div>
      </PanelShell>
    )
  }

  if (!entity && !sub) {
    return (
      <PanelShell>
        <div style={{ padding: SPACE_16 }}>
          <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
            No longer in view.
          </p>
          <p
            style={{
              ...TYPE_CAPTION,
              color: TEXT_DIM,
              marginTop: SPACE_8,
              textTransform: "none",
              letterSpacing: "normal",
            }}
          >
            This selection no longer resolves to anything in the current
            dataset.
          </p>
          <ActionButton
            onClick={() => graphStore.setSelection(null)}
            style={{ marginTop: SPACE_16 }}
          >
            CLEAR SELECTION
          </ActionButton>
        </div>
      </PanelShell>
    )
  }

  if (!detail || !labels) return <PanelShell>{null}</PanelShell>

  if (entity) {
    const seen = firstLastSeen(entity.id)
    const color = COLORS().colorFor(entity.id)
    const trend = trendFor(entity, WATCH_IDS())
    return (
      <PanelShell>
        <Header
          name={entity.label}
          serial={serialFor(entity.id)}
          kindLabel={entity.tier.toUpperCase()}
          kindColor={color}
          statusLabel={trend.toUpperCase()}
          statusColor={statusColor(trend)}
        />
        <Identifiers
          fullSerial={fullSerialFor(entity.id)}
          internalId={entity.id}
          firstSeenTs={seen.first}
          lastUpdatedTs={seen.last}
          nowMs={nowMs}
        />
        <Properties rows={detail.rows} />
        <Summary text={detail.summary} />
        <AttachedRecordsSection parentId={entity.id} nowMs={nowMs} />
        <StructureSection entity={entity} />
        <LabelsSection labels={labels} />
        <ActionsSection
          onFocus={() => {
            if (snapshot.viewMode !== "network")
              graphStore.setViewMode("network")
            graphStore.requestFocus(entity.id)
          }}
          controlRoomHref={controlRoomHref(entity)}
          caveat={
            entity.tier === "machine" && !controlRoomMachineId(entity.id)
              ? "The Control Room's own register is generated independently (S8.3) — this opens Identity, but only the worked-example machine resolves to the same record on both sides."
              : undefined
          }
        />
      </PanelShell>
    )
  }

  // sub-node (a RECORD)
  const record = sub!
  const parent = ENTITY_BY_ID().get(record.parentId)
  const color = COLORS().colorFor(record.id)
  return (
    <PanelShell>
      <Header
        name={record.summary}
        serial={serialFor(record.id)}
        kindLabel="RECORD"
        kindColor={color}
        statusLabel={record.status.toUpperCase()}
        statusColor={record.status === "alert" ? ANOMALY : NOMINAL}
      />
      <Identifiers
        fullSerial={fullSerialFor(record.id)}
        internalId={record.id}
        firstSeenTs={record.ts}
        lastUpdatedTs={record.ts}
        nowMs={nowMs}
      />
      <Properties rows={detail.rows} />
      <Summary text={detail.summary} />
      <StructureSection parentOnly={parent} />
      <LabelsSection labels={labels} />
      <ActionsSection
        onFocus={() => {
          if (!parent) return
          if (snapshot.viewMode !== "network") graphStore.setViewMode("network")
          graphStore.requestFocus(parent.id)
        }}
        controlRoomHref="/app/control-room/identity"
      />
    </PanelShell>
  )
}

// -- shell: a real flex column filling its parent, no slide/position of its own --

function PanelShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-full w-full flex-col overflow-y-auto"
      style={{
        background: PANEL,
        borderLeft: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
      }}
    >
      {children}
    </div>
  )
}

function Header({
  name,
  serial,
  kindLabel,
  kindColor,
  statusLabel,
  statusColor,
}: {
  name: string
  serial: string
  kindLabel: string
  kindColor: string
  statusLabel: string
  statusColor: string
}) {
  return (
    <div
      style={{
        padding: SPACE_16,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
      }}
    >
      <div
        className="flex items-start justify-between"
        style={{ gap: SPACE_8 }}
      >
        <div
          className="flex items-center"
          style={{ gap: SPACE_8, flexWrap: "wrap" }}
        >
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, fontWeight: 600 }}>
            {name}
          </p>
          <span
            className="font-mono"
            style={{ ...TYPE_CAPTION, color: TEXT_DIM }}
          >
            {serial}
          </span>
        </div>
        <button
          type="button"
          onClick={() => graphStore.setSelection(null)}
          className="pressable font-mono"
          style={{
            fontSize: 16,
            color: TEXT_DIM,
            background: "transparent",
            border: "none",
            lineHeight: 1,
            padding: 4,
            flexShrink: 0,
          }}
          aria-label="Clear selection"
        >
          ×
        </button>
      </div>
      <div
        className="flex items-center"
        style={{ gap: SPACE_8, marginTop: SPACE_8, flexWrap: "wrap" }}
      >
        <Chip label={kindLabel} color={kindColor} />
        <span
          className="font-mono"
          style={{ ...TYPE_CAPTION, color: statusColor }}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  )
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="font-mono"
      style={{
        ...TYPE_CAPTION,
        color,
        background: PANEL_RAISED,
        border: `${BORDER_WIDTH}px solid ${color}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${BADGE_PADDING_V}px ${SPACE_8}px`,
      }}
    >
      {label}
    </span>
  )
}

function Section({
  heading,
  children,
}: {
  heading: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        padding: SPACE_16,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
      }}
    >
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{heading}</p>
      <div style={{ marginTop: SPACE_8 }}>{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string
  value: ReactNode
  valueColor?: string
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        paddingTop: SPACE_8,
        paddingBottom: SPACE_8,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        gap: SPACE_8,
      }}
    >
      <span
        style={{
          ...TYPE_CAPTION,
          color: TEXT_DIM,
          textTransform: "none",
          letterSpacing: "normal",
        }}
      >
        {label}
      </span>
      <span
        style={{
          ...TYPE_BODY,
          color: valueColor ?? TEXT_PRIMARY,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  )
}

function ActionButton({
  onClick,
  children,
  style,
}: {
  onClick: () => void
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable font-mono"
      style={{
        ...TYPE_CAPTION,
        color: TEXT_PRIMARY,
        border: `${BORDER_WIDTH}px solid ${TEXT_SECONDARY}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        background: "transparent",
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function ClickableRow({
  label,
  sub,
  onClick,
}: {
  label: string
  sub?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable-row flex w-full items-center justify-between"
      style={{
        paddingTop: SPACE_8,
        paddingBottom: SPACE_8,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        background: "transparent",
        border: "none",
        textAlign: "left",
        gap: SPACE_8,
      }}
    >
      <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{label}</span>
      {sub && (
        <span
          style={{
            ...TYPE_CAPTION,
            color: TEXT_DIM,
            textTransform: "none",
            letterSpacing: "normal",
            flexShrink: 0,
          }}
        >
          {sub}
        </span>
      )}
    </button>
  )
}

// -- sections ----------------------------------------------------------------

function Identifiers({
  fullSerial,
  internalId,
  firstSeenTs,
  lastUpdatedTs,
  nowMs,
}: {
  fullSerial: string
  internalId: GraphId
  firstSeenTs: number | null
  lastUpdatedTs: number | null
  nowMs: number
}) {
  return (
    <Section heading="IDENTIFIERS">
      <Row
        label="Serial"
        value={<span className="font-mono">{fullSerial}</span>}
      />
      <Row
        label="Internal id"
        value={
          <span className="font-mono" style={{ color: TEXT_DIM }}>
            {internalId}
          </span>
        }
      />
      <Row
        label="First seen"
        value={firstSeenTs !== null ? formatAgo(firstSeenTs, nowMs) : "—"}
      />
      <Row
        label="Last updated"
        value={lastUpdatedTs !== null ? formatAgo(lastUpdatedTs, nowMs) : "—"}
      />
    </Section>
  )
}

/** "Live values update in place with a 200ms cross-fade" — reuses index.css's own `.value-fade` (S9.1h's Control Room animation), keyed by the value text so a changed reading remounts the span and replays the fade. A breaching value renders red with its threshold beside it. */
function Properties({ rows }: { rows: PropertyRow[] }) {
  return (
    <Section heading="PROPERTIES">
      {rows.map((row) => (
        <Row
          key={row.label}
          label={row.label}
          value={
            <span key={row.value} className="value-fade">
              {row.value}
              {row.breaching && row.threshold && (
                <span
                  style={{
                    ...TYPE_CAPTION,
                    color: TEXT_DIM,
                    marginLeft: SPACE_8,
                    textTransform: "none",
                    letterSpacing: "normal",
                  }}
                >
                  {" "}
                  ({row.threshold})
                </span>
              )}
            </span>
          }
          valueColor={row.breaching ? ANOMALY : undefined}
        />
      ))}
    </Section>
  )
}

function Summary({ text }: { text: string }) {
  return (
    <Section heading="SUMMARY">
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, lineHeight: 1.5 }}>
        {text}
      </p>
    </Section>
  )
}

function AttachedRecordsSection({
  parentId,
  nowMs,
}: {
  parentId: GraphId
  nowMs: number
}) {
  const counts = useMemo(
    () => computeRecordCounts(getGraphDataset()!, parentId),
    [parentId]
  )
  const recent = useMemo(
    () =>
      computeRecentRecords(getGraphDataset()!, parentId, RECENT_RECORDS_LIMIT),
    [parentId]
  )
  const total = counts.reduce((sum, c) => sum + c.count, 0)

  return (
    <Section heading={`ATTACHED RECORDS — ${total}`}>
      <div
        className="flex flex-wrap"
        style={{ gap: SPACE_8, marginBottom: SPACE_8 }}
      >
        {counts.map((c) => (
          <span
            key={c.kind}
            className="font-mono"
            style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY }}
          >
            {c.kind.toUpperCase()} {c.count}
          </span>
        ))}
      </div>
      {recent.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No attached records.</p>
      ) : (
        recent.map((r: SubNode) => (
          <ClickableRow
            key={r.id}
            label={r.summary}
            sub={formatAgo(r.ts, nowMs)}
            onClick={() => graphStore.setHover(r.id)}
          />
        ))
      )}
    </Section>
  )
}

function StructureSection({
  entity,
  parentOnly,
}: {
  entity?: DomainEntity
  parentOnly?: DomainEntity
}) {
  if (!entity) {
    // a record's own "structure" is just its one parent entity
    return (
      <Section heading="STRUCTURE">
        {parentOnly ? (
          <ClickableRow
            label={parentOnly.label}
            sub="PARENT"
            onClick={() => graphStore.setSelection(parentOnly.id)}
          />
        ) : (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No parent.</p>
        )}
      </Section>
    )
  }
  const ancestors: DomainEntity[] = []
  let current = entity.parentId
    ? ENTITY_BY_ID().get(entity.parentId)
    : undefined
  while (current) {
    ancestors.push(current)
    current = current.parentId
      ? ENTITY_BY_ID().get(current.parentId)
      : undefined
  }
  const children = getGraphDataset()!.domainEntities.filter(
    (e) => e.parentId === entity.id
  )
  return (
    <Section heading="STRUCTURE">
      {ancestors.map((a) => (
        <ClickableRow
          key={a.id}
          label={a.label}
          sub={a.tier.toUpperCase()}
          onClick={() => graphStore.setSelection(a.id)}
        />
      ))}
      {children.slice(0, STRUCTURE_CHILDREN_LIMIT).map((c) => (
        <ClickableRow
          key={c.id}
          label={c.label}
          sub={c.tier.toUpperCase()}
          onClick={() => graphStore.setSelection(c.id)}
        />
      ))}
      {children.length > STRUCTURE_CHILDREN_LIMIT && (
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>
          +{children.length - STRUCTURE_CHILDREN_LIMIT} more
        </p>
      )}
      {ancestors.length === 0 && children.length === 0 && (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>
          Nothing above or below this entity.
        </p>
      )}
    </Section>
  )
}

function LabelsSection({ labels }: { labels: LabelChips }) {
  const chips = [
    labels.kind.toUpperCase(),
    labels.country,
    labels.status.toUpperCase(),
    ...labels.tags.map((t) => t.toUpperCase()),
  ].filter((c): c is string => Boolean(c))
  return (
    <Section heading="LABELS">
      <div className="flex flex-wrap" style={{ gap: SPACE_8 }}>
        {chips.map((c) => (
          <Chip key={c} label={c} color={TEXT_SECONDARY} />
        ))}
      </div>
    </Section>
  )
}

function ActionLink({
  href,
  children,
}: {
  href: Route
  children: ReactNode
}): ReactElement {
  return (
    <Link
      href={href}
      className="pressable font-mono"
      style={{
        ...TYPE_CAPTION,
        color: TEXT_PRIMARY,
        border: `${BORDER_WIDTH}px solid ${TEXT_SECONDARY}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        background: "transparent",
        textDecoration: "none",
        display: "inline-block",
      }}
    >
      {children}
    </Link>
  )
}

function ActionsSection({
  onFocus,
  controlRoomHref,
  caveat,
}: {
  onFocus: () => void
  controlRoomHref: Route
  caveat?: string
}): ReactElement {
  return (
    <div style={{ padding: SPACE_16 }}>
      <div className="flex" style={{ gap: SPACE_8 }}>
        <ActionButton onClick={onFocus}>FOCUS</ActionButton>
        <ActionLink href={controlRoomHref}>OPEN IN CONTROL ROOM</ActionLink>
      </div>
      {caveat && (
        <p
          style={{
            ...TYPE_CAPTION,
            color: TEXT_DIM,
            marginTop: SPACE_8,
            textTransform: "none",
            letterSpacing: "normal",
          }}
        >
          {caveat}
        </p>
      )}
    </div>
  )
}
