"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { fetchSnapshot, type SnapshotQuery } from "../services/telemetry"
import type { Snapshot } from "../types/telemetry"

/**
 * The backend quantises every instant to a five-second grid, so polling faster
 * than that returns the identical frame. Matching the grid keeps the view live
 * without asking for work nothing can use.
 */
export const SNAPSHOT_POLL_MS = 5000

export function snapshotQueryKey(query: SnapshotQuery): readonly unknown[] {
  return [
    "telemetry",
    "snapshot",
    query.windowSeconds ?? 0,
    query.channels ?? [],
    query.limit ?? 0,
  ]
}

export function useSnapshotQuery(
  query: SnapshotQuery = {},
  options: { enabled?: boolean } = {}
): UseQueryResult<Snapshot, Error> {
  return useQuery({
    queryKey: snapshotQueryKey(query),
    queryFn: ({ signal }) => fetchSnapshot(query, { signal }),
    refetchInterval: SNAPSHOT_POLL_MS,
    // The frame is keyed to a grid instant, so the previous one stays correct
    // until the next tick rather than flashing empty while a poll is in flight.
    placeholderData: (previous) => previous,
    enabled: options.enabled ?? true,
  })
}
