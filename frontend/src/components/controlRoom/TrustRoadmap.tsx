import { BORDER_WIDTH, HAIRLINE, PANEL_RAISED, RADIUS_STATIC, SPACE_8, SPACE_16, SPACE_24, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_BODY, TYPE_CAPTION, WATCH } from '../../ase/tokens'
import { useDataset } from '../../ase/store'

// ROADMAP, VERSIONS AND SUPPORT — four quarters with named deliverables,
// every release with what changed and whether it broke, and support
// contacts marked clearly as placeholders while they are.
export function TrustRoadmap() {
  const { dataset } = useDataset()
  const t = dataset.trust

  return (
    <div>
      <div className="grid grid-cols-4" style={{ gap: SPACE_16 }}>
        {t.roadmap.map((q) => (
          <div key={q.quarter} style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{q.quarter}</p>
            <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>{q.focus}</p>
            {q.deliverables.map((d, i) => (
              <p key={i} style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
                · {d}
              </p>
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>VERSION HISTORY</p>
        {t.versionHistory.map((v) => (
          <div key={v.version} className="flex items-center" style={{ gap: SPACE_16, padding: SPACE_8, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_PRIMARY, width: 70 }}>
              {v.version}
            </span>
            <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM, width: 100 }}>
              {v.date}
            </span>
            <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal', flex: 1 }}>{v.summary}</span>
            {v.breaking && <span style={{ ...TYPE_CAPTION, color: WATCH }}>BREAKING</span>}
          </div>
        ))}
      </div>

      <div style={{ marginTop: SPACE_24 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>SUPPORT (PLACEHOLDERS)</p>
        <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          Documentation: {t.support.documentation} · API reference: {t.support.apiReference} · Status page: {t.support.statusPage}
        </p>
        <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          Engineering: {t.support.engineeringContact.name} ({t.support.engineeringContact.responseTime}) · Security: {t.support.securityContact.name} (
          {t.support.securityContact.responseTime})
        </p>
        <p style={{ ...TYPE_CAPTION, color: WATCH, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          Emergency channel: {t.support.emergencyChannel}
        </p>
      </div>
    </div>
  )
}
