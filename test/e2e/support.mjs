/**
 * End-to-end support: a headless Chrome against a running build.
 *
 *   npm run build && node .output/server/index.mjs   (NUXT_SESSION_PASSWORD set)
 *   npm run test:e2e
 *
 * BASE (default http://localhost:3000) and CHROME_PATH (default: the macOS
 * Chrome app) can be overridden. The scenarios create guest decks in their own
 * browser profile and one throwaway account per run (…@test.invalid).
 */
import process from 'node:process'
import { chromium } from 'playwright-core'

export const BASE = process.env.BASE || 'http://localhost:3000'
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** A legal Standard list whose Leader is not first, plus one unreadable line. */
export const OP_LIST = {
  leader: 'OP07-001',
  text: ['4xEB01-002', '4xEB01-003', '4xEB01-004', '1xOP07-001', '4xEB01-005', '4xEB01-006', '4xEB01-007', '4xEB01-008', '4xEB01-009', '4xEB01-010', '4xEB02-001', '4xEB02-002', '4xEB02-003', '2xEB02-004', 'this is not a card'].join('\n'),
}

export function launch() {
  return chromium.launch({ executablePath: CHROME, headless: true })
}

export function recorder(name) {
  const results = []
  const errors = []
  return {
    check(label, ok, detail = '') {
      results.push({ label, ok })
      process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}\n`)
    },
    /** Page errors, console errors and 5xx answers fail the scenario. */
    watch(page, tag = '', ignore = /$^/) {
      page.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`))
      page.on('console', (m) => {
        if ((m.type() === 'error' || /hydrat|mismatch/i.test(m.text())) && !ignore.test(m.text()))
          errors.push(`${tag} ${m.type()}: ${m.text().slice(0, 200)}`)
      })
      page.on('response', (r) => {
        if (r.status() >= 500)
          errors.push(`${tag} HTTP ${r.status()} ${r.url()}`)
      })
    },
    done() {
      const failed = results.filter(r => !r.ok).length
      process.stdout.write(`\n${name}: ${results.length - failed}/${results.length} passed${errors.length ? `, ${errors.length} error(s):\n  ${errors.join('\n  ')}` : ''}\n\n`)
      return failed === 0 && errors.length === 0
    },
  }
}
