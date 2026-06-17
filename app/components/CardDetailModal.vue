<script setup lang="ts">
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed, ref, watch } from 'vue'
import { useCardmarket } from '~/composables/useCardmarket'
import { useLocale } from '~/composables/useLocale'
import { displayName, displayOracle, displayType, englishTypeLine, isCommanderType } from '~/composables/useMtg'

const props = defineProps<{
  open: boolean
  card: ResolvedCard | null
  isCommander?: boolean
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'setCommander': [card: ResolvedCard]
}>()

const { t, rarityLabel, isFr } = useLocale()

// Only legendary creatures / planeswalkers can be commanders.
const canBeCommander = computed(() => isCommanderType(englishTypeLine(props.card?.card ?? null)))

const { searchUrl } = useCardmarket()

const showBack = ref(false)
watch(() => props.card, () => {
  showBack.value = false
})

const c = computed(() => props.card?.card ?? null)
const isDfc = computed(() => !!props.card?.backImageUrl)

const displayImage = computed(() => {
  if (showBack.value && props.card?.backImageUrl)
    return props.card.backImageUrl
  return props.card?.imageUrl ?? null
})

// Pull face-aware fields (front vs back) when relevant.
const face = computed(() => {
  const card = c.value
  if (!card)
    return null
  if (isDfc.value && card.card_faces) {
    return card.card_faces[showBack.value ? 1 : 0]
  }
  return null
})

const localizedName = computed(() =>
  displayName(c.value, true, face.value) || props.card?.entry.name || '',
)
const englishName = computed(() => displayName(c.value, false, face.value))
// Primary name follows the site locale; FR keeps the EN name as a subtitle.
const primaryName = computed(() => (isFr.value ? localizedName.value : englishName.value))
const subName = computed(() => {
  if (!isFr.value)
    return ''
  return englishName.value && englishName.value.toLowerCase() !== localizedName.value.toLowerCase()
    ? englishName.value
    : ''
})

const typeLine = computed(() => displayType(c.value, isFr.value, face.value))
const manaCost = computed(() => face.value?.mana_cost ?? c.value?.mana_cost ?? '')
const oracle = computed(() => displayOracle(c.value, isFr.value, face.value))
const setLine = computed(() => {
  if (!c.value)
    return ''
  return [
    c.value.set_name,
    `#${c.value.collector_number}`,
    rarityLabel(c.value.rarity),
  ].filter(Boolean).join(' · ')
})
const priceEur = computed(() => {
  const p = props.card?.priceEur ?? c.value?.prices?.eur
  return p ? `${p} €` : null
})
const cmUrl = computed(() => searchUrl(englishName.value || props.card?.entry.name || ''))
const scryUrl = computed(() => c.value?.scryfall_uri?.replace(/\?.*$/, '') ?? null)

// Render mana symbols like {2}{W}{U} as readable pips.
const manaSymbols = computed(() => {
  const m = manaCost.value
  if (!m)
    return []
  return (m.match(/\{[^}]+\}/g) ?? []).map(s => s.replace(/[{}]/g, ''))
})

function symbolColor(sym: string): string {
  const map: Record<string, string> = {
    W: 'var(--color-mana-w)',
    U: 'var(--color-mana-u)',
    B: 'var(--color-mana-b)',
    R: 'var(--color-mana-r)',
    G: 'var(--color-mana-g)',
  }
  return map[sym] ?? 'var(--color-ink-500)'
}

// ----- Keyword highlighting -----
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

const keywordTerms = computed<string[]>(() => {
  const kws = c.value?.keywords ?? []
  const terms = new Set<string>()
  for (const kw of kws) {
    if (isFr.value) {
      terms.add(KW_FR[kw] ?? kw)
    }
    else {
      terms.add(kw)
    }
  }
  return [...terms].filter(Boolean)
})

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build oracle text as HTML with keyword terms wrapped in a highlight span.
const oracleHtml = computed(() => {
  let html = oracle.value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // Copy before sorting so we don't mutate the source computed array.
  const terms = [...keywordTerms.value].sort((a, b) => b.length - a.length)
  for (const term of terms) {
    // word-boundary-ish: start of line or non-letter before; case-insensitive
    const re = new RegExp(`(^|[^\\p{L}])(${escapeRe(term)})`, 'giu')
    html = html.replace(re, (_m, pre, word) => `${pre}<span class="kw">${word}</span>`)
  }
  return html.replace(/\n/g, '<br>')
})
</script>

