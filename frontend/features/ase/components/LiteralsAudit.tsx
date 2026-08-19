'use client'

import { useEffect, useState, type ReactElement, type RefObject } from 'react'
import { ANOMALY, BORDER_WIDTH, HAIRLINE, PANEL_PADDING, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_CAPTION } from '../tokens'
import { auditSubtree, type LiteralsAuditResult } from '../services/literalsAudit'

export type { LiteralsAuditResult } from '../services/literalsAudit'
export { looksAuthored, auditSubtree } from '../services/literalsAudit'

export function LiteralsAuditPanel({ containerRef, label }: { containerRef: RefObject<HTMLElement | null>; label: string }): ReactElement | null {
  const [result, setResult] = useState<LiteralsAuditResult | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const run = (): void => setResult(auditSubtree(el))
    run()
    const observer = new MutationObserver(run)
    observer.observe(el, { childList: true, subtree: true, characterData: true })
    return (): void => observer.disconnect()
  }, [containerRef])

  if (!result) return null
  const clean = result.authored === 0

  return (
    <div
      style={{
        border: `${BORDER_WIDTH}px solid ${clean ? HAIRLINE : ANOMALY}`,
        padding: PANEL_PADDING,
        fontSize: TYPE_CAPTION.fontSize,
      }}
    >
      <p style={{ color: TEXT_PRIMARY }}>Literals audit — {label}</p>
      <p style={{ color: TEXT_SECONDARY }}>
        Displayed {result.displayed} · Traced {result.traced} · Authored {result.authored}
      </p>
      {!clean && (
        <ul>
          {result.authoredLocations.map((location) => (
            <li key={location} style={{ color: ANOMALY }}>
              {location}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
