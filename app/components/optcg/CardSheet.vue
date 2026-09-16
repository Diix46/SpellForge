<script setup lang="ts">
import type { OptcgCard, OptcgPrint } from '#shared/optcg/types'
import { computed, ref, shallowRef, watch } from 'vue'
import { MIN_LEGAL_BLOCK } from '#shared/optcg/rules'
import { OPTCG_COLOR_HEX } from '~/utils/optcgColors'

// A One Piece card up close: the art (every alternate art one click away), its
// numbers, its effect and trigger. In a deck it also adds, removes and swaps
// the art of the line it came from. Never a print or download action.
const props = withDefaults(defineProps<{
  open: boolean
  card: OptcgCard | null
  lang: 'fr' | 'en'
  /** Copies in the deck, all arts together; null outside a deck. */
  quantity?: number | null
  /** The art the deck line uses, when opened from the deck. */
  lineArt?: string | null
}>(), { quantity: null, lineArt: null })

const emit = defineEmits<{
  'update:open': [value: boolean]
  /** `pinned`: the player picked an art other than the one the sheet opened on. */
  'add': [card: OptcgCard, from: HTMLElement, pinned: boolean]
  'remove': [card: OptcgCard]
  'setArt': [card: OptcgCard]
  /** From the library: start a new deck around this Leader. */
  'start': [card: OptcgCard]
}>()

const { t } = useLocale()

const prints = shallowRef<OptcgPrint[]>([])
const shown = ref<string | null>(null)

watch(() => [props.open, props.card?.number, props.lang] as const, async ([open, number, lang]) => {
  if (!open || !number)
    return
  shown.value = props.lineArt ?? props.card?.id ?? null
  prints.value = []
  try {
    prints.value = (await $fetch<{ prints: OptcgPrint[] }>('/api/optcg/prints', { params: { number, lang } })).prints
  }
  catch {
    prints.value = []
  }
}, { immediate: true })

const current = computed(() => prints.value.find(p => p.id === shown.value) ?? null)
const image = computed(() => current.value?.image ?? props.card?.image ?? '')
/** The card as the shown art: same card, another print. */
const shownCard = computed<OptcgCard | null>(() => {
  const c = props.card
  if (!c || !current.value)
    return c
  return { ...c, id: current.value.id, image: current.value.image, rarity: current.value.rarity, set: current.value.set }
})

const inDeck = computed(() => props.quantity !== null)
const artChanged = computed(() => inDeck.value && shown.value !== (props.lineArt ?? props.card?.number))
const rotated = computed(() => props.card?.block != null && props.card.block < MIN_LEGAL_BLOCK)

const facts = computed(() => {
  const c = props.card
  if (!c)
    return []
  const out: { label: string, value: string }[] = []
  if (c.cost != null)
    out.push({ label: t('optcg.cost'), value: String(c.cost) })
  if (c.life != null)
    out.push({ label: t('optcg.life'), value: String(c.life) })
  if (c.power != null)
    out.push({ label: t('optcg.power'), value: c.power.toLocaleString(props.lang === 'fr' ? 'fr-FR' : 'en-US') })
  if (c.counter != null)
    out.push({ label: t('optcg.counter'), value: `+${c.counter}` })
  return out
})

function onAdd(e: MouseEvent) {
  if (shownCard.value)
    emit('add', shownCard.value, e.currentTarget as HTMLElement, shown.value !== (props.lineArt ?? props.card?.id))
}
</script>

