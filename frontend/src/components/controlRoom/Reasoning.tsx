import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  CANVAS,
  HAIRLINE,
  PAGE_GUTTER,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_8,
  SPACE_16,
  SPACE_24,
  SPACE_32,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import { useSelection } from '../../ase/selection'
import { Metric } from '../../ase/Metric'
import { confidence, describeLimitingStep, limitingStep } from '../../ase/folds'
import { nodeVisual, edgeDashArray, type NodeStatus } from '../../ase/nodeLanguage'
import {
  COUNTERFACTUAL_LABEL,
  runCounterfactual,
  type ChainHop,
  type CounterfactualKind,
  type CounterfactualResult,
  type ReasoningAnswer,
  type ReasoningEngineState,
  type RuledOutFactor,
} from '../../ase/reasoning'
import { PersonBadge } from './PersonBadge'
import { focusRingStyle, useFocusRing } from './focusRing'

// S9.8: the Reasoning Engine. Applies two S9.6b conventions this block is
// explicitly named under — #1 "a person is never named without their
// serial" (AFFECTS renders every climber through PersonBadge, never a bare
// name) and #2 "one node language everywhere" (the dependency map reads
// its node/edge colours from ase/nodeLanguage.ts — the same file 9.6's
// associates chart and 9.12's source view use, never a local palette).
// Every number on this tab is either a real folded TracedValue or a real
// `counterfactual()` recomputation from ase/folds.ts — nothing here is an
// authored percentage.
export function Reasoning() {
  const { dataset } = useDataset()
  const engine = dataset.reasoningEngine
  const primaryQuestion = engine.cannedQuestions[0]

  const normalizedLookup = useMemo(() => {
    const m = new Map<string, string>()
    for (const q of engine.cannedQuestions) m.set(normalize(q), q)
    return m
  }, [engine.cannedQuestions])

  const [currentQuestion, setCurrentQuestion] = useState(primaryQuestion)
  const [draft, setDraft] = useState(primaryQuestion)
  const [notDemoed, setNotDemoed] = useState(false)
  const [cfResults, setCfResults] = useState<Partial<Record<CounterfactualKind, CounterfactualResult>>>({})

  const answer = engine.answers.get(currentQuestion)!

  function resolve(raw: string) {
    const match = normalizedLookup.get(normalize(raw))
    if (!match) {
      setNotDemoed(true)
      return
    }
    setNotDemoed(false)
    setCfResults({})
    setCurrentQuestion(match)
    setDraft(match)
  }

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <QuestionBar
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={() => resolve(draft)}
        chips={engine.cannedQuestions.filter((q) => q !== primaryQuestion)}
        onChip={resolve}
        notDemoed={notDemoed}
        totalQuestions={engine.cannedQuestions.length}
      />

      <RuledOutPhase answer={answer} />

      <div className="grid grid-cols-2" style={{ gap: SPACE_32, marginTop: SPACE_32 }}>
        <ChainPhase answer={answer} />
        <DependencyMap answer={answer} />
      </div>

      {answer.supportsCounterfactuals && <CounterfactualsPhase engine={engine} results={cfResults} setResults={setCfResults} />}
    </div>
  )
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!]+$/, '')
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

// -- QUESTION BAR -------------------------------------------------------------

function QuestionBar({
  draft,
  onDraftChange,
  onSubmit,
  chips,
  onChip,
  notDemoed,
  totalQuestions,
}: {
  draft: string
  onDraftChange: (v: string) => void
  onSubmit: () => void
  chips: string[]
  onChip: (q: string) => void
  notDemoed: boolean
  totalQuestions: number
}) {
  const { focused: inputFocused, handlers: inputHandlers } = useFocusRing()
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          aria-label="Question"
          {...inputHandlers}
          style={{
            ...TYPE_BODY,
            color: TEXT_PRIMARY,
            background: PANEL_RAISED,
            border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
            borderRadius: RADIUS_INTERACTIVE,
            padding: SPACE_8,
            width: '100%',
            ...focusRingStyle(inputFocused),
          }}
        />
      </form>
      <div className="flex items-center flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
        {chips.map((q) => (
          <QuestionChip key={q} question={q} onClick={() => onChip(q)} />
        ))}
      </div>
      {notDemoed && (
        <p style={{ ...TYPE_BODY, color: WATCH, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          Not demoed — try one of the questions above.
        </p>
      )}
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
        demo data · {numberWord(totalQuestions)} questions answered
      </p>
    </div>
  )
}

function QuestionChip({ question, onClick }: { question: string; onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: TEXT_SECONDARY,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        cursor: 'pointer',
        ...focusRingStyle(focused),
      }}
    >
      {question}
    </button>
  )
}

// -- PHASE 1: WHAT WE RULED OUT ------------------------------------------------

