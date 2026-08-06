import { useEffect, useState } from 'react'

// S9.1h: the CSS `@media (prefers-reduced-motion: reduce)` blocks in
// index.css already strip the purely decorative animations (fade, panel
// slide, press scale). The two exceptions that carry real meaning — the
// threshold-crossing flash and the dependency dim — can't just be removed;
// they still have to happen, only instantly instead of animated. Both are
// driven by inline `transition` durations (Metric.tsx), which CSS media
// queries can't reach, so this hook is how those two spots find out.
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduced
}
