/**
 * The steps of a card refresh, run one after the other in child processes:
 * the ingest scripts use the synchronous libSQL client and would otherwise
 * freeze the server for the length of a Magic rebuild (about 90 s).
 */
import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

export interface RefreshStep {
  name: string
  script: string
  args?: string[]
}

/** One Piece first (its images are served from disk only), then Magic, then its preconstructed decks. */
export const REFRESH_STEPS: readonly RefreshStep[] = [
  { name: 'optcg', script: 'scripts/ingest-optcg.mjs' },
  { name: 'optcg-images', script: 'scripts/mirror-images-optcg.mjs' },
  { name: 'mtg', script: 'scripts/ingest-mtg.mjs' },
  { name: 'precons', script: 'scripts/ingest-precons.mjs' },
]

/** Waits between attempts: a network hiccup, then a longer outage. */
export const RETRY_DELAYS_MS: readonly number[] = [60_000, 5 * 60_000]

export interface StepOutcome {
  name: string
  ok: boolean
  attempts: number
  /** Exit code of the last attempt; null when the process could not start. */
  code: number | null
  ms: number
}

/**
 * Runs `attempt` until it succeeds, waiting `delays[i]` before retry i + 1,
 * so there are at most `delays.length + 1` attempts.
 */
export async function withRetries(
  attempt: () => Promise<number | null>,
  delays: readonly number[],
  sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
): Promise<{ ok: boolean, attempts: number, code: number | null }> {
  let code: number | null = null
  for (let i = 0; i <= delays.length; i++) {
    if (i > 0)
      await sleep(delays[i - 1]!)
    code = await attempt()
    if (code === 0)
      return { ok: true, attempts: i + 1, code }
  }
  return { ok: false, attempts: delays.length + 1, code }
}

/** Runs a script with this Node, from the app directory, its output logged. */
export function runScript(step: RefreshStep, cwd = process.cwd()): Promise<number | null> {
  const path = resolve(cwd, step.script)
  if (!existsSync(path)) {
    console.error(`[cards:refresh] ${step.script} is missing from ${cwd}`)
    return Promise.resolve(null)
  }
  return new Promise((done) => {
    const child = spawn(process.execPath, [path, ...(step.args ?? [])], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const relay = (write: (line: string) => void) => (chunk: Buffer) => {
      for (const line of chunk.toString().split(/[\r\n]+/)) {
        if (line.trim())
          write(`[cards:refresh:${step.name}] ${line.trim()}`)
      }
    }
    // Operational output goes through warn, as elsewhere on the server.
    child.stdout.on('data', relay(console.warn))
    child.stderr.on('data', relay(console.error))
    child.on('error', (err) => {
      console.error(`[cards:refresh:${step.name}] ${err.message}`)
      done(null)
    })
    child.on('close', code => done(code))
  })
}

export interface RefreshOptions {
  steps?: readonly RefreshStep[]
  run?: (step: RefreshStep) => Promise<number | null>
  delays?: readonly number[]
  /** After each step, so a rebuilt database serves before the next one starts. */
  onStep?: (outcome: StepOutcome) => void
}

/** Every step, each with its retries. A failed step does not stop the next. */
export async function refreshCards(options: RefreshOptions = {}): Promise<StepOutcome[]> {
  const { steps = REFRESH_STEPS, run = runScript, delays = RETRY_DELAYS_MS, onStep } = options
  const outcomes: StepOutcome[] = []
  for (const step of steps) {
    const t0 = Date.now()
    const r = await withRetries(() => run(step), delays)
    const outcome = { name: step.name, ...r, ms: Date.now() - t0 }
    outcomes.push(outcome)
    onStep?.(outcome)
  }
  return outcomes
}
