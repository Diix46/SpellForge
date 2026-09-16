import type { ScryfallCard } from '../app/composables/scryfall/types'
import { describe, expect, it } from 'vitest'
import { toResolved } from '../app/composables/scryfall/toResolved'

const entry = { quantity: 1, name: 'Sol Ring' }

function uris(face: 'front' | 'back') {
  const url = (size: string) => `/api/images/mtg/${size}/${face}/id.${size === 'png' ? 'png' : 'jpg'}`
  return { small: url('small'), normal: url('normal'), large: url('large'), png: url('png') }
}

function card(over: Partial<ScryfallCard>): ScryfallCard {
  return { id: 'id', name: 'Sol Ring', lang: 'en', set: 'cmd', set_name: 'Commander', collector_number: '261', layout: 'normal', ...over }
}

describe('toResolved', () => {
  it('carries the price, the language and a large front image', () => {
    const r = toResolved(entry, { card: card({ image_uris: uris('front'), prices: { eur: '1.20' } }), lang: 'fr' }, 'fr')
    expect(r.card?.game).toBe('mtg')
    expect(r.priceEur).toBe('1.20')
    expect(r.lang).toBe('fr')
    expect(r.imageUrl).toBe('/api/images/mtg/large/front/id.jpg')
    expect(r.backImageUrl).toBeNull()
    expect(r.error).toBeUndefined()
  })

  it('keeps the back image of a double-faced card', () => {
    const r = toResolved(entry, {
      card: card({
        layout: 'transform',
        card_faces: [
          { name: 'Front', image_uris: uris('front') },
          { name: 'Back', image_uris: uris('back') },
        ],
      }),
      lang: 'en',
    }, 'en')
    expect(r.imageUrl).toBe('/api/images/mtg/large/front/id.jpg')
    expect(r.backImageUrl).toBe('/api/images/mtg/large/back/id.jpg')
  })

  it('does not invent a price the server did not send', () => {
    const r = toResolved(entry, { card: card({ image_uris: uris('front') }), lang: 'en' }, 'en')
    expect(r.priceEur).toBeNull()
  })

  it('passes the server\'s error through for an unresolved card', () => {
    const r = toResolved(entry, { card: null, lang: 'en', error: 'Erreur réseau: timeout' }, 'en')
    expect(r.card).toBeNull()
    expect(r.error).toBe('Erreur réseau: timeout')
  })

  it('falls back to the historical message when a row is missing entirely', () => {
    const r = toResolved(entry, undefined, 'fr')
    expect(r.error).toBe('Carte introuvable: Sol Ring')
    expect(r.lang).toBe('fr')
  })
})
