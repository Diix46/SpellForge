<script setup lang="ts">
import type { ChecklistCard, SetProgress } from '#shared/collection'
import type { GameId } from '#shared/game'
import { computed, ref, watch } from 'vue'

// One set's checklist: its cards in order, owned ones in colour with how many,
// missing ones faded, a click away from the add dialog. Magic's missing cards
// copy out as a list to buy.
const props = defineProps<{ game: GameId, code: string }>()

const { t, locale, rarityLabel } = useLocale()
const toast = useToast()
const collection = useCollection(props.game)
const { openAdd } = useCollectionAdd()
const lang = computed(() => (locale.value === 'fr' ? 'fr' : 'en'))

const { data, status, error, refresh } = useFetch<{ set: SetProgress, cards: ChecklistCard[] }>(() => `/api/collection/sets/${encodeURIComponent(props.code)}`, {
  query: { game: props.game, lang },
  server: false,
})
let timer: ReturnType<typeof setTimeout> | undefined
watch(collection.copies, () => {
  clearTimeout(timer)
  timer = setTimeout(() => void refresh(), 400)
})

type Show = 'all' | 'owned' | 'missing'
const show = ref<Show>('all')
const q = ref('')
const rarity = ref('all')

const cards = computed(() => data.value?.cards ?? [])
const set = computed(() => data.value?.set ?? null)
const ownedCount = computed(() => cards.value.filter(c => c.owned > 0).length)
const counts = computed<Record<Show, number>>(() => ({ all: cards.value.length, owned: ownedCount.value, missing: cards.value.length - ownedCount.value }))
const rarities = computed(() => [...new Set(cards.value.map(c => c.rarity).filter(r => r != null))])
const rarityItems = computed(() => [{ label: t('collection.allRarities'), value: 'all' }, ...rarities.value.map(r => ({ label: rarityLabel(r), value: r }))])

const nameOf = (c: ChecklistCard) => c.printedName ?? c.name
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return cards.value.filter((c) => {
    if (show.value === 'owned' && !c.owned)
      return false
    if (show.value === 'missing' && c.owned)
      return false
    if (rarity.value !== 'all' && c.rarity !== rarity.value)
      return false
    return !needle || nameOf(c).toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle) || c.number.toLowerCase().includes(needle)
  })
})

const nf = computed(() => new Intl.NumberFormat(locale.value === 'fr' ? 'fr-FR' : 'en-US'))
const pct = computed(() => (set.value?.total ? Math.floor((ownedCount.value / set.value.total) * 100) : 0))
const done = computed(() => !!set.value && cards.value.length > 0 && ownedCount.value >= cards.value.length)
const date = computed(() => (set.value?.releasedAt ? new Date(set.value.releasedAt).toLocaleDateString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'long' }) : null))

function add(c: ChecklistCard) {
  // Magic finds a card by its English name, One Piece by its number.
  openAdd({ query: props.game === 'mtg' ? c.name : c.number, printing: c.printingId })
}

