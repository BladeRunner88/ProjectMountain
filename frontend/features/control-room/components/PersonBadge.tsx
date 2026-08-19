'use client'

import type { MouseEvent, ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { SPACE_8, TEXT_DIM, TEXT_PRIMARY, TYPE_BODY } from '@/features/ase/tokens'
import { useSelection } from '@/features/ase/client'
import { maskedSerial } from '@/features/ase/services/serial'
import { tabHref } from '../types/tabs'
import { useFocusRing } from '../hooks/useFocusRing'
import { focusRingStyle } from '../services/focusRing'

export interface PersonBadgeProps {
  machineId: string
  name: string
  serial: string
}

export function PersonBadge({ machineId, name, serial }: PersonBadgeProps): ReactElement {
  const { select } = useSelection()
  const router = useRouter()
  const { focused, handlers } = useFocusRing()

  function activate(e: MouseEvent): void {
    e.stopPropagation()
    select({ kind: 'identity', machineId })
    router.push(tabHref('identity'))
  }

  return (
    <button
      type="button"
      onClick={activate}
      title={`Full serial: ${serial}`}
      {...handlers}
      className="pressable inline-flex items-center"
      style={{ gap: SPACE_8, ...focusRingStyle(focused) }}
    >
      <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{name}</span>
      <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_DIM }}>
        {maskedSerial(serial)}
      </span>
    </button>
  )
}
