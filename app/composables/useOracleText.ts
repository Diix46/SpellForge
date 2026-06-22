import type { ComputedRef } from 'vue'
import type { ScryfallCard } from '~/composables/useScryfall'
import { computed } from 'vue'

// Oracle-text presentation for the card detail modal: localized keyword terms +
// the typed segmentation that lets us render mana pips and keyword highlights as
// real elements (no v-html). Extracted from CardDetailModal so the modal focuses
// on layout. Pure derivation over the card + its (face-aware) oracle text.

// English keyword → French translation (the common evergreen + popular ones).
const KW_FR: Record<string, string> = {
  'Vigilance': 'Vigilance',
  'Flying': 'Vol',
  'Trample': 'Piétinement',
  'Haste': 'Célérité',
  'Lifelink': 'Lien de vie',
  'Deathtouch': 'Contact mortel',
  'First strike': 'Initiative',
  'Double strike': 'Double initiative',
  'Reach': 'Portée',
  'Menace': 'Menace',
  'Hexproof': 'Défense talismanique',
  'Shroud': 'Linceul',
  'Indestructible': 'Indestructible',
  'Defender': 'Défenseur',
  'Flash': 'Flash',
  'Ward': 'Protection',
  'Scry': 'Méditer',
  'Prowess': 'Prouesse',
  'Equip': 'Équipement',
  'Enchant': 'Enchanter',
  'Cycling': 'Recyclage',
  'Kicker': 'Surcoût',
  'Flashback': 'Flash-back',
  'Convoke': 'Convocation',
  'Delve': 'Fouille',
  'Adventure': 'Aventure',
  'Mill': 'Meule',
  'Proliferate': 'Prolifération',
  'Surveil': 'Veiller',
  'Crew': 'Conduite',
  'Embalm': 'Embaumement',
  'Eternalize': 'Éternisation',
  'Exalted': 'Exaltation',
  'Infect': 'Infection',
  'Toxic': 'Toxique',
  'Affinity': 'Affinité',
  'Cascade': 'Cascade',
  'Storm': 'Tempête',
  'Annihilator': 'Annihilateur',
  'Persist': 'Persistance',
  'Undying': 'Sans fin',
  'Mentor': 'Mentor',
  'Riot': 'Émeute',
  'Afterlife': 'Au-delà',
  'Escape': 'Évasion',
  'Companion': 'Compagnon',
  'Mutate': 'Mutation',
  'Foretell': 'Présage',
  'Boast': 'Vantardise',
  'Disturb': 'Trouble',
  'Daybound': 'Lié au jour',
  'Nightbound': 'Lié à la nuit',
  'Cleave': 'Fendre',
  'Training': 'Entraînement',
  'Blitz': 'Razzia',
  'Casualty': 'Sacrifice',
  'Connive': 'Combine',
  'Backup': 'Renfort',
  'Bargain': 'Tractation',
}

// A segment is plain text, a mana symbol, a keyword to highlight, or a line break.
export type OracleSegment
  = | { t: 'text', v: string }
    | { t: 'mana', v: string }
    | { t: 'kw', v: string }
    | { t: 'br' }

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function useOracleText(
  card: ComputedRef<ScryfallCard | null>,
  oracle: ComputedRef<string>,
  isFr: ComputedRef<boolean>,
) {
  const keywordTerms = computed<string[]>(() => {
    const kws = card.value?.keywords ?? []
    const terms = new Set<string>()
    for (const kw of kws)
      terms.add(isFr.value ? (KW_FR[kw] ?? kw) : kw)
    return [...terms].filter(Boolean)
  })

  const oracleSegments = computed<OracleSegment[]>(() => {
    const text = oracle.value
    if (!text)
      return []
    const terms = [...keywordTerms.value].filter(Boolean).sort((a, b) => b.length - a.length)
    // One regex: a {mana} token, a newline, or any keyword (whole-word-ish).
    const kwAlt = terms.length ? `|(?<kw>(?<=^|[^\\p{L}])(?:${terms.map(escapeRe).join('|')})(?=$|[^\\p{L}]))` : ''
    const re = new RegExp(`(?<mana>\\{[^}]+\\})|(?<br>\\n)${kwAlt}`, 'giu')
    const out: OracleSegment[] = []
    let last = 0
    for (const m of text.matchAll(re)) {
      if (m.index > last)
        out.push({ t: 'text', v: text.slice(last, m.index) })
      const g = m.groups ?? {}
      if (g.mana)
        out.push({ t: 'mana', v: g.mana.replace(/[{}]/g, '') })
      else if (g.br)
        out.push({ t: 'br' })
      else if (g.kw)
        out.push({ t: 'kw', v: m[0] })
      last = m.index + m[0].length
    }
    if (last < text.length)
      out.push({ t: 'text', v: text.slice(last) })
    return out
  })

  return { keywordTerms, oracleSegments }
}
