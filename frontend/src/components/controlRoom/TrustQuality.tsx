import { useNavigate } from 'react-router-dom'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
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
  TYPE_DISPLAY,
  WATCH,
} from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import { coverageAreaStatus, type CoverageStatus } from '../../ase/trust'

const COVERAGE_COLOR: Record<CoverageStatus, string> = { good: NOMINAL, amber: WATCH, red: ANOMALY }
const TREND_ARROW: Record<'up' | 'down' | 'flat', string> = { up: '↑', down: '↓', flat: '→' }
const TREND_COLOR: Record<'up' | 'down' | 'flat', string> = { up: NOMINAL, down: ANOMALY, flat: TEXT_DIM }

// QUALITY — test health, coverage by area (with trend — Trust's OWN row is
// deliberately the lowest, not hidden), the ten PRODUCT questions (kept
// separate from 9.5's domain questions on Model), flaky tests, and six
// smaller panels.
export function TrustQuality() {
  const { dataset } = useDataset()
  const navigate = useNavigate()
  const t = dataset.trust
  const th = t.testHealth
  const trustRow = t.coverageByArea.find((r) => r.area === 'Trust')!
  const lowestPct = Math.min(...t.coverageByArea.filter((r) => r.tests > 0).map((r) => r.coveragePct))
  const trustIsLowest = trustRow.coveragePct === lowestPct

  return (
    <div>
      <div className="grid grid-cols-4" style={{ gap: SPACE_16 }}>
        <Stat label="TOTAL / PASSING" value={`${th.total} / ${th.passing}`} />
        <Stat label="FAILING" value={String(th.failing)} color={th.failing > 0 ? ANOMALY : undefined} />
        <Stat label="QUARANTINED FLAKY" value={String(th.quarantinedFlaky)} color={WATCH} />
        <Stat label="CI ON MAIN" value={th.ciStatusOnMain.toUpperCase()} color={th.ciStatusOnMain === 'green' ? NOMINAL : WATCH} />
      </div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        Last full run {new Date(th.lastFullRunAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}, {th.lastFullRunDurationSec}s.{' '}
        {th.lastFailureOnMain && `Last failure on main ${new Date(th.lastFailureOnMain.at).toLocaleDateString()}, fixed in ${th.lastFailureOnMain.fixedAfterMinutes} minutes.`}
      </p>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>COVERAGE BY AREA</p>
        <div style={{ marginTop: SPACE_8, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
                {['AREA', 'TESTS', 'COVERAGE', 'STATUS', 'TREND'].map((h) => (
                  <th key={h} style={{ ...TYPE_CAPTION, color: TEXT_DIM, textAlign: 'left', padding: SPACE_8 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.coverageByArea.map((row) => {
                const status = coverageAreaStatus(row)
                const isTrust = row.area === 'Trust'
                return (
                  <tr key={row.area} style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, background: isTrust ? PANEL_RAISED : undefined }}>
                    <td style={{ ...TYPE_BODY, color: TEXT_PRIMARY, padding: SPACE_8 }}>
                      {row.area}
                      {isTrust && trustIsLowest && <span style={{ ...TYPE_CAPTION, color: WATCH }}> — lowest, on purpose: see below</span>}
                    </td>
                    <td className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, padding: SPACE_8 }}>
                      {row.tests}
                    </td>
                    <td className="font-mono" style={{ ...TYPE_BODY, color: COVERAGE_COLOR[status], padding: SPACE_8 }}>
                      {row.coveragePct}%
                    </td>
                    <td style={{ padding: SPACE_8 }}>
                      <span style={{ ...TYPE_CAPTION, color: COVERAGE_COLOR[status] }}>{status.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: SPACE_8 }}>
                      <span style={{ color: TREND_COLOR[row.trend] }}>{TREND_ARROW[row.trend]}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          Below 80% renders amber, below 60% renders red — neither is hidden. Trust's own coverage is the lowest on this list. It always is: this tab is
          new, plain-language and mostly reference data, and pretending otherwise is the exact failure this tab exists to avoid.
        </p>
      </div>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>PRODUCT QUESTIONS — DISTINCT FROM MODEL'S DOMAIN QUESTIONS (S9.5)</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          The Model tab's ten domain questions ask what ASE can answer about the world. These ask whether the system itself is defensible.{' '}
          {t.productQuestions.filter((q) => q.status === 'answered').length} answered, {t.productQuestions.filter((q) => q.status === 'partial').length}{' '}
          partial — said plainly, not hidden.
        </p>
        <div style={{ marginTop: SPACE_8 }}>
          {t.productQuestions.map((q) => (
            <div key={q.id} className="flex items-center justify-between" style={{ padding: SPACE_8, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
              <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal', flex: 2 }}>{q.question}</span>
              <span style={{ ...TYPE_CAPTION, color: q.status === 'answered' ? NOMINAL : WATCH, width: 80 }}>{q.status === 'answered' ? 'ANSWERED' : 'PARTIAL'}</span>
              <button
                type="button"
                onClick={() => q.evidenceTabId && navigate(`/app/control-room/${q.evidenceTabId}`)}
                className="pressable"
                style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textDecoration: 'underline', textTransform: 'none', letterSpacing: 'normal', flex: 1.4, textAlign: 'right' }}
              >
                {q.evidenceLabel}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>FLAKY TESTS</p>
        {t.flakyTests.map((f) => (
          <div key={f.id} style={{ padding: SPACE_16, marginTop: SPACE_8, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal' }}>{f.test}</p>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>
              {f.area} · {f.failureRatePct}% failure rate · quarantined since {f.quarantinedSince} · {f.owner}
            </p>
            <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{f.plan}</p>
          </div>
        ))}
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          {t.flakyTotalCount - t.flakyTests.length} more quarantined. {t.flakyQuarantinePolicy}
        </p>
      </div>

      <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_24 }}>
        <Panel title="TEST PYRAMID">
          {t.testPyramid.map((row) => (
            <p key={row.layer} className="font-mono" style={{ ...TYPE_CAPTION, color: row.passRatePct < 95 ? WATCH : TEXT_SECONDARY, marginTop: SPACE_8 }}>
              {row.layer}: {row.count} tests, {row.passRatePct}% pass
            </p>
          ))}
        </Panel>
        <Panel title="ENVIRONMENTS">
          {t.environments.map((e) => (
            <p key={e.env} className="font-mono" style={{ ...TYPE_CAPTION, color: e.result === 'pass' ? TEXT_SECONDARY : ANOMALY, marginTop: SPACE_8 }}>
              {e.env}: {e.result} ({new Date(e.lastRun).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })})
            </p>
          ))}
        </Panel>
        <Panel title="PIPELINE HEALTH">
          <div className="flex flex-wrap items-center" style={{ gap: SPACE_8 }}>
            {t.pipelineHealth.map((p, i) => (
              <span key={p.stage} className="flex items-center" style={{ gap: SPACE_8 }}>
                <span style={{ ...TYPE_CAPTION, color: p.status === 'green' ? NOMINAL : p.status === 'amber' ? WATCH : ANOMALY, border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: `1px ${SPACE_8}px` }}>
                  {p.stage}
                </span>
                {i < t.pipelineHealth.length - 1 && <span style={{ color: TEXT_DIM }}>→</span>}
              </span>
            ))}
          </div>
        </Panel>
        <Panel title="REGRESSION SUITE">
          {t.regressionSuiteNames.map((n, i) => (
            <p key={i} style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              · {n}
            </p>
          ))}
        </Panel>
        <Panel title="COVERAGE HEATMAP">
          <div className="flex flex-wrap" style={{ gap: 3 }}>
            {t.coverageByArea.map((row) => (
              <span key={row.area} title={`${row.area}: ${row.coveragePct}%`} style={{ width: 18, height: 18, background: COVERAGE_COLOR[coverageAreaStatus(row)], opacity: 0.7, display: 'inline-block' }} />
            ))}
          </div>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>One block per area, hover for the figure. Click-through to uncovered lines is a Roadmap item, not yet built.</p>
        </Panel>
        <Panel title="TEST DEBT">
          {t.testDebtTrend.map((d) => (
            <p key={d.month} className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>
              {d.month}: {d.quarantinedTestDays} test-days (+{d.newlyQuarantined} / -{d.fixedOrDeleted})
            </p>
          ))}
          <p style={{ ...TYPE_CAPTION, color: WATCH, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>Trending up — honest, not hidden.</p>
        </Panel>
      </div>

      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
        {t.propertyTestCount} property-based tests · mutation score {t.mutationScore.scorePct}%, {t.mutationScore.survivingMutants} surviving mutants
        (weak assertions to strengthen, not missing tests).
      </p>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</p>
      <p className="font-mono" style={{ ...TYPE_DISPLAY, color: color ?? TEXT_PRIMARY, marginTop: SPACE_8, fontSize: 22 }}>
        {value}
      </p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{title}</p>
      <div style={{ marginTop: SPACE_8 }}>{children}</div>
    </div>
  )
}
