import { cn } from "@/lib/cn"

type GraphNode = { id: string; x: number; y: number; r: number; hub?: boolean }

// Dense, roughly square field so a slice crop stays busy at any panel
// aspect ratio — this fills a large dominant panel, not a small letterbox.
const VIEW_W = 1000
const VIEW_H = 900

const nodes: GraphNode[] = [
  { id: "n1", x: 500, y: 440, r: 8, hub: true },
  { id: "n2", x: 360, y: 300, r: 5 },
  { id: "n3", x: 420, y: 190, r: 4 },
  { id: "n4", x: 560, y: 260, r: 5 },
  { id: "n5", x: 660, y: 340, r: 5 },
  { id: "n6", x: 630, y: 500, r: 5 },
  { id: "n7", x: 520, y: 600, r: 4 },
  { id: "n8", x: 380, y: 560, r: 5 },
  { id: "n9", x: 280, y: 460, r: 4 },
  { id: "n10", x: 250, y: 320, r: 4 },
  { id: "n11", x: 740, y: 220, r: 4 },
  { id: "n12", x: 800, y: 420, r: 6 },
  { id: "n13", x: 770, y: 570, r: 4 },
  { id: "n14", x: 170, y: 200, r: 3 },
  { id: "n15", x: 880, y: 280, r: 3 },
  { id: "n16", x: 130, y: 540, r: 3 },
  { id: "n17", x: 860, y: 640, r: 3 },
  { id: "n18", x: 340, y: 700, r: 3 },
  { id: "n19", x: 590, y: 730, r: 4 },
  { id: "n20", x: 200, y: 620, r: 3 },
  { id: "n21", x: 470, y: 130, r: 3 },
  { id: "n22", x: 650, y: 150, r: 4 },
  { id: "n23", x: 900, y: 500, r: 3 },
  { id: "n24", x: 100, y: 380, r: 3 },
  { id: "n25", x: 720, y: 700, r: 3 },
  { id: "n26", x: 460, y: 780, r: 3 },
  { id: "n27", x: 830, y: 130, r: 3 },
  { id: "n28", x: 150, y: 730, r: 3 },
]

const edges: [string, string][] = [
  ["n1", "n2"],
  ["n1", "n4"],
  ["n1", "n6"],
  ["n1", "n8"],
  ["n1", "n9"],
  ["n2", "n3"],
  ["n2", "n10"],
  ["n4", "n3"],
  ["n4", "n5"],
  ["n4", "n22"],
  ["n5", "n6"],
  ["n5", "n11"],
  ["n5", "n12"],
  ["n6", "n7"],
  ["n6", "n13"],
  ["n7", "n8"],
  ["n7", "n19"],
  ["n8", "n9"],
  ["n8", "n18"],
  ["n9", "n10"],
  ["n9", "n20"],
  ["n10", "n14"],
  ["n10", "n24"],
  ["n11", "n15"],
  ["n11", "n22"],
  ["n12", "n13"],
  ["n12", "n15"],
  ["n12", "n23"],
  ["n13", "n17"],
  ["n13", "n25"],
  ["n3", "n21"],
  ["n11", "n27"],
  ["n18", "n20"],
  ["n18", "n26"],
  ["n19", "n25"],
  ["n16", "n20"],
  ["n16", "n28"],
  ["n2", "n14"],
]

const byId: Record<string, GraphNode> = Object.fromEntries(
  nodes.map((n) => [n.id, n])
)

function requireNode(id: string): GraphNode {
  const node = byId[id]
  if (!node) {
    throw new Error(`GraphMock: missing node ${id}`)
  }
  return node
}

const foundHub = nodes.find((n) => n.hub)
if (!foundHub) {
  throw new Error("GraphMock: hub node missing")
}
const hub: GraphNode = foundHub

const n5 = requireNode("n5")
const n8 = requireNode("n8")
const n12 = requireNode("n12")
const n19 = requireNode("n19")

export function GraphMock({ className = "" }: { className?: string }) {
  return (
    <div className={cn("relative h-full w-full", className)}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.3) 100%)",
        }}
      />
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <g>
          {edges.map(([a, b]) => {
            const na = requireNode(a)
            const nb = requireNode(b)
            return (
              <line
                key={`${a}-${b}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                stroke="rgba(255,255,255,0.16)"
                strokeWidth={1}
              />
            )
          })}
        </g>
        <g>
          {nodes.map((n) => (
            <circle
              key={n.id}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill="rgba(255,255,255,0.6)"
            />
          ))}
          <circle
            cx={hub.x}
            cy={hub.y}
            r={hub.r + 6}
            fill="none"
            stroke="#0071e3"
            strokeWidth={1.5}
          />
        </g>
        <g className="font-mono" style={{ fontSize: 12 }}>
          <text x={n5.x + 12} y={n5.y + 4} fill="rgba(242,242,244,0.6)">
            acct_882c
          </text>
          <text x={n12.x + 12} y={n12.y + 4} fill="rgba(242,242,244,0.6)">
            inv_2291
          </text>
          <text x={n8.x - 90} y={n8.y + 4} fill="rgba(242,242,244,0.6)">
            org_4471
          </text>
          <text x={n19.x + 12} y={n19.y + 4} fill="rgba(242,242,244,0.6)">
            ref_0093
          </text>
        </g>
      </svg>

      <div
        className="absolute -translate-y-1/2 rounded-lg border border-hairline-on-canvas bg-white/[0.06] px-3 py-2 backdrop-blur-sm"
        style={{
          left: `${(hub.x / VIEW_W) * 100}%`,
          top: `${(hub.y / VIEW_H) * 100}%`,
          marginLeft: 20,
        }}
      >
        <div className="font-mono text-[10px] tracking-wide text-ink-on-canvas-soft">
          ENTITY
        </div>
        <div className="text-[13px] text-ink-on-canvas">Meridian Holdings</div>
      </div>
    </div>
  )
}
