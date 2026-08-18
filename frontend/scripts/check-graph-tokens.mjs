#!/usr/bin/env node
// Mechanical enforcement for "the graph is tokens-only" — no hex colour
// literal, rgb()/rgba() literal, or raw px font-size anywhere under
// src/graph/, src/components/graph/, or src/pages/GraphNext.tsx, except in
// the token files themselves (graph/tokens.ts, graph/tokens.css). Same
// shape as scripts/check-confidence-casts.mjs: oxlint has no custom-rule
// authoring, so this is a small standalone script instead, wired into
// `npm run lint`.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', 'src')
const SCAN_ROOTS = [join(ROOT, 'graph'), join(ROOT, 'components', 'graph'), join(ROOT, 'pages', 'GraphNext.tsx')]
const ALLOWED_FILES = new Set([join(ROOT, 'graph', 'tokens.ts'), join(ROOT, 'graph', 'tokens.css')])

const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/
const RGB_LITERAL = /\brgba?\(/
// fontSize: <number> (JS/TSX inline style, px by default) or font-size: <number>px (CSS)
const FONT_SIZE_PX = /\bfontSize\s*:\s*['"]?\d|font-size\s*:\s*\d+px/

// Test files build plain data fixtures for pure-function testing — a
// different category from rendering/styling code. 8.6 surfaced a real gap
// here: LabelCandidate.fontSize is a domain field on a plain test object
// (an input to a pure layout function), not a React inline style, but the
// FONT_SIZE_PX pattern can't tell those apart by text alone. Rather than
// build a fragile heuristic to distinguish "styling fontSize" from
// "data-shape fontSize," tests are exempted outright — the actual
// rendering/styling code (GraphCanvas.tsx, nodeVisuals.ts, tokens.ts/css,
// interactions.css) is what this gate exists to keep honest.
function walk(path, out = []) {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) walk(join(path, entry), out)
  } else if (/\.(ts|tsx|css)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path)) {
    out.push(path)
  }
  return out
}

const files = []
for (const root of SCAN_ROOTS) {
  if (existsSync(root)) walk(root, files)
}

const offenders = []
for (const file of files) {
  if (ALLOWED_FILES.has(file)) continue
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    let reason = null
    if (HEX_COLOR.test(line)) reason = 'hex colour literal'
    else if (RGB_LITERAL.test(line)) reason = 'rgb()/rgba() literal'
    else if (FONT_SIZE_PX.test(line)) reason = 'px font-size literal'
    if (reason) offenders.push(`${relative(process.cwd(), file)}:${i + 1}: [${reason}] ${line.trim()}`)
  })
}

if (offenders.length > 0) {
  console.error('The graph is tokens-only. Found raw literals outside graph/tokens.ts and graph/tokens.css:\n')
  for (const o of offenders) console.error(`  ${o}`)
  console.error('\nReference a CSS custom property (graph/tokens.css) or a JS constant (graph/tokens.ts) instead of a literal.')
  process.exit(1)
}

console.log('check-graph-tokens: clean (no hex/rgb/px-font-size literals outside graph/tokens.ts, graph/tokens.css)')
