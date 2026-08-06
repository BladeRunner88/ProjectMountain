import { useCallback, useEffect, useState } from 'react'

// One persisted density preference for every EvidenceTable (S1e: "Density
// toggle in the section header"). The toggle control lives in the section
// header while the table lives in the content pane — two different places
// in the tree reading/writing the same localStorage key — so a same-tab
// custom event keeps them in sync without a reload (localStorage's own
// `storage` event only fires in *other* tabs, never the one that wrote it).

export type Density = 'comfortable' | 'compact'

const KEY = 'controlRoom.density'
const EVENT = 'controlRoom:density-change'

function read(): Density {
  try {
    return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

export function useDensity(): [Density, () => void] {
  const [density, setDensity] = useState<Density>(read)

  useEffect(() => {
    function onChange() {
      setDensity(read())
    }
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])

  const toggle = useCallback(() => {
    const next: Density = read() === 'compact' ? 'comfortable' : 'compact'
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // best-effort persistence only
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [density, toggle]
}