/** The missing cards, one per line, the way deck sites and shops read them. */
async function copyMissing() {
  const lines = cards.value.filter(c => !c.owned).map(c => (props.game === 'mtg' ? `1 ${c.name} (${props.code.toUpperCase()}) ${c.number}` : `1x ${c.number}`))
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    toast.add({ title: t('collection.missingCopied').replace('{n}', String(lines.length)), color: 'success', icon: 'i-lucide-clipboard-check' })
  }
  catch {
    toast.add({ title: t('collection.copyFailed'), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <div class="checklist">
    <NuxtLink :to="collectionPath(game, '/sets')" class="back">
      <UIcon name="i-lucide-arrow-left" class="h-4 w-4" />
      {{ t('collection.tabSets') }}
    </NuxtLink>

    <div v-if="status === 'pending' && !data" class="state" role="status">
      <UIcon name="i-lucide-loader-circle" class="h-7 w-7 animate-spin" />
    </div>
    <div v-else-if="error || !set" class="state">
      <p>{{ error?.statusCode === 404 ? t('collection.unknownSet') : t('collection.error') }}</p>
      <UButton v-if="error?.statusCode !== 404" color="neutral" variant="subtle" icon="i-lucide-refresh-cw" @click="refresh()">
        {{ t('collection.retry') }}
      </UButton>
    </div>

    <template v-else>
      <section class="hero" :class="{ 'is-done': done }">
        <span class="emblem">
          <CollectionSetSymbol v-if="set.icon" :icon="set.icon" :rarity="done ? 'rare' : null" :size="40" />
          <b v-else>{{ set.code }}</b>
        </span>
        <div class="hero-body">
          <h2 class="name">
            {{ set.name }}
            <span v-if="done" class="badge"><UIcon name="i-lucide-trophy" class="h-3.5 w-3.5" /> {{ t('collection.complete') }}</span>
          </h2>
          <p class="meta">
            {{ set.code.toUpperCase() }}<template v-if="date">
              · {{ date }}
            </template> · {{ nf.format(set.total) }} {{ t('collection.cards') }}
          </p>
          <CollectionProgress :owned="ownedCount" :total="cards.length" size="lg" />
          <p class="count">
            <span><b>{{ nf.format(ownedCount) }}</b> / {{ nf.format(cards.length) }}</span>
            <span class="pct">{{ pct }}%</span>
          </p>
        </div>
      </section>

      <div class="toolbar">
        <div class="seg" role="group">
          <button v-for="s in (['all', 'owned', 'missing'] as const)" :key="s" type="button" :aria-pressed="show === s" @click="show = s">
            {{ t(`collection.show.${s}`) }} <span>{{ nf.format(counts[s]) }}</span>
          </button>
        </div>
        <UInput v-model="q" icon="i-lucide-search" :placeholder="t('collection.checklistSearch')" class="grow sm:grow-0 sm:w-56" />
        <USelect v-if="rarities.length > 1" v-model="rarity" :items="rarityItems" class="w-40" />
        <UButton v-if="counts.missing" class="ml-auto" color="neutral" variant="subtle" icon="i-lucide-clipboard-list" @click="copyMissing">
          {{ t('collection.copyMissing') }}
        </UButton>
      </div>

      <p v-if="!shown.length" class="state">
        {{ show === 'missing' && !counts.missing ? t('collection.nothingMissing') : t('collection.noMatch') }}
      </p>
      <ul v-else class="grid">
        <li v-for="c in shown" :key="c.key">
          <button type="button" class="card" :class="{ 'is-owned': c.owned > 0 }" :aria-label="`${nameOf(c)} #${c.number}, ${c.owned ? `×${c.owned}` : t('collection.missing')}`" @click="add(c)">
            <span class="art">
              <img :src="c.thumb" :alt="nameOf(c)" loading="lazy" decoding="async">
              <span v-if="c.owned" class="qty">×{{ c.owned }}</span>
              <span class="plus" aria-hidden="true"><UIcon name="i-lucide-plus" class="h-5 w-5" /></span>
            </span>
            <span class="caption">
              <span class="num">{{ c.number }}</span>
              <span class="cname">{{ nameOf(c) }}</span>
            </span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.checklist {
  display: grid;
  gap: 18px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  font-size: 13px;
  color: var(--color-text-muted);
}
.back:hover {
  color: var(--color-text-high);
}
.state {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 44px 0;
  text-align: center;
  color: var(--color-text-muted);
}
.hero {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px 22px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: radial-gradient(420px 160px at 100% 0%, var(--accent-soft), transparent 70%), var(--color-surface-1);
  box-shadow: var(--shadow-elev-1);
}
.hero.is-done {
  border-color: rgba(199, 154, 46, 0.6);
  background:
    radial-gradient(420px 160px at 100% 0%, rgba(240, 210, 122, 0.22), transparent 70%), var(--color-surface-1);
}
.emblem {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: var(--color-surface-2);
}
.emblem b {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-text-mid);
}
.hero-body {
  display: grid;
  flex: 1;
  gap: 8px;
  min-width: 0;
}
.name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text-high);
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, #a8801f, #f0d27a 50%, #c79a2e);
  font-family: var(--font-sans, inherit);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #2b1d02;
}
.meta {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}
.count {
  display: flex;
  justify-content: space-between;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-text-muted);
}
.count b {
  color: var(--color-text-high);
}
.pct {
  font-weight: 600;
  color: var(--color-text-mid);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-sm);
}
.seg button {
  padding: 5px 12px;
  border-radius: calc(var(--radius-sm) - 2px);
  font-size: 13px;
  color: var(--color-text-muted);
}
.seg button span {
  margin-left: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.8;
}
.seg button[aria-pressed='true'] {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 16px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.card {
  display: grid;
  gap: 6px;
  width: 100%;
  text-align: left;
}
.art {
  position: relative;
  display: block;
  overflow: hidden;
  aspect-ratio: 488 / 680;
  border-radius: 5% / 3.6%;
  background: var(--color-surface-2);
}
.art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(1);
  opacity: 0.4;
  transition:
    filter 0.25s,
    opacity 0.25s,
    transform 0.25s var(--ease-out, ease-out);
}
.is-owned .art img {
  filter: none;
  opacity: 1;
}
.card:hover .art img,
.card:focus-visible .art img {
  opacity: 1;
  transform: scale(1.03);
}
.card:not(.is-owned):hover .art img {
  filter: grayscale(0.35);
}
.qty {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(10, 10, 14, 0.78);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: #fff;
}
.plus {
  position: absolute;
  inset: auto 6px 6px auto;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--ui-primary);
  color: #fff;
  opacity: 0;
  transform: scale(0.7);
  transition:
    opacity 0.18s,
    transform 0.18s var(--ease-out, ease-out);
}
.card:hover .plus,
.card:focus-visible .plus {
  opacity: 1;
  transform: none;
}
.caption {
  display: flex;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
}
.num {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}
.cname {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-mid);
}
.is-owned .cname {
  color: var(--color-text-high);
}
@media (max-width: 640px) {
  .hero {
    align-items: flex-start;
  }
  .emblem {
    width: 48px;
    height: 48px;
  }
}
</style>
