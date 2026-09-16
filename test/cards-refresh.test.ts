import { describe, expect, it } from 'vitest'
import { refreshCards, withRetries } from '../server/utils/cards/refresh'

async function noWait() {}

describe('withRetries', () => {
  it('stops at the first success', async () => {
    const codes = [1, 0, 0]
    const waits: number[] = []
    const r = await withRetries(async () => codes.shift()!, [10, 20], async ms => void waits.push(ms))
    expect(r).toEqual({ ok: true, attempts: 2, code: 0 })
    expect(waits).toEqual([10])
  })

  it('gives up after one attempt per delay plus one', async () => {
    let calls = 0
    const r = await withRetries(async () => {
      calls++
      return null
    }, [1, 2], noWait)
    expect(r).toEqual({ ok: false, attempts: 3, code: null })
    expect(calls).toBe(3)
  })
})

describe('refreshCards', () => {
  it('runs every step in order, even after a failed one', async () => {
    const seen: string[] = []
    const steps = [{ name: 'a', script: 'a.mjs' }, { name: 'b', script: 'b.mjs' }]
    const reported: string[] = []
    const outcomes = await refreshCards({
      steps,
      delays: [0],
      run: async (s) => {
        seen.push(s.name)
        return s.name === 'a' ? 2 : 0
      },
      onStep: o => reported.push(`${o.name}:${o.ok}`),
    })
    expect(seen).toEqual(['a', 'a', 'b'])
    expect(reported).toEqual(['a:false', 'b:true'])
    expect(outcomes.map(o => [o.name, o.ok, o.attempts, o.code])).toEqual([['a', false, 2, 2], ['b', true, 1, 0]])
  })
})
