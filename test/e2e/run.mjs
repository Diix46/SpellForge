/**
 * Runs every end-to-end scenario against a running build (see support.mjs).
 */
import process from 'node:process'
import { run as account } from './account.mjs'
import { run as collector } from './collector.mjs'
import { run as guestMtg } from './guest-mtg.mjs'
import { run as guestOptcg } from './guest-optcg.mjs'
import { run as smoke } from './smoke.mjs'

async function main() {
  let ok = true
  // SMOKE=1: the read-only walk alone (safe against production).
  const scenarios = process.env.SMOKE ? [smoke] : [smoke, guestOptcg, guestMtg, account, collector]
  for (const scenario of scenarios) {
    try {
      ok = (await scenario()) && ok
    }
    catch (err) {
      console.error('CRASH', err.message)
      ok = false
    }
  }
  process.exitCode = ok ? 0 : 1
}

main()
