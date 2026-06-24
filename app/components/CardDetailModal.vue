<script setup lang="ts">
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed, ref, watch } from 'vue'
import { useCardmarket } from '~/composables/useCardmarket'
import { useLocale } from '~/composables/useLocale'
import { displayName, displayOracle, displayType, englishTypeLine, isCommanderType } from '~/composables/useMtg'
import { useOracleText } from '~/composables/useOracleText'

const props = defineProps<{
  open: boolean
  card: ResolvedCard | null
  isCommander?: boolean
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'setCommander': [card: ResolvedCard]
  'setPrinting': [payload: { name: string, set: string, collectorNumber: string }]
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

// ----- Printings gallery (pick a specific edition / art) -----
// The displayed printing + the deck entry's pinned printing (for highlighting).
// The gallery's fetch/open/list state lives in CardPrintingPicker.
const currentPrintKey = computed(() => {
  const card = c.value
  return card ? `${card.set}/${card.collector_number}` : ''
})
const pinnedKey = computed(() => {
  const e = props.card?.entry
  return e?.set && e?.collectorNumber ? `${e.set.toLowerCase()}/${e.collectorNumber}` : ''
})
// Stable per-card key so the picker resets when the displayed card changes.
const cardKey = computed(() => props.card?.card?.id ?? props.card?.entry.name ?? '')

function onPickPrint(p: { set: string, collectorNumber: string }) {
  const name = englishName.value || props.card?.entry.name
  if (!name)
    return
  emit('setPrinting', { name, set: p.set, collectorNumber: p.collectorNumber })
}

// ----- Oracle text: localized keyword chips + typed segments (mana/kw/text) -----
const { keywordTerms, oracleSegments } = useOracleText(c, oracle, isFr)
</script>

<template>
  <UModal
    :open="open"
    :title="primaryName || 'Card'"
    :ui="{
      overlay: 'bg-ink-950/80 backdrop-blur-[6px]',
      content: 'glass rounded-[var(--radius-2xl)] w-[calc(100vw-1.5rem)] sm:max-w-[860px]',
      // Keep the header row (so the close button shows) but hide the duplicated
      // title text — the card name is already rendered as the <h2> in the body.
      header: 'absolute right-0 top-0 z-10 p-3 border-0',
      title: 'sr-only',
      // Visual styling is in scoped CSS ([data-slot=close]) to reliably beat the
      // UButton variant's background (arbitrary utilities lose that cascade).
      // justify-center centers the X glyph horizontally (UButton defaults to
      // justify:normal, which left-biases a lone icon by ~2px).
      close: 'modal-close size-9 justify-center',
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div
        v-if="card"
        class="grid grid-cols-1 gap-6 p-1 sm:grid-cols-[300px_minmax(0,1fr)]"
      >
        <!-- Image: sized to the card's natural width so it fills its column
             (no floating in an oversized panel = no "card-in-card" gaps). -->
        <div class="relative">
          <img
            v-if="displayImage"
            :src="displayImage"
            :alt="englishName || props.card?.entry.name || 'Carte'"
            class="mx-auto block w-full max-w-[300px] rounded-[var(--radius-lg)] object-contain shadow-[var(--shadow-elev-3)]"
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
          <!-- Mana cost is pinned to the modal's top-right, in a box that mirrors
               the close button's exactly. Both share this content box as their
               positioning context and both use top-4 (the close button's own CSS
               top is 16px) + a size-9/h-9 box + items-center, so the pip's center
               lands on the button's center — no magic offset, no header coupling.
               right-14 (56px) clears the button's disc; pr-14 keeps the title off
               both. !flex overrides ManaCost's own inline-flex so h-9 applies. -->
          <ManaCost
            v-if="manaCost"
            :cost="manaCost"
            :size="24"
            class="absolute right-14 top-4 z-10 !flex h-9 items-center"
          />
          <div class="mb-3 pr-14">
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

          <!-- Oracle text: mana symbols as pips, keywords highlighted. Rendered
               from typed segments (no v-html). -->
          <p
            v-if="oracle"
            class="oracle mb-4 rounded-[var(--radius-lg)] bg-(--color-surface-2)/60 p-3 text-sm leading-relaxed text-(--color-text-mid)"
          >
            <template
              v-for="(seg, i) in oracleSegments"
              :key="i"
            >
              <br v-if="seg.t === 'br'">
              <ManaSymbol
                v-else-if="seg.t === 'mana'"
                :sym="seg.v"
                :size="15"
                class="mx-px"
              />
              <span
                v-else-if="seg.t === 'kw'"
                class="kw"
              >{{ seg.v }}</span>
              <template v-else>
                {{ seg.v }}
              </template>
            </template>
          </p>

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
                icon="i-lucide-shopping-cart"
                size="sm"
                class="border border-(--accent-border) bg-(--accent-soft) text-(--accent-text) hover:bg-[rgba(var(--accent-rgb),0.28)]"
              >
                Cardmarket
              </UButton>
              <UButton
                v-if="scryUrl"
                :to="scryUrl"
                target="_blank"
                icon="i-lucide-external-link"
                size="sm"
                class="border border-(--color-border-strong) bg-(--color-surface-2) text-(--color-text-high) hover:border-(--color-border-strong) hover:bg-(--color-surface-3)"
              >
                Scryfall
              </UButton>
            </div>
          </div>

          <!-- Printings selector -->
          <CardPrintingPicker
            class="mt-4"
            :open="open"
            :english-name="englishName"
            :card-key="cardKey"
            :current-print-key="currentPrintKey"
            :pinned-key="pinnedKey"
            @pick="onPickPrint"
          />

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
/* Close button: a dark frosted disc with a light glyph, top-right of the modal.
   Scoped + :deep beats the UButton neutral variant's own background. */
:deep(.modal-close) {
  color: var(--color-text-high);
  background: rgba(26, 26, 29, 0.85);
  box-shadow: inset 0 0 0 1px var(--color-border-strong);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}
:deep(.modal-close:hover) {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}

.oracle :deep(.kw) {
  color: var(--accent-text);
  font-weight: 600;
}
</style>
