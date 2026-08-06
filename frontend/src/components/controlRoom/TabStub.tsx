import { Navigate, useParams } from 'react-router-dom'
import { PAGE_GUTTER, SPACE_16, TEXT_DIM, TEXT_SECONDARY, TYPE_BODY } from '../../ase/tokens'
import { DEFAULT_TAB_ID, isTabId, tabById } from './tabs'

// Every tab this block doesn't build gets the same honest placeholder (S1f):
// name + stage, one sentence saying it's being rebuilt, one sentence saying
// what it will show — reusing tabs.ts's own `description` rather than a
// second, separately-authored line that could drift from the section header
// above it. No invented tables or rows; a stub is the correct state until
// that tab's own 9.x block lands.
export function TabStub() {
  const { tab: tabParam } = useParams<{ tab: string }>()

  if (!tabParam || !isTabId(tabParam)) {
    return <Navigate to={`/app/control-room/${DEFAULT_TAB_ID}`} replace />
  }

  const tab = tabById(tabParam)!

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
        Coming online — this surface is being rebuilt on the evidence graph.
      </p>
      <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>Will show: {tab.description}</p>
    </div>
  )
}