function RuledOutPhase({ answer }: { answer: ReasoningAnswer }) {
  const { select } = useSelection()
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHAT WE RULED OUT</p>
      <div style={{ marginTop: SPACE_16 }}>
        {answer.ruledOut.map((r) => (
          <RuledOutRow key={r.id} factor={r} onClick={() => select({ kind: 'value', traced: r.evidenceTraced, label: r.factor })} />
        ))}
        <div
          role="button"
          tabIndex={0}
          onClick={() => select({ kind: 'value', traced: answer.cause, label: answer.activeFactor })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              select({ kind: 'value', traced: answer.cause, label: answer.activeFactor })
            }
          }}
          className="pressable cursor-pointer flex items-center"
          style={{ gap: SPACE_8, padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}
        >
          <span
            style={{
              ...TYPE_CAPTION,
              color: ANOMALY,
              border: `${BORDER_WIDTH}px solid ${ANOMALY}`,
              borderRadius: RADIUS_INTERACTIVE,
              padding: `1px ${SPACE_8}px`,
            }}
          >
            THIS ONE
          </span>
          <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{answer.activeFactor}</span>
        </div>
      </div>
    </div>
  )
}

function RuledOutRow({ factor, onClick }: { factor: RuledOutFactor; onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      {...handlers}
      className="pressable cursor-pointer"
      style={{ opacity: 0.5, padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, ...focusRingStyle(focused) }}
    >
      <div className="flex items-center" style={{ gap: SPACE_8 }}>
        <span
          style={{
            ...TYPE_CAPTION,
            color: TEXT_DIM,
            border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
            borderRadius: RADIUS_INTERACTIVE,
            padding: `1px ${SPACE_8}px`,
          }}
        >
          RULED OUT
        </span>
        <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>{factor.factor}</span>
      </div>
      <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{factor.evidence}</p>
    </div>
  )
}

// -- PHASE 2: THE CHAIN --------------------------------------------------------

