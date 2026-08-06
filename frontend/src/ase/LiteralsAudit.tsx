import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { ANOMALY, BORDER_WIDTH, HAIRLINE, PANEL_PADDING, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_CAPTION } from './tokens'

// S1b requirement 5: the system audits itself. A tab that renders a bare
// number instead of going through Metric doesn't announce itself — nothing
// throws, nothing looks wrong at a glance. This panel walks the DOM subtree
// it's pointed at, counts how many rendered facts carry Metric's
// `data-metric-id` stamp versus how many look like a bare literal that
// didn't, and turns red the moment Authored is non-zero, naming the
// offending elements rather than just failing a count.

export interface LiteralsAuditResult {
  displayed: number
  traced: number
  authored: number
  authoredLocations: string[]
}

// The actual judgment call, kept DOM-free so it's testable without a
// browser: does this text node's full content look like a bare authored
// number? Deliberately a *full-string* match, not "contains a digit" — that
// would flag "Step 4" or "v2" as facts. A narrative sentence with a number
// buried in it ("risk score of 42") also won't match; the case this exists
// to catch is a metric rendered as its own isolated text node, which is how
// every bare-numeral render in this app already looks (see Era A's headline
// numerals, e.g. PipelineDeploy.tsx's `<p>{value}</p>` pattern).
const AUTHORED_NUMBER = /^-?\d[\d,]*(\.\d+)?%?$/

export function looksAuthored(text: string): boolean {
  return AUTHORED_NUMBER.test(text.trim())
}

function describeNode(el: Element | null): string {
  if (!el) return '(detached text node)'
  const label = el.getAttribute('aria-label')
  if (label) return label
  if (el.id) return `#${el.id}`
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : ''
  return cls ? `<${el.tagName.toLowerCase()} class="${cls}">` : `<${el.tagName.toLowerCase()}>`
}

export function auditSubtree(root: Element): LiteralsAuditResult {
  const traced = root.querySelectorAll('[data-metric-id]').length
  const authoredLocations: string[] = []

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      // A number inside a Metric's own subtree (the tooltip, say) is
      // provenance chrome, not a second, undeclared fact — skip it.
      if (parent.closest('[data-metric-id]')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  let node = walker.nextNode()
  while (node) {
    if (looksAuthored(node.textContent ?? '')) {
      authoredLocations.push(describeNode(node.parentElement))
    }
    node = walker.nextNode()
  }

  return {
    displayed: traced + authoredLocations.length,
    traced,
    authored: authoredLocations.length,
    authoredLocations,
  }
}

export function LiteralsAuditPanel({ containerRef, label }: { containerRef: RefObject<HTMLElement | null>; label: string }) {
  const [result, setResult] = useState<LiteralsAuditResult | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const run = () => setResult(auditSubtree(el))
    run()
    const observer = new MutationObserver(run)
    observer.observe(el, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
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
