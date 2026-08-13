'use client'

import { useState, type ReactNode, type ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_8,
  SPACE_16,
  SPACE_24,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { useDataset } from '@/features/ase/client'
import type { ExampleIntegration, GraphQLField } from '@/features/ase/services/trust'
import { focusRingStyle, useFocusRing } from '@/features/control-room'

// CONNECTIONS — the one panel where code is visible by default. Its
// audience is engineers: the GraphQL schema (asOf on every read query, per
// S3's bitemporal capability being a system property and not a UI trick),
// the live-update contract, the agent interface, and the example-
// integrations diff that makes the industry-repeatability claim checkable.
export function TrustConnections(): ReactElement {
  const { dataset } = useDataset()
  const t = dataset.trust
  const [tried, setTried] = useState(false)
  const [domainIdx, setDomainIdx] = useState(0)

  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>
        Schema {t.graphqlSchemaVersion} · last breaking change: {t.graphqlLastBreakingChange}
      </p>

      <div style={{ marginTop: SPACE_16 }}>
        <SchemaSection title="QUERIES" fields={t.graphqlQueries} />
        <SchemaSection title="MUTATIONS" fields={t.graphqlMutations} />
        <SchemaSection title="SUBSCRIPTIONS" fields={t.graphqlSubscriptions} />
      </div>

      <div style={{ marginTop: SPACE_24, padding: SPACE_16, background: PANEL, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>TRY IT</p>
        <pre className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, whiteSpace: 'pre-wrap', textTransform: 'none', letterSpacing: 'normal' }}>{t.graphqlExampleQuery}</pre>
        <RunButton done={tried} onClick={() => setTried(true)} />
        {tried && (
          <pre className="font-mono" style={{ ...TYPE_CAPTION, color: NOMINAL, marginTop: SPACE_8, whiteSpace: 'pre-wrap' }}>{t.graphqlExampleResponse}</pre>
        )}
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          Illustrative response, not a live query against a running GraphQL server — a real execution engine is a Roadmap item, see this tab&apos;s own scope
          notes.
        </p>
      </div>

      <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_24 }}>
        <Panel title="LIVE-UPDATE CONTRACT">
          <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY }}>{t.liveUpdateContract.endpoint}</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            {t.liveUpdateContract.authMethod}, {t.liveUpdateContract.tokenLifetimeMinutes}min tokens · heartbeat {t.liveUpdateContract.heartbeatIntervalSec}s
            · {t.liveUpdateContract.reconnectionStrategy}
          </p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>ENVELOPE</p>
          <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>
            {`{ type, payload, timestamp, sequence }`}
          </p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>GUARANTEES</p>
          {t.liveUpdateContract.guarantees.map((g, i) => (
            <p key={i} style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              · {g}
            </p>
          ))}
        </Panel>
        <Panel title="AGENT INTERFACE">
          <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }} className="font-mono">{t.agentInterface.healthCheck}</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }} className="font-mono">{t.agentInterface.bulkQuery}</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }} className="font-mono">{t.agentInterface.webhookRegistration}</p>
          <p style={{ ...TYPE_CAPTION, color: WATCH, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }} className="font-mono">{t.agentInterface.schemaIntrospectionEndpoint}</p>
        </Panel>
        <Panel title="VERSIONING">
          <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>
            Current {t.versioning.current} · {t.versioning.policy} · {t.versioning.deprecationNoticePeriodDays}-day deprecation notice.
          </p>
          {t.versioning.supportedVersions.map((v) => (
            <p key={v.version} className="font-mono" style={{ ...TYPE_CAPTION, color: v.status === 'deprecated' ? WATCH : TEXT_SECONDARY, marginTop: SPACE_8 }}>
              {v.version}: {v.status} until {v.until}
            </p>
          ))}
        </Panel>
        <Panel title="RATE LIMITS">
          {t.rateLimits.map((r) => (
            <p key={r.scope} className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>
              {r.scope}: {r.limit} (burst {r.burst})
            </p>
          ))}
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>Headers: {t.rateLimitHeaders.join(', ')}</p>
        </Panel>
        <Panel title="AUTH METHODS">
          {t.authMethods.map((a) => (
            <p key={a.method} style={{ ...TYPE_CAPTION, color: a.status === 'roadmap' ? WATCH : TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              {a.method} — {a.usedFor} {a.status === 'roadmap' && '(roadmap)'}
            </p>
          ))}
        </Panel>
        <Panel title="WEBHOOK CATALOG">
          {t.webhookCatalog.map((w) => (
            <p key={w.event} className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>
              {w.event} — {w.deliveryGuarantee}, {w.retryPolicy}
            </p>
          ))}
        </Panel>
        <Panel title="STREAMING">
          <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY }}>{t.streaming.topic}</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            {t.streaming.schemaFormat} · {t.streaming.retentionDays}d retention · {t.streaming.partitioning}
          </p>
        </Panel>
        <Panel title="SDKS">
          {t.sdks.map((s) => (
            <p key={s.language} className="font-mono" style={{ ...TYPE_CAPTION, color: s.coveragePct < 80 ? WATCH : TEXT_SECONDARY, marginTop: SPACE_8 }}>
              {s.language} {s.version} — {s.coveragePct}% coverage — {s.installCommand}
            </p>
          ))}
        </Panel>
        <Panel title="BREAKING CHANGES">
          {t.breakingChanges.map((b, i) => (
            <p key={i} style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              {b.version} ({b.date}): {b.change} — {b.consumersAffected} consumers affected. Migration: {b.migration}
            </p>
          ))}
        </Panel>
        <Panel title="HEALTH ENDPOINTS">
          <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY }}>{t.healthEndpoints.liveness}</p>
          <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{t.healthEndpoints.readiness}</p>
          <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{t.healthEndpoints.deep}</p>
        </Panel>
      </div>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>EXAMPLE INTEGRATIONS — THE INDUSTRY-REPEATABILITY CLAIM, MADE CHECKABLE</p>
        <div className="flex" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
          {t.exampleIntegrations.map((ex, i) => (
            <button
              key={ex.domain}
              type="button"
              onClick={() => setDomainIdx(i)}
              className="pressable"
              style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color: domainIdx === i ? TEXT_PRIMARY : TEXT_SECONDARY, background: domainIdx === i ? HAIRLINE : 'transparent', border: `${BORDER_WIDTH}px solid ${domainIdx === i ? TEXT_SECONDARY : HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: `${SPACE_8}px ${SPACE_16}px` }}
            >
              {ex.domain}
            </button>
          ))}
        </div>
        <IntegrationDiff domain={t.exampleIntegrations[domainIdx]} />
      </div>
    </div>
  )
}

function SchemaSection({ title, fields }: { title: string; fields: GraphQLField[] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div style={{ marginBottom: SPACE_16 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{title}</p>
      {fields.map((f) => (
        <div key={f.name} style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
          <button
            type="button"
            onClick={() => setOpen((n) => (n === f.name ? null : f.name))}
            className="pressable flex items-center justify-between"
            style={{ width: '100%', textAlign: 'left', padding: SPACE_8 }}
          >
            <span className="font-mono" style={{ ...TYPE_CAPTION, color: NOMINAL }}>
              {f.name}
            </span>
            <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
              {f.type}
              {f.hasAsOf && <span style={{ color: TEXT_SECONDARY }}> · asOf</span>}
            </span>
          </button>
          {open === f.name && (
            <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, padding: `0 ${SPACE_8}px ${SPACE_8}px`, textTransform: 'none', letterSpacing: 'normal' }}>
              resolver: {f.resolver} · data source: {f.dataSource} · budget: {f.performanceBudgetMs}ms
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function IntegrationDiff({ domain }: { domain: ExampleIntegration }) {
  return (
    <div style={{ marginTop: SPACE_16, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <th style={{ ...TYPE_CAPTION, color: TEXT_DIM, textAlign: 'left', padding: SPACE_8 }}>FIELD</th>
            <th style={{ ...TYPE_CAPTION, color: TEXT_DIM, textAlign: 'left', padding: SPACE_8 }}>{domain.changedFrom.toUpperCase()}</th>
            <th style={{ ...TYPE_CAPTION, color: TEXT_DIM, textAlign: 'left', padding: SPACE_8 }}>{domain.domain.toUpperCase()}</th>
          </tr>
        </thead>
        <tbody>
          {domain.changes.map((c) => {
            const unchanged = c.expedition === c.thisDomain
            return (
              <tr key={c.field} style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
                <td style={{ ...TYPE_BODY, color: TEXT_PRIMARY, padding: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{c.field}</td>
                <td style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, padding: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{c.expedition}</td>
                <td style={{ ...TYPE_CAPTION, color: unchanged ? TEXT_DIM : ANOMALY, padding: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{c.thisDomain}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        Rows in red changed. The engine row never does — that&apos;s the schema staying identical across domains, not asserted, shown.
      </p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{title}</p>
      <div style={{ marginTop: SPACE_8 }}>{children}</div>
    </div>
  )
}

function RunButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      disabled={done}
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color: done ? TEXT_DIM : NOMINAL, border: `${BORDER_WIDTH}px solid ${done ? HAIRLINE : NOMINAL}`, borderRadius: RADIUS_INTERACTIVE, padding: `${SPACE_8}px ${SPACE_16}px`, marginTop: SPACE_8, ...focusRingStyle(focused) }}
    >
      {done ? 'RESPONSE BELOW' : 'RUN THIS QUERY'}
    </button>
  )
}
