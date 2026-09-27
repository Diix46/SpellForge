/**
 * The journal of what went wrong: server errors, errors the visitors'
 * browsers report, failed nightly refresh steps. One JSON line each in
 * `.data/errors.jsonl`, the oldest dropped past 2 000 lines; read on the
 * admin page (/admin/erreurs) or with `node scripts/errors.mjs`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

export const ERROR_LOG = resolve('.data/errors.jsonl')
const KEEP = 2000

export interface LoggedError {
  at: string
  source: 'server' | 'client' | 'refresh'
  message: string
  /** Route, URL or step. */
  where?: string
  status?: number
  stack?: string
}

let writes = 0

export function logError(entry: Omit<LoggedError, 'at'>): void {
  try {
    mkdirSync(dirname(ERROR_LOG), { recursive: true })
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry, message: entry.message.slice(0, 500), stack: entry.stack?.slice(0, 1500) })
    appendFileSync(ERROR_LOG, `${line}\n`)
    // Trimmed now and then, not on every line.
    if (++writes % 100 === 0)
      trim()
  }
  catch {}
}

function trim() {
  const lines = readFileSync(ERROR_LOG, 'utf8').split('\n').filter(Boolean)
  if (lines.length <= KEEP)
    return
  const tmp = `${ERROR_LOG}.${process.pid}.tmp`
  writeFileSync(tmp, `${lines.slice(-KEEP).join('\n')}\n`)
  renameSync(tmp, ERROR_LOG)
}

/** The latest entries, newest first. */
export function readErrors(limit = 300): LoggedError[] {
  if (!existsSync(ERROR_LOG))
    return []
  return readFileSync(ERROR_LOG, 'utf8').split('\n').filter(Boolean).slice(-limit).reverse().flatMap((l) => {
    try {
      return [JSON.parse(l) as LoggedError]
    }
    catch {
      return []
    }
  })
}
