<script setup lang="ts">
import type { PinFields } from '#shared/mtg/prints'
import type { PrintOption } from '~/composables/usePrintings'
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed, ref, watch } from 'vue'
import { cardPath } from '#shared/game'
import { useCardmarket } from '~/composables/useCardmarket'
import { useLocale } from '~/composables/useLocale'
import { useMembersOnly } from '~/composables/useMembersOnly'
import { displayName, displayOracle, displayType, isCommanderType } from '~/composables/useMtg'
import { useOracleText } from '~/composables/useOracleText'
import { pinPrintKey, printKey } from '~/composables/usePrintings'
import { mtgRaw } from '~/composables/useScryfall'

const props = defineProps<{
  open: boolean
  card: ResolvedCard | null
  isCommander?: boolean
  /** Opened from the card library: no deck to pin a printing on, and the
   *  commander action starts a new deck instead. */
  library?: boolean
  /** The card is in the deck: only then can a printing be pinned on it. */
  inDeck?: boolean
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'setCommander': [card: ResolvedCard]
  /** No set/number: back to the automatic printing. */
  'setPrinting': [payload: { name: string, set?: string, collectorNumber?: string, lang?: 'en', hd?: true }]
}>()

const { t, rarityLabel, isFr, locale } = useLocale()

// Only legendary creatures / planeswalkers can be commanders.
const canBeCommander = computed(() => isCommanderType(props.card?.card?.typeLine ?? ''))

const { searchUrl } = useCardmarket()

const showBack = ref(false)
// The printing under the pointer in the artwork strip, and the one just picked
// (shown until the deck re-resolves and hands the modal the new card).
const previewPrint = ref<PrintOption | null>(null)
const chosenPrint = ref<PrintOption | null | undefined>(undefined)
watch(() => props.card, () => {
  showBack.value = false
  previewPrint.value = null
  chosenPrint.value = undefined
})
// The sharp French card asked for (see setHd below), shown before the deck
// re-resolves, or as the library's preview.
const hdLocal = ref(false)
watch(() => props.card, () => {
  hdLocal.value = false
})
// The printing the modal shows in place of the resolved card, if any.
const shownPrint = computed(() => previewPrint.value ?? chosenPrint.value ?? null)

// This view is Magic-specific: faces, set line, oracle segments all read
// Scryfall's shape. Narrowing once here keeps the rest of the component as is.
const c = computed(() => mtgRaw(props.card?.card))
const isDfc = computed(() => !!props.card?.backImageUrl)

const displayImage = computed(() => {
  if (shownPrint.value)
    return shownPrint.value.imageLarge ?? shownPrint.value.image
  // Asked for, not re-resolved yet (or the library's preview): the HD card now.
  if (hdLocal.value && c.value?.recomposed_image && !c.value.recomposed && !showBack.value)
    return c.value.recomposed_image
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
  const p = shownPrint.value
  if (p)
    return [p.setName, `#${p.collectorNumber}`, p.lang.toUpperCase()].filter(Boolean).join(' · ')
  if (!c.value)
    return ''
  return [
    c.value.set_name,
    `#${c.value.collector_number}`,
    rarityLabel(c.value.rarity),
  ].filter(Boolean).join(' · ')
})
const priceEur = computed(() => {
  if (shownPrint.value)
    return shownPrint.value.priceEur ? `${shownPrint.value.priceEur} €` : null
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
  return card ? printKey(card.set, card.collector_number, card.lang) : ''
})
// A pick shows at once; the entry's own pin catches up after the re-resolve.
const pinnedKey = computed(() => {
  if (chosenPrint.value !== undefined)
    return chosenPrint.value ? printKey(chosenPrint.value.set, chosenPrint.value.collectorNumber, chosenPrint.value.lang) : ''
  return props.card ? pinPrintKey(props.card.entry, locale.value) : ''
})
// The strip lists the deck line's card: keyed by the entry, so a pick (which
// changes the printing, hence the card id) keeps the strip and its scroll.
const cardKey = computed(() => props.card?.entry.name ?? '')
// The whole card's name, not the face on show: the back face finds no printings.
const printsName = computed(() => c.value?.name || props.card?.entry.name || '')

function onPickPrint(p: PrintOption | null, pin: PinFields) {
  // The deck line's own name: a double-faced card is listed by its full name,
  // not by the face on show.
  const name = props.card?.entry.name || englishName.value
  if (!name)
    return
  chosenPrint.value = p
  previewPrint.value = null
  showBack.value = false
  // The picker built the pin: "[EN]" when the card also exists in the deck's language.
  emit('setPrinting', { name, ...pin })
}

// ----- The sharp French card (scripts/recompose), on demand -----
// Scryfall's scan is the default. In a deck the choice is saved on the line
// ("[HD]") and the card comes back re-resolved; until then, and in the library
// where nothing is saved, the HD image shows at once.
const hdAvailable = computed(() => !!c.value?.recomposable)
// Shown on every card; when there is nothing to make, the button says why.
const hdUnavailable = computed(() => {
  if (hdAvailable.value || c.value?.recomposed)
    return ''
  if (c.value?.lang !== 'fr')
    return t('recomposed.notFrench')
  if (c.value?.image_status === 'highres_scan')
    return t('recomposed.alreadySharp')
  return t('recomposed.notYet')
})
const hdShown = computed(() => !shownPrint.value && (!!c.value?.recomposed || (hdLocal.value && hdAvailable.value)))

