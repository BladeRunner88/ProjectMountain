#!/usr/bin/env node
// Mechanical enforcement for "confidence cannot be constructed outside the
// fold" (S1b). oxlint (this repo's linter) has a fixed built-in ruleset with
// no custom-rule authoring, so this is a small standalone script instead of
// an ESLint no-restricted-syntax rule — same guarantee, different mechanism:
// `npm run lint` fails if `as Confidence` appears anywhere outside folds.ts.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', 'src')
const ALLOWED_FILE = join(ROOT, 'ase', 'folds.ts')
const CAST_PATTERN = /\bas\s+Confidence\b/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const offenders = []
for (const file of walk(ROOT)) {
  if (file === ALLOWED_FILE) continue
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (CAST_PATTERN.test(line)) {
      offenders.push(`${relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`)
    }
  })
}

if (offenders.length > 0) {
  console.error('Confidence may only be constructed in src/ase/folds.ts. Found casts elsewhere:\n')
  for (const o of offenders) console.error(`  ${o}`)
  console.error('\nIf a value needs a confidence, compute it with confidence() from folds.ts — do not assign one.')
  process.exit(1)
}

console.log('check-confidence-casts: clean (no `as Confidence` outside folds.ts)')
