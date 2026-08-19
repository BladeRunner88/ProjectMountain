/**
 * Defer a computation until first use, then cache it.
 *
 * The graph's derived indexes used to be module-level constants, built at
 * import time from a dataset that also existed at import time. The dataset now
 * arrives over HTTP, so evaluating them on import means evaluating them against
 * nothing — which is exactly what broke prerendering.
 */
export function once<T>(compute: () => T): () => T {
  let value: T | undefined
  let computed = false
  return (): T => {
    if (!computed) {
      value = compute()
      computed = true
    }
    return value as T
  }
}
