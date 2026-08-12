// S8.2 rule 7: ERROR BOUNDARY. One around the canvas, one around the panel
// (GraphNext.tsx wraps each separately) — a crash in one must never take
// the other down. Each shows a readable fallback with a RESET VIEW action,
// never a blank white screen.

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { ANOMALY, BORDER_WIDTH, CANVAS, PANEL_RAISED, RADIUS_INTERACTIVE, RADIUS_STATIC, SPACE_16, SPACE_8, TEXT_DIM, TEXT_PRIMARY, TYPE_BODY, TYPE_CAPTION } from '../../ase/tokens'

interface Props {
  label: string
  onReset?: () => void
  children: ReactNode
}

interface State {
  error: Error | null
}

export class GraphErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[graph] ${this.props.label} crashed`, error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex h-full w-full flex-col items-center justify-center"
          style={{ background: CANVAS, padding: SPACE_16, pointerEvents: 'auto' }}
        >
          <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${ANOMALY}`, maxWidth: 420 }}>
            <p style={{ ...TYPE_CAPTION, color: ANOMALY }}>{this.props.label.toUpperCase()} STOPPED RENDERING</p>
            <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              An error was caught before it could take the rest of the screen down with it.
            </p>
            <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, wordBreak: 'break-word' }}>
              {this.state.error.message}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="pressable"
              style={{ ...TYPE_CAPTION, color: TEXT_PRIMARY, border: `${BORDER_WIDTH}px solid ${TEXT_PRIMARY}`, borderRadius: RADIUS_INTERACTIVE, padding: `${SPACE_8}px ${SPACE_16}px`, marginTop: SPACE_16 }}
            >
              RESET VIEW
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
