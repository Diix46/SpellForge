// Launches the Spellforge Coach (Eve agent service) the Nuxt app proxies to.
//
// The Eve production build does NOT auto-load .env, so we read the key from
// agent-coach/.env and inject it into the child's environment. Run with:
//   npm run coach
// then start the app (npm run dev). The app talks to it at EVE_COACH_URL
// (default http://127.0.0.1:3100).

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const coachDir = join(root, 'agent-coach')
const envPath = join(coachDir, '.env')
const serverEntry = join(coachDir, '.output', 'server', 'index.mjs')

function fail(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

// 1) Resolve the API key: prefer the process env, fall back to agent-coach/.env.
let apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey && existsSync(envPath)) {
  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find(l => l.startsWith('ANTHROPIC_API_KEY='))
  if (line)
    apiKey = line.slice('ANTHROPIC_API_KEY='.length).trim()
}
if (!apiKey)
  fail('ANTHROPIC_API_KEY introuvable. Ajoute-le dans agent-coach/.env ou exporte-le.')

// 2) Ensure the Eve service is built.
if (!existsSync(serverEntry))
  fail('agent-coach n\'est pas buildé. Lance: cd agent-coach && npm install && npm run build')

const port = process.env.PORT || '3100'
console.error(`✦ Spellforge Coach → http://127.0.0.1:${port}  (Ctrl-C pour arrêter)`)

// 3) Launch the headless Eve server with the key in its environment.
const child = spawn(process.execPath, [serverEntry], {
  cwd: coachDir,
  stdio: 'inherit',
  env: { ...process.env, ANTHROPIC_API_KEY: apiKey, PORT: port },
})

child.on('exit', code => process.exit(code ?? 0))
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
