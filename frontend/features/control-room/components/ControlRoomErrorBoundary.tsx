'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  CANVAS,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_16,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TYPE_BODY,
  TYPE_CAPTION,
} from '@/features/ase/tokens'

export interface ControlRoomErrorBoundaryProps {
  label: string
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ControlRoomErrorBoundary extends Component<ControlRoomErrorBoundaryProps, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[control-room] ${this.props.label} crashed`, error, info.componentStack)
  }

  handleReset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className="flex h-full w-full flex-col items-center justify-center"
          style={{ background: CANVAS, padding: SPACE_16 }}
          role="alert"
        >
          <div
            style={{
              padding: SPACE_16,
              background: PANEL_RAISED,
              borderRadius: RADIUS_STATIC,
              border: `${BORDER_WIDTH}px solid ${ANOMALY}`,
              maxWidth: 420,
            }}
          >
            <p style={{ ...TYPE_CAPTION, color: ANOMALY }}>{this.props.label.toUpperCase()} STOPPED RENDERING</p>
            <p
              style={{
                ...TYPE_BODY,
                color: TEXT_PRIMARY,
                marginTop: SPACE_8,
                textTransform: 'none',
                letterSpacing: 'normal',
              }}
            >
              An error was caught before it could take the rest of the screen down with it.
            </p>
            <p className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, wordBreak: 'break-word' }}>
              {this.state.error.message}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="pressable"
              style={{
                ...TYPE_CAPTION,
                color: TEXT_PRIMARY,
                border: `${BORDER_WIDTH}px solid ${TEXT_PRIMARY}`,
                borderRadius: RADIUS_INTERACTIVE,
                padding: `${SPACE_8}px ${SPACE_16}px`,
                marginTop: SPACE_16,
              }}
            >
              TRY AGAIN
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
