import type { ReactElement } from 'react'
import { CANVAS, TEXT_DIM, TYPE_BODY } from '@/features/ase/tokens'

export function ControlRoomSkeleton(): ReactElement {
  return (
    <div
      className="flex h-full min-h-0 w-full items-center justify-center"
      style={{ background: CANVAS }}
      role="status"
      aria-live="polite"
    >
      <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Loading Control Room…</p>
    </div>
  )
}

export function ControlRoomTabSkeleton(): ReactElement {
  return (
    <div className="flex h-full min-h-[240px] w-full items-center justify-center" role="status" aria-live="polite">
      <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Loading…</p>
    </div>
  )
}
