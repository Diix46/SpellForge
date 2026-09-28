import { describe, expect, it } from 'vitest'
import { thumbOf } from '../app/utils/cardImage'

describe('thumbOf', () => {
  it('turns a Magic scan into its light copy, its version kept', () => {
    expect(thumbOf('/api/images/mtg/large/front/abc.jpg?v=12')).toBe('/api/images/mtg/normal/front/abc.jpg?v=12&size=thumb')
    expect(thumbOf('/api/images/mtg/normal/front/abc.jpg')).toBe('/api/images/mtg/normal/front/abc.jpg?size=thumb')
  })
  it('leaves other images alone', () => {
    expect(thumbOf('/api/images/tcg/pokemon/fr/sv/sv01/001/high.webp')).toBe('/api/images/tcg/pokemon/fr/sv/sv01/001/high.webp')
    expect(thumbOf(null)).toBeNull()
  })
})
