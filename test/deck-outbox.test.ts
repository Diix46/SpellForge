import type { StoredDeck } from '../shared/decks'
import { describe, expect, it } from 'vitest'
import { applyOutbox, lastSeq, parseOutbox, queueDelete, queueUpsert, settle } from '../shared/deckOutbox'

const deck = (id: string, name = id): StoredDeck => ({ id, name, game: 'mtg', raw: '', createdAt: 1, updatedAt: 2 })

describe('deck outbox', () => {
  it('keeps only the latest write per deck', () => {
    let box = queueUpsert({}, deck('a', 'first'), 1)
    box = queueUpsert(box, deck('a', 'second'), 2)
    expect(Object.keys(box)).toEqual(['a'])
    expect(box.a).toMatchObject({ kind: 'upsert', seq: 2, deck: { name: 'second' } })
    box = queueDelete(box, 'a', 3)
    expect(box.a).toEqual({ kind: 'delete', seq: 3, id: 'a' })
  })

  it('clears an entry only for the write that was sent', () => {
    let box = queueUpsert({}, deck('a'), 1)
    box = queueUpsert(box, deck('a', 'newer'), 2)
    expect(settle(box, 'a', 1)).toBe(box)
    expect(settle(box, 'a', 2)).toEqual({})
  })

  it('lays pending writes over the server list', () => {
    const server = [deck('a', 'server'), deck('b')]
    let box = queueUpsert({}, deck('a', 'local'), 1)
    box = queueDelete(box, 'b', 2)
    box = queueUpsert(box, deck('c'), 3)
    expect(applyOutbox(server, box).map(d => [d.id, d.name])).toEqual([['a', 'local'], ['c', 'c']])
  })

  it('survives storage, and drops what it cannot read', () => {
    const box = queueUpsert(queueDelete({}, 'x', 4), deck('a'), 7)
    const back = parseOutbox(JSON.stringify({ ...box, junk: { kind: 'upsert', deck: { id: 'other' } } }))
    expect(back).toEqual(box)
    expect(lastSeq(back)).toBe(7)
    expect(parseOutbox('{oops')).toEqual({})
    expect(parseOutbox(null)).toEqual({})
  })
})
