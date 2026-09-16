import type { TideCard, TideFrame } from '../app/utils/cardTide'
import { describe, expect, it } from 'vitest'
import { dealTide, hasCorridors, showcaseSlot, sideOfCell, solveTideGrid, tideFromMagic, tideFromPoster, tideUniqueImages } from '../app/utils/cardTide'

function card(side: TideCard['side'], name: string): TideCard {
  return { side, name, detail: '', image: `/${name}.webp`, full: `/${name}.png`, accent: '0, 0, 0', pips: [], path: '/' }
}
const ops = Array.from({ length: 10 }, (_, i) => card('op', `op${i}`))
const mtgs = Array.from({ length: 10 }, (_, i) => card('mtg', `mtg${i}`))

// A fixed sequence, so shuffles are reproducible.
function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

describe('solveTideGrid', () => {
  it.each([
    [1440, 900],
    [1920, 1000],
    [3440, 1440],
    [1024, 768],
    [390, 844],
  ])('covers a %i by %i frame within the card budget', (w, h) => {
    const grid = solveTideGrid(w, h)
    const budget = w <= 720 ? 64 : w <= 1100 ? 84 : 140
    const pitch = grid.cw * 0.52
    expect(grid.count).toBe(grid.cols * grid.rows)
    expect(grid.cols * pitch).toBeGreaterThanOrEqual(w)
    expect(grid.rows * grid.ch * 0.52).toBeGreaterThanOrEqual(h)
    // The largest card size stops the growth even when the budget is not met.
    if (grid.cw < (w <= 720 ? 160 : 300))
      expect(grid.count).toBeLessThanOrEqual(budget)
    expect(grid.ch).toBe(Math.round(grid.cw * 1.4))
  })
})

describe('tideUniqueImages', () => {
  it('downloads fewer images on a phone', () => {
    expect(tideUniqueImages(390)).toBeLessThan(tideUniqueImages(1440))
  })
})

describe('sideOfCell', () => {
  it('puts One Piece on the left and Magic on the right', () => {
    expect(sideOfCell(0, 0, 6)).toBe('op')
    expect(sideOfCell(2, 0, 6)).toBe('op')
    expect(sideOfCell(3, 0, 6)).toBe('mtg')
    expect(sideOfCell(5, 3, 6)).toBe('mtg')
  })

  it('interlocks the middle column of an odd grid', () => {
    expect(sideOfCell(3, 0, 7)).toBe('op')
    expect(sideOfCell(3, 1, 7)).toBe('mtg')
  })
})

describe('dealTide', () => {
  it('gives each cell a card of its own world', () => {
    const grid = { cols: 6, count: 36 }
    const dealt = dealTide(grid, ops, mtgs, { random: seeded() })
    expect(dealt).toHaveLength(36)
    dealt.forEach((c, i) => expect(c.side).toBe(sideOfCell(i % 6, Math.floor(i / 6), 6)))
  })

  it('downloads no more distinct images than asked', () => {
    const dealt = dealTide({ cols: 8, count: 64 }, ops, mtgs, { unique: 4, random: seeded(7) })
    expect(new Set(dealt.filter(c => c.side === 'op').map(c => c.image)).size).toBe(4)
    expect(new Set(dealt.filter(c => c.side === 'mtg').map(c => c.image)).size).toBe(4)
  })

  it('uses every card before repeating one', () => {
    const dealt = dealTide({ cols: 2, count: 20 }, ops, mtgs, { random: seeded(3) })
    expect(new Set(dealt.map(c => c.name)).size).toBe(20)
  })

  it('fills the frame from one world when the other has no cards', () => {
    const dealt = dealTide({ cols: 4, count: 16 }, [], mtgs, { random: seeded() })
    expect(dealt).toHaveLength(16)
    expect(dealt.every(c => c.side === 'mtg')).toBe(true)
    expect(dealTide({ cols: 4, count: 16 }, [], [])).toEqual([])
  })
})

describe('showcaseSlot', () => {
  const desktop: TideFrame = {
    width: 1440,
    height: 900,
    top: 72,
    panel: { left: 370, right: 1070, top: 220, bottom: 740 },
    cw: 160,
    ch: 224,
  }

  it('centres each world in its own corridor, level with the panel', () => {
    const op = showcaseSlot('op', desktop)!
    const mtg = showcaseSlot('mtg', desktop)!
    expect(op.x + desktop.cw / 2).toBe(185)
    expect(mtg.x + desktop.cw / 2).toBe(1070 + 185)
    expect(op.y + desktop.ch / 2).toBe(480)
    expect(op.scale).toBe(mtg.scale)
    // The scaled card stays inside its corridor.
    expect(desktop.cw * op.scale).toBeLessThanOrEqual(370 - 48)
    expect(hasCorridors(desktop)).toBe(true)
  })

  it('keeps a tall card clear of the header and the bottom edge', () => {
    const low = { ...desktop, height: 700, panel: { ...desktop.panel, top: 400, bottom: 690 } }
    const slot = showcaseSlot('op', low)!
    const half = (low.ch * slot.scale) / 2
    expect(slot.y + low.ch / 2 - half).toBeGreaterThanOrEqual(low.top)
    expect(slot.y + low.ch / 2 + half).toBeLessThanOrEqual(low.height)
  })

  it('uses the band above the panel on a phone', () => {
    const phone: TideFrame = { width: 390, height: 844, top: 64, panel: { left: 16, right: 374, top: 330, bottom: 800 }, cw: 110, ch: 154 }
    expect(hasCorridors(phone)).toBe(false)
    const op = showcaseSlot('op', phone)!
    const mtg = showcaseSlot('mtg', phone)!
    expect(op.x + phone.cw / 2).toBeLessThan(195)
    expect(mtg.x + phone.cw / 2).toBeGreaterThan(195)
    const bottom = op.y + phone.ch / 2 + (phone.ch * op.scale) / 2
    expect(bottom).toBeLessThanOrEqual(phone.panel.top)
  })

  it('gives up when there is no room', () => {
    const cramped: TideFrame = { width: 360, height: 560, top: 60, panel: { left: 16, right: 344, top: 80, bottom: 540 }, cw: 110, ch: 154 }
    expect(showcaseSlot('mtg', cramped)).toBeNull()
  })
})

describe('tide cards', () => {
  it('lights a Magic card with its first mana colour and links its page', () => {
    const c = tideFromMagic({ name: 'Anneau solaire', path: '/magic/card/Sol%20Ring', image: '/n.jpg', thumb: '/n.jpg?size=thumb', art: '', artist: 'Mike Bierek', colors: ['u', 'r'] })
    expect(c).toMatchObject({ side: 'mtg', detail: 'Mike Bierek', image: '/n.jpg?size=thumb', full: '/n.jpg', accent: '79, 168, 232', path: '/magic/card/Sol%20Ring' })
    expect(c.pips).toHaveLength(2)
    expect(tideFromMagic({ name: 'x', path: '/', image: '/i', thumb: '', art: '', artist: '', colors: [] }).image).toBe('/i')
  })

  it('lights a One Piece card with its colour and links it by number', () => {
    const c = tideFromPoster({ number: 'OP01-001', name: 'Roronoa Zoro', category: 'Leader', colors: ['Red'], power: 5000, image: '/f.webp', thumb: '/t.webp' })
    expect(c).toMatchObject({ side: 'op', detail: 'OP01-001', accent: '201, 49, 42', pips: ['#c9312a'], path: '/one-piece/card/OP01-001' })
  })
})
