'use client'

import type { ReactElement, ReactNode } from 'react'

/**
 * Old App.tsx mounted Findings as a sibling of Control Room (AppShell only).
 * This page still lives under the Control Room folder for the URL
 * `/app/control-room/findings`, so the parent layout wraps ControlRoomShell.
 * Cover that chrome so Findings stays a standalone AppShell page and this
 * file does not remount AseProviders.
 */
export default function FindingsLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <div
      className="fixed inset-y-0 left-60 right-0 top-14 z-50 overflow-y-auto bg-app"
      data-findings-surface="true"
    >
      {children}
    </div>
  )
}