<template>
  <UModal
    :open="open"
    :title="card?.name ?? ''"
    :description="card ? `${card.number} · ${t(`optcg.category.${card.category}`)}` : ''"
    :ui="{ content: 'sm:max-w-3xl sheet', body: 'p-0 sm:p-0' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div v-if="card" class="sheet-grid">
        <div class="sheet-art">
          <div class="frame">
            <img :src="image" :alt="card.name" width="600" height="838">
          </div>
          <div v-if="prints.length > 1" class="arts">
            <p class="arts-title">
              {{ t('optcg.arts') }} ({{ prints.length }})
            </p>
            <div class="arts-row">
              <button
                v-for="p in prints"
                :key="p.id"
                type="button"
                class="art-thumb"
                :aria-pressed="p.id === shown"
                :aria-label="`${p.id} ${p.rarity ?? ''}`"
                @click="shown = p.id"
              >
                <img :src="p.image" alt="" loading="lazy">
              </button>
            </div>
          </div>
        </div>

        <div class="sheet-info">
          <header>
            <h2 class="sheet-name u-display">
              {{ card.name }}
            </h2>
            <p class="sheet-meta">
              <span class="colors">
                <span
                  v-for="c in card.colors"
                  :key="c"
                  class="color"
                  :style="{ background: OPTCG_COLOR_HEX[c] }"
                >{{ t(`optcg.color.${c}`) }}</span>
              </span>
              <span>{{ t(`optcg.category.${card.category}`) }}</span>
              <span v-if="current?.rarity ?? card.rarity">{{ current?.rarity ?? card.rarity }}</span>
              <span class="font-mono">{{ current?.set ?? card.set }}</span>
            </p>
            <p v-if="card.banned || rotated" class="warn">
              <UIcon name="i-lucide-octagon-alert" class="h-4 w-4" />
              {{ card.banned ? t('optcg.banned') : t('optcg.rotated') }}
            </p>
          </header>

          <dl v-if="facts.length" class="facts">
            <div v-for="f in facts" :key="f.label" class="fact">
              <dt>{{ f.label }}</dt>
              <dd>{{ f.value }}</dd>
            </div>
          </dl>

          <p v-if="card.attributes.length || card.types.length" class="traits">
            <span v-for="a in card.attributes" :key="a" class="attr">{{ a }}</span>
            <span v-for="ty in card.types" :key="ty" class="type">{{ ty }}</span>
          </p>

          <OptcgEffectText v-if="card.effect" :text="card.effect" />
          <div v-if="card.trigger" class="trigger">
            <OptcgEffectText :text="card.trigger" />
          </div>

          <p v-if="card.lang === 'en' && lang === 'fr'" class="note">
            {{ t('optcg.enOnly') }}
          </p>

          <footer v-if="!inDeck && card.category === 'Leader'" class="actions">
            <UButton color="primary" icon="i-lucide-anchor" @click="emit('start', shownCard ?? card)">
              {{ t('optcg.library.startWith') }}
            </UButton>
          </footer>
          <footer v-if="inDeck" class="actions">
            <UButton color="primary" icon="i-lucide-plus" @click="onAdd">
              {{ t('optcg.add.button') }}
              <span v-if="quantity" class="opacity-70">({{ quantity }})</span>
            </UButton>
            <UButton v-if="quantity" color="neutral" variant="subtle" icon="i-lucide-minus" @click="emit('remove', card)">
              {{ t('optcg.add.remove') }}
            </UButton>
            <UButton v-if="artChanged && shownCard" color="neutral" variant="outline" icon="i-lucide-image" @click="emit('setArt', shownCard)">
              {{ t('optcg.add.setArt') }}
            </UButton>
          </footer>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.sheet-grid {
  display: grid;
  gap: 20px;
  padding: 20px;
}
@media (min-width: 640px) {
  .sheet-grid {
    grid-template-columns: minmax(220px, 300px) 1fr;
  }
}
.frame {
  padding: 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  rotate: var(--u-tilt, 0deg);
  box-shadow: var(--shadow-elev-2);
}
.frame img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 2px;
}
.arts {
  margin-top: 12px;
}
.arts-title {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.arts-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.art-thumb {
  flex: 0 0 auto;
  width: 44px;
  border: 2px solid transparent;
  border-radius: 3px;
  opacity: 0.7;
  transition:
    opacity var(--dur-fast) ease,
    transform var(--dur-fast) var(--ease-spring);
}
.art-thumb:hover {
  opacity: 1;
  transform: translateY(-2px);
}
.art-thumb[aria-pressed='true'] {
  border-color: rgb(var(--accent-rgb));
  opacity: 1;
}
.art-thumb img {
  display: block;
  width: 100%;
  aspect-ratio: 600 / 838;
  object-fit: cover;
}
.sheet-info {
  display: grid;
  align-content: start;
  gap: 14px;
  min-width: 0;
}
.sheet-name {
  margin: 0;
  font-size: 26px;
  line-height: 1.05;
  color: var(--color-text-high);
}
.sheet-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  font-size: 12.5px;
  color: var(--color-text-muted);
}
.colors {
  display: inline-flex;
  gap: 4px;
}
.color {
  padding: 1px 7px;
  border-radius: 2px;
  color: #fff8ec;
  font-size: 11.5px;
  font-weight: 600;
}
.warn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  color: var(--accent-text);
  font-size: 13px;
  font-weight: 600;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
}
.fact {
  min-width: 78px;
  padding: 6px 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
}
.fact dt {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.fact dd {
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  line-height: 1.2;
  color: var(--color-text-high);
  font-variant-numeric: tabular-nums;
}
.traits {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}
.attr,
.type {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}
.attr {
  background: #231708;
  color: #fbf4e6;
}
.type {
  border: 1px solid var(--color-border-strong);
  color: var(--color-text-mid);
}
.trigger {
  padding: 10px 12px;
  border-left: 3px solid #d9a91c;
  background: color-mix(in srgb, #d9a91c 12%, transparent);
}
.note {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}
</style>
