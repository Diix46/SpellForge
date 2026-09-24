import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageUrl } from '../server/utils/cards/mtg-shape'
import { isRecomposed, RECOMPOSED_DIR, RECOMPOSED_VERSION } from '../server/utils/images/recomposed'

describe('recomposed image URLs', () => {
  it('mark the recomposed card with r, apart from the official scan', () => {
    const id = '00000000-0000-4000-8000-000000000000'
    expect(imageUrl('large', 'front', id, '42')).toBe(`/api/images/mtg/large/front/${id}.jpg?v=42`)
    expect(imageUrl('large', 'front', id, '42', undefined, true)).toBe(`/api/images/mtg/large/front/${id}.jpg?v=42&r=${RECOMPOSED_VERSION}`)
    expect(imageUrl('normal', 'front', id, '42', 'thumb', true)).toContain('size=thumb')
  })
})

describe('recomposed images on disk', () => {
  // A throwaway id in the real folder (gitignored .data): the lookup reads it.
  const id = 'ffffffff-ffff-4fff-8fff-fffffffffff0'
  const file = resolve(RECOMPOSED_DIR, `${id}.jpg`)
  beforeAll(() => {
    mkdirSync(RECOMPOSED_DIR, { recursive: true })
    writeFileSync(file, 'x')
  })
  afterAll(() => rmSync(file, { force: true }))

  it('are found by printing id', () => {
    expect(isRecomposed(id)).toBe(true)
    expect(isRecomposed('ffffffff-ffff-4fff-8fff-fffffffffff1')).toBe(false)
  })
})