// Choosing artworks (the gallery, the HD card) is for members.
const members = useMembersOnly()
// Adding the printing on display to the collection (members too), or to the
// wishlist.
const collectionOpen = ref(false)
const wishlist = useWishlist('mtg')
function toggleHd() {
  const on = !hdShown.value
  members.require('artwork', () => setHd(on))
}

function setHd(on: boolean) {
  hdLocal.value = on
  const e = props.card?.entry
  if (props.library || !props.inDeck || !e)
    return
  // The printing stays as pinned (or automatic); "[HD]" and "[EN]" exclude each other.
  emit('setPrinting', { name: e.name, set: e.set, collectorNumber: e.collectorNumber, ...(on ? { hd: true as const } : {}) })
}

// ----- Oracle text: localized keyword chips + typed segments (mana/kw/text) -----
const { keywordTerms, oracleSegments } = useOracleText(c, oracle, isFr)
</script>

<template>
  <UModal
    :open="open"
    :title="primaryName || 'Card'"
    :ui="{
      // Above the deck overlays (--z-modal): the preview grid opens this modal.
      overlay: 'bg-ink-950/80 backdrop-blur-[6px] z-[calc(var(--z-modal)+1)]',
      content: 'glass rounded-[var(--radius-2xl)] w-[calc(100vw-1.5rem)] sm:max-w-[860px] z-[calc(var(--z-modal)+1)]',
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
            v-if="c"
            type="button"
            class="mt-3 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-55"
            :class="hdShown
              ? 'border-(--color-border-strong) text-(--color-text-mid) hover:border-(--accent-border) hover:text-(--accent-text)'
              : 'border-(--accent-border) bg-(--accent-soft) text-(--accent-text) enabled:hover:bg-[rgba(var(--accent-rgb),0.28)]'"
            :disabled="!!hdUnavailable || !!shownPrint"
            :title="hdUnavailable || t('recomposed.explain')"
            :aria-describedby="hdUnavailable ? 'hd-why' : undefined"
            @click="toggleHd"
          >
            <UIcon :name="!members.loggedIn.value ? 'i-lucide-lock-keyhole' : hdShown ? 'i-lucide-scan' : 'i-lucide-sparkles'" class="h-4 w-4" />
            {{ hdShown ? t('recomposed.backToScan') : t('recomposed.generate') }}
          </button>
          <p v-if="hdUnavailable" id="hd-why" class="mt-1 text-center text-[11px] text-(--color-text-muted)">
            {{ hdUnavailable }}
          </p>

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
              v-if="hdShown"
              class="flex items-center gap-1 rounded-full bg-(--color-surface-2) px-2.5 py-1 text-xs text-(--color-text-mid)"
              :title="t('recomposed.explain')"
            >
              <UIcon name="i-lucide-sparkles" class="h-3 w-3 text-(--accent-text)" />
              {{ t('recomposed.badge') }}
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
                v-if="c"
                icon="i-lucide-gem"
                size="sm"
                color="neutral"
                variant="subtle"
                :title="t('collection.addToCollection')"
                @click="members.require('collection', () => (collectionOpen = true))"
              >
                <span class="hidden sm:inline">{{ t('collection.addToCollection') }}</span>
              </UButton>
              <UButton
                v-if="c"
                icon="i-lucide-heart"
                size="sm"
                :color="wishlist.wished.value.has(c.id) ? 'error' : 'neutral'"
                variant="subtle"
                :title="t('collection.wish.add')"
                :aria-label="t('collection.wish.add')"
                :disabled="wishlist.wished.value.has(c.id)"
                @click="members.require('collection', () => wishlist.add(c!.id))"
              />
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
                v-if="library && c"
                :to="cardPath('mtg', c.name)"
                icon="i-lucide-link"
                size="sm"
                class="border border-(--color-border-strong) bg-(--color-surface-2) text-(--color-text-high) hover:bg-(--color-surface-3)"
              >
                {{ t('card.page') }}
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

          <button
            v-if="canBeCommander && !isCommander"
            class="mt-3 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-(--accent-border) py-2 text-sm font-medium text-(--accent-text) transition-colors hover:bg-(--accent-soft)"
            @click="card && emit('setCommander', card)"
          >
            <UIcon
              name="i-lucide-crown"
              class="h-4 w-4"
            />
            {{ library ? t('mtg.library.startWith') : t('commander.set') }}
          </button>
        </div>

        <!-- Artwork strip: full width, right under the card, always visible. -->
        <div v-if="!library && inDeck && !members.loggedIn.value" class="members-art sm:col-span-2">
          <UIcon name="i-lucide-images" class="h-5 w-5 shrink-0 text-(--accent-text)" />
          <p class="min-w-0 flex-1">
            {{ t('members.artworkLocked') }}
          </p>
          <UButton size="sm" color="primary" icon="i-lucide-lock-keyhole-open" @click="members.require('artwork')">
            {{ t('members.unlock') }}
          </UButton>
        </div>
        <CardPrintingPicker
          v-else-if="!library && inDeck"
          class="sm:col-span-2"
          :english-name="printsName"
          :card-key="cardKey"
          :current-print-key="currentPrintKey"
          :pinned-key="pinnedKey"
          @pick="onPickPrint"
          @preview="previewPrint = $event"
        />
      </div>
    </template>
  </UModal>
  <CollectionAddDialog v-if="c" v-model:open="collectionOpen" game="mtg" :initial-query="c.name" :initial-printing="c.id" />
</template>

<style scoped>
.members-art {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px dashed var(--accent-border);
  border-radius: var(--radius-md);
  background: var(--accent-soft);
  color: var(--color-text-mid);
  font-size: 13px;
  line-height: 1.45;
}
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