function ChainPhase({ answer }: { answer: ReasoningAnswer }) {
  const limiting = limitingStep(answer.cause)
  const limitingHop = answer.chain.find((h) => h.traced.id === limiting.traced.id)
  const causeConfPct = Math.round(confidence(answer.cause) * 100)

  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>THE CHAIN</p>
      <div style={{ marginTop: SPACE_16 }}>
        {answer.chain.map((hop) => (
          <div key={hop.id} style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
            <div className="flex items-center" style={{ gap: SPACE_8 }}>
              <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
                {hop.n}
              </span>
              <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>{hop.displayKind}</span>
            </div>
            {/* Metric's own `label` only renders visibly with `ownerTab` set (S1f) — this chain isn't
                owned by another tab, so the hop's plain-English summary is rendered here directly,
                same as EvidenceTable's separate `why` cell alongside its own Metric-rendered claim. */}
            <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{hop.summary}</p>
            <div style={{ marginTop: SPACE_8 }}>
              <Metric traced={hop.traced} label={hop.summary} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: SPACE_24, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>CAUSE</p>
        <div style={{ marginTop: SPACE_8 }}>
          <Metric traced={answer.cause} label={answer.activeFactor} />
        </div>

        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>AFFECTS</p>
        <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
          {answer.affected.map((a) => (
            <PersonBadge key={a.climberId} climberId={a.climberId} name={a.name} serial={a.serial} />
          ))}
        </div>
        {answer.operatorNames.length > 0 && (
          <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            Operators: {answer.operatorNames.join(', ')}
          </p>
        )}

        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>CONFIDENCE</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          {causeConfPct}% — only as sure as {limitingHop ? `step ${limitingHop.n}` : 'its weakest supporting fact'}, {describeLimitingStep(limiting.traced)}.
        </p>
      </div>
    </div>
  )
}

// -- dependency map, one node language everywhere (S9.6b convention #2) ------

interface DepNode {
  id: string
  label: string
  layer: number
}
interface DepEdge {
  from: string
  to: string
}

function buildDependencyGraph(chain: ChainHop[], causeDependsOnHopIds: string[]): { nodes: DepNode[]; edges: DepEdge[] } {
  const idToDeps = new Map<string, string[]>()
  for (const h of chain) idToDeps.set(h.id, h.dependsOnHopIds)
  idToDeps.set('cause', causeDependsOnHopIds)

  const layerCache = new Map<string, number>()
  function layerOf(id: string): number {
    const cached = layerCache.get(id)
    if (cached !== undefined) return cached
    const deps = idToDeps.get(id) ?? []
    const layer = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(layerOf))
    layerCache.set(id, layer)
    return layer
  }

  const nodeIds = [...chain.map((h) => h.id), 'cause']
  const nodes: DepNode[] = nodeIds.map((id) => ({
    id,
    label: id === 'cause' ? 'C' : String(chain.find((h) => h.id === id)!.n),
    layer: layerOf(id),
  }))
  const edges: DepEdge[] = []
  for (const [to, deps] of idToDeps) {
    for (const from of deps) edges.push({ from, to })
  }
  return { nodes, edges }
}

const DEP_NODE_R = 10
const DEP_LAYER_GAP = 64
const DEP_ROW_GAP = 36

function DependencyMap({ answer }: { answer: ReasoningAnswer }) {
  const { nodes, edges } = useMemo(() => buildDependencyGraph(answer.chain, answer.causeDependsOnHopIds), [answer])
  const limiting = limitingStep(answer.cause)
  const limitingHopId = answer.chain.find((h) => h.traced.id === limiting.traced.id)?.id

  const byLayer = new Map<number, DepNode[]>()
  for (const n of nodes) {
    const arr = byLayer.get(n.layer) ?? []
    arr.push(n)
    byLayer.set(n.layer, arr)
  }
  const positions = new Map<string, { x: number; y: number }>()
  for (const [layer, ns] of byLayer) {
    ns.forEach((n, i) => {
      positions.set(n.id, { x: layer * DEP_LAYER_GAP + DEP_NODE_R + 4, y: i * DEP_ROW_GAP + DEP_NODE_R + 4 })
    })
  }
  const maxLayer = Math.max(...nodes.map((n) => n.layer))
  const maxRows = Math.max(...[...byLayer.values()].map((ns) => ns.length))
  const width = (maxLayer + 1) * DEP_LAYER_GAP
  const height = maxRows * DEP_ROW_GAP + DEP_NODE_R * 2

  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DEPENDENCY MAP</p>
      <svg width={width} height={height} style={{ marginTop: SPACE_16, overflow: 'visible' }}>
        {edges.map((e, i) => {
          const from = positions.get(e.from)
          const to = positions.get(e.to)
          if (!from || !to) return null
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={TEXT_DIM}
              strokeWidth={1}
              strokeDasharray={edgeDashArray('present')}
              opacity={0.5}
            />
          )
        })}
        {nodes.map((n) => {
          const pos = positions.get(n.id)!
          const status: NodeStatus = n.id === 'cause' ? 'anomaly' : n.id === limitingHopId ? 'watch' : 'nominal'
          const visual = nodeVisual(status)
          return (
            <g key={n.id}>
              {visual.ring && <circle cx={pos.x} cy={pos.y} r={DEP_NODE_R + 3} fill="none" stroke={visual.ring} strokeWidth={2} />}
              <circle cx={pos.x} cy={pos.y} r={DEP_NODE_R} fill={visual.fill} />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={10} fill={CANVAS}>
                {n.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// -- PHASE 3: COUNTERFACTUALS — real counterfactual() recomputation ----------

const COUNTERFACTUAL_ORDER: CounterfactualKind[] = ['without-weather-feed', 'if-sensor-4-wrong', 'without-learned-pattern']

function CounterfactualsPhase({
  engine,
  results,
  setResults,
}: {
  engine: ReasoningEngineState
  results: Partial<Record<CounterfactualKind, CounterfactualResult>>
  setResults: Dispatch<SetStateAction<Partial<Record<CounterfactualKind, CounterfactualResult>>>>
}) {
  function run(kind: CounterfactualKind) {
    const result = runCounterfactual(kind, engine.primaryChainIds, engine.primaryInputs)
    setResults((prev) => ({ ...prev, [kind]: result }))
  }

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>COUNTERFACTUALS</p>
      <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_16 }}>
        {COUNTERFACTUAL_ORDER.map((kind) => (
          <CounterfactualButton key={kind} kind={kind} onRun={() => run(kind)} />
        ))}
      </div>
      <div style={{ marginTop: SPACE_16 }}>
        {COUNTERFACTUAL_ORDER.filter((kind) => results[kind]).map((kind) => (
          <CounterfactualResultCard key={kind} result={results[kind]!} />
        ))}
      </div>
    </div>
  )
}

function CounterfactualButton({ kind, onRun }: { kind: CounterfactualKind; onRun: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onRun}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: TEXT_PRIMARY,
        border: `${BORDER_WIDTH}px solid ${TEXT_SECONDARY}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_16}px`,
        cursor: 'pointer',
        ...focusRingStyle(focused),
      }}
    >
      {COUNTERFACTUAL_LABEL[kind].toUpperCase()}
    </button>
  )
}

function CounterfactualResultCard({ result }: { result: CounterfactualResult }) {
  return (
    <div
      style={{
        padding: SPACE_16,
        background: PANEL_RAISED,
        borderRadius: RADIUS_STATIC,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        marginBottom: SPACE_16,
      }}
    >
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{result.label.toUpperCase()}</p>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>{result.cause}</p>
      <p className="font-mono" style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>
        {result.confidencePct}%
      </p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>WHAT CHANGED</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{result.whatChanged}</p>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16 }}>WHAT DID NOT CHANGE</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{result.whatDidNotChange}</p>
    </div>
  )
}
