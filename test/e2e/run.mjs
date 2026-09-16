/**
 * Runs every end-to-end scenario against a running build (see support.mjs).
 */
import process from 'node:process'
import { run as account } from './account.mjs'
import { run as guestMtg } from './guest-mtg.mjs'
import { run as guestOptcg } from './guest-optcg.mjs'

async function main() {
  let ok = true
  for (const scenario of [guestOptcg, guestMtg, account]) {
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
