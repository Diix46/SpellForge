import { logError } from '../utils/errorLog'

// A visitor's browser reporting an error (plugins/error-report.client.ts).
// No session needed; a few per minute per address at most, trimmed.
const recent = new Map<string, number[]>()

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const now = Date.now()
  const mine = (recent.get(ip) ?? []).filter(t => now - t < 60_000)
  if (mine.length >= 5)
    return { ok: false }
  recent.set(ip, [...mine, now])
  if (recent.size > 5000)
    recent.clear()
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  const text = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined)
  logError({ source: 'client', message: text(body.message, 500) ?? 'Erreur sans message', where: text(body.url, 300), stack: text(body.stack, 1500) })
  return { ok: true }
})