<template>
  <UModal
    :open="open"
    :title="primaryName || 'Card'"
    :ui="{ overlay: 'bg-ink-950/80 backdrop-blur-[6px]', content: 'glass rounded-[var(--radius-2xl)] w-[80vw] sm:max-w-[80vw]', header: 'sr-only' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div
        v-if="card"
        class="grid grid-cols-1 gap-6 p-1 sm:grid-cols-[minmax(0,_46%)_1fr]"
      >
        <!-- Image (hero: scales with the modal, capped to the viewport height) -->
        <div class="relative">
          <img
            v-if="displayImage"
            :src="displayImage"
            :alt="englishName"
            class="mx-auto block max-h-[78vh] w-full rounded-[var(--radius-lg)] object-contain shadow-[var(--shadow-elev-3)]"
          >
          <div
            v-else
            class="flex aspect-[63/88] items-center justify-center rounded-[var(--radius-lg)] bg-(--color-surface-2) text-(--color-text-muted)"
          >
            <UIcon
              name="i-lucide-image-off"
              class="h-10 w-10"
            />
          </div>

          <button
            v-if="isDfc"
            class="mt-3 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-(--color-border-strong) py-2 text-sm text-(--color-text-mid) transition-colors hover:border-(--accent-border) hover:text-(--accent-text)"
            @click="showBack = !showBack"
          >
            <UIcon
              name="i-lucide-flip-horizontal-2"
              class="h-4 w-4"
            />
            {{ showBack ? t('card.flipFront') : t('card.flipBack') }}
          </button>
        </div>

        <!-- Info -->
        <div class="min-w-0">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 class="font-display text-xl font-bold text-(--color-text-high)">
                {{ primaryName }}
              </h2>
              <p
                v-if="subName"
                class="font-mono text-xs text-(--color-text-muted)"
              >
                {{ subName }}
              </p>
            </div>
            <div
              v-if="manaSymbols.length"
              class="flex shrink-0 items-center gap-1"
            >
              <span
                v-for="(s, i) in manaSymbols"
                :key="i"
                class="grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-(--color-bg-base)"
                :style="{ background: symbolColor(s) }"
              >{{ s }}</span>
            </div>
          </div>

          <div class="mb-3 flex flex-wrap items-center gap-2">
            <span
              v-if="typeLine"
              class="rounded-full bg-(--color-surface-2) px-2.5 py-1 text-xs text-(--color-text-mid)"
            >
              {{ typeLine }}
            </span>
            <span
              class="rounded-full px-2.5 py-1 font-mono text-xs"
              :class="card.lang === 'fr' ? 'accent-soft-bg text-(--accent-text)' : 'bg-(--color-surface-2) text-(--color-text-muted)'"
            >
              {{ card.lang.toUpperCase() }}
            </span>
            <span
              v-if="card.entry.quantity > 1"
              class="rounded-full bg-(--color-surface-2) px-2.5 py-1 font-mono text-xs text-(--color-text-mid)"
            >
              ×{{ card.entry.quantity }}
            </span>
          </div>

          <!-- Keyword chips -->
          <div
            v-if="keywordTerms.length"
            class="mb-3 flex flex-wrap gap-1.5"
          >
            <span
              v-for="kw in keywordTerms"
              :key="kw"
              class="accent-soft-bg rounded-md px-2 py-0.5 text-xs font-semibold text-(--accent-text)"
            >{{ kw }}</span>
          </div>

          <!-- Oracle text with highlighted keywords.
               Safe: oracleHtml escapes <,>,& from the source text and only injects
               our own <span class="kw"> / <br> markup (see oracleHtml computed). -->
          <!-- eslint-disable vue/no-v-html -->
          <p
            v-if="oracle"
            class="oracle mb-4 rounded-[var(--radius-lg)] bg-(--color-surface-2)/60 p-3 text-sm leading-relaxed text-(--color-text-mid)"
            v-html="oracleHtml"
          />
          <!-- eslint-enable vue/no-v-html -->

          <p
            v-if="setLine"
            class="mb-4 font-mono text-xs text-(--color-text-muted)"
          >
            {{ setLine }}
          </p>

          <div class="flex flex-wrap items-center gap-3 border-t border-(--color-border-subtle) pt-4">
            <span
              v-if="priceEur"
              class="font-mono text-lg font-semibold text-(--accent-text)"
            >{{ priceEur }}</span>
            <span
              v-else
              class="font-mono text-xs text-(--color-text-muted)"
            >{{ t('card.priceNa') }}</span>
            <div class="ml-auto flex gap-2">
              <UButton
                :to="cmUrl"
                target="_blank"
                color="neutral"
                variant="subtle"
                icon="i-lucide-shopping-cart"
                size="sm"
              >
                Cardmarket
              </UButton>
              <UButton
                v-if="scryUrl"
                :to="scryUrl"
                target="_blank"
                color="neutral"
                variant="ghost"
                icon="i-lucide-external-link"
                size="sm"
              >
                Scryfall
              </UButton>
            </div>
          </div>

          <button
            v-if="canBeCommander && !isCommander"
            class="mt-3 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-(--accent-border) py-2 text-sm font-medium text-(--accent-text) transition-colors hover:bg-(--accent-soft)"
            @click="card && emit('setCommander', card)"
          >
            <UIcon
              name="i-lucide-crown"
              class="h-4 w-4"
            />
            {{ t('commander.set') }}
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.oracle :deep(.kw) {
  color: var(--accent-text);
  font-weight: 600;
}
</style>
