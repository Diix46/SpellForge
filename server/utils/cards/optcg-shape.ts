/**
 * Database rows → the OptcgCard the client consumes.
 */
import type { Row } from '@libsql/client'
import type { OptcgCategory, OptcgColor } from '../../../shared/optcg/rules'
import type { OptcgCard, OptcgPrint } from '../../../shared/optcg/types'

/** Bandai publishes WebP on the French site and PNG on the English one. */
export const OPTCG_IMAGE_EXT = { fr: 'webp', en: 'png' } as const

export function optcgImageUrl(lang: string, id: string, version: unknown, size?: 'thumb'): string {
  const params = new URLSearchParams()
  if (typeof version === 'string' && version)
    params.set('v', version)
  if (size)
    params.set('size', size)
  const query = params.size ? `?${params}` : ''
  return `/api/images/optcg/${lang === 'fr' ? 'fr' : 'en'}/${id}${query}`
}

function list<T = string>(json: unknown): T[] {
  if (typeof json !== 'string' || !json)
    return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

const int = (v: unknown) => (typeof v === 'number' ? v : v == null ? null : Number(v))

export function toOptcgCard(r: Row): OptcgCard {
  const lang = r.text_lang === 'fr' ? 'fr' : 'en'
  const id = String(r.id)
  return {
    id,
    number: String(r.card_number),
    lang,
    name: String(r.name),
    category: String(r.category) as OptcgCategory,
    colors: list<OptcgColor>(r.colors),
    rarity: r.rarity == null ? null : String(r.rarity),
    cost: int(r.cost),
    life: int(r.life),
    power: int(r.power),
    counter: int(r.counter),
    attributes: list(r.attributes),
    types: list(r.types),
    effect: r.effect ? String(r.effect) : null,
    trigger: r.trigger_text ? String(r.trigger_text) : null,
    set: r.set_code == null ? null : String(r.set_code),
    block: int(r.block),
    banned: !!r.is_banned,
    variants: Number(r.variants ?? 1),
    image: optcgImageUrl(lang, id, r.img_version),
    thumb: optcgImageUrl(lang, id, r.img_version, 'thumb'),
  }
}

export function toOptcgPrint(r: Row): OptcgPrint {
  const lang = r.lang === 'fr' ? 'fr' : 'en'
  const id = String(r.id)
  return {
    id,
    lang,
    rarity: r.rarity == null ? null : String(r.rarity),
    set: r.set_code == null ? null : String(r.set_code),
    image: optcgImageUrl(lang, id, r.img_version),
    thumb: optcgImageUrl(lang, id, r.img_version, 'thumb'),
  }
}
