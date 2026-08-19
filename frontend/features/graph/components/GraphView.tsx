"use client"

import type { Route } from "next"
import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { GraphIcon } from "@/components/ui/icons"
import { LoadingState } from "@/components/ui/loading-state"

import { useFullGraphQuery } from "../hooks/useFullGraphQuery"
import { describeGraphError } from "../services/objects"
import { SidePanel } from "./SidePanel"
import type { FgMethods, ForceNode } from "./ForceGraphCanvas"

const ForceGraphCanvas = dynamic(
  () => import("./ForceGraphCanvas").then((mod) => mod.ForceGraphCanvas),
  {
    ssr: false,
    loading: () => <LoadingState variant="dark" label="Loading canvas" />,
  }
)

function GraphViewInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { data, isPending, isError, error, refetch } = useFullGraphQuery()

  const focusId = searchParams.get("focus")
  const [selectedId, setSelectedId] = useState<string | null>(focusId)
  const [prevFocusId, setPrevFocusId] = useState(focusId)
  if (focusId !== prevFocusId) {
    setPrevFocusId(focusId)
    setSelectedId(focusId)
  }
  const fgRef = useRef<FgMethods | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setDims({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const graphData = useMemo(() => {
    if (!data) return { nodes: [] as ForceNode[], links: [] }
    return {
      nodes: data.objects.map((object): ForceNode => ({ ...object })),
      links: data.links,
    }
  }, [data])

  const replaceFocus = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (id) next.set("focus", id)
      else next.delete("focus")
      const qs = next.toString()
      // `usePathname()` is a plain string, so typedLines cannot check this one
      // statically — the cast is the documented escape hatch for non-literal hrefs.
      const href = (qs ? `${pathname}?${qs}` : pathname) as Route
      router.replace(href, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const focusNode = useCallback(
    (id: string) => {
      const node = graphData.nodes.find((n) => n.id === id)
      if (node && fgRef.current && node.x != null && node.y != null) {
        fgRef.current.centerAt(node.x, node.y, 600)
        fgRef.current.zoom(3.2, 600)
      }
      setSelectedId(id)
      replaceFocus(id)
    },
    [graphData.nodes, replaceFocus]
  )

  useEffect(() => {
    if (!focusId || !data) return
    const timer = window.setTimeout(() => focusNode(focusId), 400)
    return () => window.clearTimeout(timer)
  }, [focusId, data, focusNode])

  const handleClose = (): void => {
    setSelectedId(null)
    replaceFocus(null)
  }

  const isEmpty = Boolean(data && data.objects.length === 0)

  return (
    <div className="flex h-full min-h-0 w-full">
      <div ref={containerRef} className="relative min-h-0 min-w-0 flex-1 bg-canvas">
        {isPending && !data ? (
          <LoadingState variant="dark" label="Loading graph" />
        ) : null}
        {isError && !data ? (
          <ErrorState
            variant="dark"
            message={describeGraphError(error, "The graph could not be loaded.")}
            onRetry={refetch}
          />
        ) : null}
        {isEmpty ? (
          <EmptyState
            variant="dark"
            icon={GraphIcon}
            title="No graph loaded"
            subtitle="Ingest data to build your knowledge graph."
          />
        ) : null}
        {data && !isEmpty && dims.width > 0 && dims.height > 0 ? (
          <ForceGraphCanvas
            width={dims.width}
            height={dims.height}
            nodes={graphData.nodes}
            links={graphData.links}
            selectedId={selectedId}
            onNodeClick={focusNode}
            onBackgroundClick={handleClose}
            graphRef={fgRef}
          />
        ) : null}
      </div>
      {selectedId ? (
        <SidePanel
          objectId={selectedId}
          onClose={handleClose}
          onNavigate={focusNode}
        />
      ) : null}
    </div>
  )
}

export function GraphView() {
  return (
    <Suspense
      fallback={
        <div className="h-full bg-canvas">
          <LoadingState variant="dark" label="Loading graph" />
        </div>
      }
    >
      <GraphViewInner />
    </Suspense>
  )
}
