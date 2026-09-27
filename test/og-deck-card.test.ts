import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { OG_H, OG_W, renderDeckCard } from '../server/utils/og/deckCard'

describe('a shared deck\'s link preview', () => {
  const card = () => sharp({ create: { width: 63, height: 88, channels: 3, background: '#c33' } }).png().toBuffer()

  it('is drawn at the size link previews expect, cards and words', async () => {
    const png = await renderDeckCard({ game: 'riftbound', name: 'Jinx — un nom de deck assez long pour tenir sur deux lignes', count: 40, images: ['a', 'b', 'c'], countLabel: '40 cartes', fetchImage: card })
    expect(png).not.toBeNull()
    const meta = await sharp(png!).metadata()
    expect([meta.width, meta.height, meta.format]).toEqual([OG_W, OG_H, 'png'])
  })

  it('still draws when a card image cannot be read', async () => {
    const png = await renderDeckCard({ game: 'mtg', name: 'Krenko', count: 100, images: ['broken'], countLabel: '100 cards', fetchImage: async () => Buffer.from('not an image') })
    expect(png).not.toBeNull()
    expect((await sharp(png!).metadata()).width).toBe(OG_W)
  })
})
