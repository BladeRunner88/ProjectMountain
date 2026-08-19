'use client'

import { useState, type ReactNode, type ReactElement } from 'react'
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
} from '@/features/ase/tokens'
import { useDataset } from '@/features/ase/client'
import { securityPosture, ACCESS_LEVEL_LABEL, type SecurityFinding, type Severity } from '@/features/ase/services/trust'

const SEVERITY_COLOR: Record<Severity, string> = { high: ANOMALY, medium: WATCH, low: TEXT_SECONDARY }

// SECURITY — posture header computed live from the findings array (never a
// hand-typed count beside it), full finding detail including "why it is
// still open" and "blocked by", the access matrix, residency/encryption,
// and the six smaller panels the spec calls for, all short.
export function TrustSecurity(): ReactElement {
  const { dataset } = useDataset()
  const t = dataset.trust
  const posture = securityPosture(t.securityFindings)
  const [openId, setOpenId] = useState<string | null>(t.securityFindings.find((f) => f.severity === 'high')?.id ?? null)

  return (
    <div>
      <div className="grid grid-cols-4" style={{ gap: SPACE_16 }}>
        <Stat label="POSTURE" value={posture.level.toUpperCase()} color={posture.level === 'amber' ? WATCH : NOMINAL} />
        <Stat label="OPEN FINDINGS" value={String(posture.openCount)} color={posture.openCount > 0 ? WATCH : undefined} />
        <Stat label="HIGH SEVERITY" value={String(posture.highCount)} color={posture.highCount > 0 ? ANOMALY : undefined} />
        <Stat label="LAST PEN TEST" value="2026-06-10" />
      </div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        Last penetration test report: pentest-2026-06.pdf (placeholder link) · last review 2026-07-01 · next scheduled review 2026-10-01.
      </p>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>FINDINGS</p>
        <div style={{ marginTop: SPACE_8, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
                {['ID', 'FINDING', 'SEVERITY', 'STATUS', 'OPENED', 'OWNER', 'ETA'].map((h) => (
                  <th key={h} style={{ ...TYPE_CAPTION, color: TEXT_DIM, textAlign: 'left', padding: SPACE_8 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.securityFindings.map((f) => (
                <tr key={f.id} onClick={() => setOpenId((id) => (id === f.id ? null : f.id))} style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, cursor: 'pointer', opacity: f.status === 'closed' ? 0.6 : 1 }}>
                  <td className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM, padding: SPACE_8 }}>
                    {f.id}
                  </td>
                  <td style={{ ...TYPE_BODY, color: TEXT_PRIMARY, padding: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{f.finding}</td>
                  <td style={{ padding: SPACE_8 }}>
                    <span style={{ ...TYPE_CAPTION, color: SEVERITY_COLOR[f.severity] }}>{f.severity.toUpperCase()}</span>
                  </td>
                  <td style={{ padding: SPACE_8 }}>
                    <span style={{ ...TYPE_CAPTION, color: f.status === 'open' ? WATCH : NOMINAL }}>{f.status.toUpperCase()}</span>
                  </td>
                  <td className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM, padding: SPACE_8 }}>
                    {f.opened}
                  </td>
                  <td style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, padding: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{f.owner}</td>
                  <td className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM, padding: SPACE_8 }}>
                    {f.eta ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {openId && <FindingDetail finding={t.securityFindings.find((f) => f.id === openId)!} />}
      </div>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ACCESS CONTROL MATRIX — ROLE BY TAB</p>
        <div style={{ marginTop: SPACE_8, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
                <th style={{ ...TYPE_CAPTION, color: TEXT_DIM, textAlign: 'left', padding: SPACE_8 }}>ROLE</th>
                {t.accessMatrixTabs.map((tabId) => (
                  <th key={tabId} style={{ ...TYPE_CAPTION, color: TEXT_DIM, textAlign: 'center', padding: SPACE_8 }}>
                    {tabId.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(t.accessMatrix) as (keyof typeof t.accessMatrix)[]).map((role) => (
                <tr key={role} style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
                  <td style={{ ...TYPE_BODY, color: TEXT_PRIMARY, padding: SPACE_8, textTransform: 'capitalize' }}>{role}</td>
                  {t.accessMatrixTabs.map((tabId) => (
                    <td key={tabId} className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, padding: SPACE_8, textAlign: 'center' }}>
                      {ACCESS_LEVEL_LABEL[t.accessMatrix[role][tabId] ?? 'none']}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>&quot;team&quot; means limited to their assigned rope group.</p>
      </div>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DATA RESIDENCY AND ENCRYPTION, BY DATA CLASS</p>
        {t.dataResidency.map((r) => (
          <div key={r.dataClass} style={{ padding: SPACE_16, marginTop: SPACE_8, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{r.dataClass}</p>
            <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              Primary: {r.primaryPlant} · Backup: {r.backupPlant} · {r.encryptedAtRest ? 'encrypted at rest' : 'NOT encrypted at rest'} ·{' '}
              {r.encryptedInTransit ? 'encrypted in transit' : 'NOT encrypted in transit'}
            </p>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{r.note}</p>
          </div>
        ))}
        <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          Key management: {t.keyManagement.provider} · rotated every {t.keyManagement.rotationPeriodDays} days (last {t.keyManagement.lastRotation}) ·{' '}
          {t.keyManagement.accessThreshold}
        </p>
      </div>

      <div className="grid grid-cols-2" style={{ gap: SPACE_16, marginTop: SPACE_24 }}>
        <Panel title="DATA FLOW">
          <div className="flex flex-wrap items-center" style={{ gap: SPACE_8 }}>
            {t.dataFlow.map((step, i) => (
              <span key={step.id} className="flex items-center" style={{ gap: SPACE_8 }}>
                <span style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: `1px ${SPACE_8}px`, textTransform: 'none', letterSpacing: 'normal' }} title={`${step.dataClassification} · ${step.encryption}`}>
                  {step.label}
                </span>
                {i < t.dataFlow.length - 1 && <span style={{ color: TEXT_DIM }}>→</span>}
              </span>
            ))}
          </div>
        </Panel>
        <Panel title="AUDIT LOGGING SCOPE">
          <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>
            Every read and write logged with who, what, when, from where, and the result.
          </p>
          <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, wordBreak: 'break-all' }}>{t.auditLoggingSample}</p>
        </Panel>
        <Panel title="INCIDENT RESPONSE">
          {t.incidentResponseSteps.map((s) => (
            <p key={s.n} style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              {s.n}. {s.step}
            </p>
          ))}
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8 }}>Last drill: {t.lastIncidentDrill}</p>
        </Panel>
        <Panel title="DEPENDENCIES">
          {t.dependencies.map((dep) => (
            <p key={dep.name} className="font-mono" style={{ ...TYPE_CAPTION, color: dep.knownCves > 0 ? WATCH : TEXT_SECONDARY, marginTop: SPACE_8 }}>
              {dep.name}@{dep.version} · {dep.licence} · {dep.knownCves} CVE{dep.knownCves === 1 ? '' : 's'} · {dep.updateStatus}
            </p>
          ))}
        </Panel>
        <Panel title="SECRET MANAGEMENT">
          <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>{t.secretManagement.where}</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            Rotated every {t.secretManagement.rotationCadence}, last {t.secretManagement.lastRotation}. No secrets in code.
          </p>
        </Panel>
        <Panel title="NETWORK SEGMENTATION">
          {t.networkSegmentation.map((seg) => (
            <p key={seg.segment} style={{ ...TYPE_CAPTION, color: seg.exposedPublicly ? WATCH : TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              {seg.segment} — {seg.contains} {seg.exposedPublicly ? '(public)' : '(internal)'}
            </p>
          ))}
        </Panel>
        <Panel title="COMPLIANCE">
          {t.compliance.map((c) => (
            <p key={c.item} style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              <span style={{ color: TEXT_PRIMARY }}>{c.item}:</span> {c.status}
            </p>
          ))}
        </Panel>
        <Panel title="TEST RESULTS">
          {t.testResultsSecurity.map((r) => (
            <p key={r.tool} style={{ ...TYPE_CAPTION, color: r.findings > 0 ? WATCH : NOMINAL, marginTop: SPACE_8 }}>
              {r.kind}: {r.tool} — {r.findings} finding{r.findings === 1 ? '' : 's'} ({r.lastRun})
            </p>
          ))}
        </Panel>
      </div>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>BREACH HISTORY</p>
        {t.breachHistory.length === 0 ? (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_8 }}>No confirmed breaches. No near-misses recorded.</p>
        ) : (
          t.breachHistory.map((b, i) => (
            <div key={i} style={{ padding: SPACE_16, marginTop: SPACE_8, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${WATCH}` }}>
              <p style={{ ...TYPE_CAPTION, color: WATCH }}>
                {b.date} · {b.kind === 'near-miss' ? 'NEAR-MISS' : 'CONFIRMED BREACH'}
                {b.detectedWithinMinutes !== null && ` · detected within ${b.detectedWithinMinutes} minutes`}
              </p>
              <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{b.summary}</p>
              <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                Root cause: {b.rootCause}
              </p>
              <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                Remediation: {b.remediation}
              </p>
            </div>
          ))
        )}
      </div>
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

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{title}</p>
      <div style={{ marginTop: SPACE_8 }}>{children}</div>
    </div>
  )
}

function FindingDetail({ finding: f }: { finding: SecurityFinding }) {
  return (
    <div style={{ marginTop: SPACE_16, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${SEVERITY_COLOR[f.severity]}` }}>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
        {f.id} — {f.finding}
      </p>
      {f.status === 'closed' ? (
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          {f.what} Closed {f.closed}. {f.whySeverity}
        </p>
      ) : (
        <>
          <DetailField label="WHAT IT IS" text={f.what} />
          <DetailField label="IMPACT" text={f.impact} />
          <DetailField label="WHY IT IS RATED AT THIS SEVERITY" text={f.whySeverity} />
          <DetailField label="WHY IT IS STILL OPEN" text={f.whyStillOpen} emphasis />
          <DetailField label="WHAT THE FIX REQUIRES" text={f.fixRequires} />
          <DetailField label="MITIGATION IN PLACE NOW" text={f.mitigationNow} />
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>
            OWNER {f.owner} · ETA {f.eta ?? '—'} {f.blockedBy && `· BLOCKED BY ${f.blockedBy}`}
          </p>
        </>
      )}
    </div>
  )
}

function DetailField({ label, text, emphasis }: { label: string; text: string; emphasis?: boolean }) {
  return (
    <>
      <p style={{ ...TYPE_CAPTION, color: emphasis ? WATCH : TEXT_DIM, marginTop: SPACE_16 }}>{label}</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{text}</p>
    </>
  )
}
