#!/usr/bin/env node
/**
 * The error journal (.data/errors.jsonl) in a terminal, newest first.
 * Usage: node scripts/errors.mjs [--limit 50] [--source server|client|refresh]
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

function arg(n, d) {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 ? process.argv[i + 1] : d
}
const file = resolve('.data/errors.jsonl')
if (!existsSync(file)) {
  console.log('Aucune erreur enregistrée.')
  process.exit(0)
}
const source = arg('source', null)
const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => !source || e.source === source)
for (const e of lines.slice(-Number(arg('limit', 50))).reverse())
  console.log(`${e.at}  ${e.source.padEnd(7)}  ${e.status ? `${e.status} ` : ''}${e.where ?? ''}\n  ${e.message}`)
