import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { SPACE_8, TEXT_DIM, TEXT_PRIMARY, TYPE_BODY } from '../../ase/tokens'
import { useSelection } from '../../ase/selection'
import { maskedSerial } from '../../ase/serial'
import { focusRingStyle, useFocusRing } from './focusRing'

// S9.6b convention #1: "a person is never named without their serial" —
// anywhere a person appears (a table row, a reasoning hop, a prediction, a
// queue item, an audit entry, a tooltip, an exposure list), render them
// through this one component: name in body type, serial in mono and
// dimmer, full seven digits on hover. Clicking sets global selection AND
// makes them the selected person in Identity, so jumping to Identity from
// anywhere always lands on whoever was last discussed (see Identity.tsx's
// selection-sync effect, which is the other half of that contract).
export function PersonBadge({ climberId, name, serial }: { climberId: string; name: string; serial: string }) {
  const { select } = useSelection()
  const navigate = useNavigate()
  const { focused, handlers } = useFocusRing()

  function activate(e: MouseEvent) {
    e.stopPropagation()
    select({ kind: 'identity', climberId })
    navigate('/app/control-room/identity')
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
