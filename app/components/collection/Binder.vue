<script setup lang="ts">
import type { ChecklistCard, CollectionCopy, Condition, Finish, SetProgress } from '#shared/collection'
import type { GameId } from '#shared/game'
import type { BinderEntry } from '~/utils/bookshelf/entry'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { CONDITIONS } from '#shared/collection'

// One set as a binder: pages of nine pockets in collector-number order, two
// facing pages on a wide screen. Owned cards sit in their pockets, missing
// ones leave their ghost; a tap puts a copy in with the binder's settings
// (language, finish, condition), a long press opens the details. Filters,
// search and the shopping list of what is missing stay at hand.
const props = defineProps<{ game: GameId, code: string }>()

const { t, locale, rarityLabel } = useLocale()
const toast = useToast()
const collection = useCollection(props.game)
const wishlist = useWishlist(props.game)
const { openAdd } = useCollectionAdd()
const lang = computed(() => (locale.value === 'fr' ? 'fr' : 'en'))

// Opened from the library: its data is already here, and where the 3D binder
// stood, to grow out of it.
const entry = useState<BinderEntry | null>('binder-entry', () => null)
const arrival = entry.value?.code === props.code ? entry.value : null
entry.value = null

const { data, status, error, refresh } = useFetch<{ set: SetProgress, cards: ChecklistCard[] }>(() => `/api/collection/sets/${encodeURIComponent(props.code)}`, {
  query: { game: props.game, lang },
  server: false,
  default: () => (arrival?.data ? structuredClone(toRaw(arrival.data)) : undefined) as { set: SetProgress, cards: ChecklistCard[] },
  // Deep: a tap counts the copy in its pocket at once, before the server says so.
  deep: true,
})
// The server's counts once a burst of taps settles.
let timer: ReturnType<typeof setTimeout> | undefined
watch(collection.copies, () => {
  clearTimeout(timer)
  timer = setTimeout(() => void refresh(), 1500)
})
onMounted(() => void wishlist.load())

// ---- The binder's settings: what a tap puts in (kept in this browser) ----
// One set of settings per game: the language held differs between them.
const PREFS_KEY = `prism_binder_prefs_${props.game}`
const prefs = reactive({ lang: lang.value as 'fr' | 'en', finish: 'nonfoil' as Finish, condition: 'NM' as Condition })
onMounted(() => {
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'))
  }
  catch {}
})
watch(prefs, (p) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  }
  catch {}
})
const conditionItems = computed(() => CONDITIONS.map(c => ({ label: `${c} · ${t(`collection.condition.${c}`)}`, value: c })))

// ---- Filters ----
type Show = 'all' | 'owned' | 'missing'
const show = ref<Show>('all')
const q = ref('')
const rarity = ref('all')
const cards = computed(() => data.value?.cards ?? [])
const set = computed(() => data.value?.set ?? null)
const nameOf = (c: ChecklistCard) => c.printedName ?? c.name
const ownedCount = computed(() => cards.value.filter(c => c.owned > 0).length)
const counts = computed<Record<Show, number>>(() => ({ all: cards.value.length, owned: ownedCount.value, missing: cards.value.length - ownedCount.value }))
const rarities = computed(() => [...new Set(cards.value.map(c => c.rarity).filter(r => r != null))])
const rarityItems = computed(() => [{ label: t('collection.allRarities'), value: 'all' }, ...rarities.value.map(r => ({ label: rarityLabel(r), value: r }))])
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

// ---- Pages ----
const PER_PAGE = 9
const wide = ref(false)
let mq: MediaQueryList | null = null
const onMq = () => (wide.value = !!mq?.matches)
onMounted(() => {
  mq = matchMedia('(min-width: 1100px)')
  onMq()
  mq.addEventListener('change', onMq)
})
onBeforeUnmount(() => mq?.removeEventListener('change', onMq))
const perView = computed(() => (wide.value ? 2 : 1))
const pages = computed(() => {
  const out: ChecklistCard[][] = []
  for (let i = 0; i < shown.value.length; i += PER_PAGE)
    out.push(shown.value.slice(i, i + PER_PAGE))
  return out.length ? out : [[]]
})
const spread = ref(0)
const spreads = computed(() => Math.ceil(pages.value.length / perView.value))
watch([shown, perView], () => (spread.value = Math.min(spread.value, spreads.value - 1)))
watch([show, q, rarity], () => (spread.value = 0))
const visible = computed(() => pages.value.slice(spread.value * perView.value, spread.value * perView.value + perView.value))
const direction = ref<'next' | 'prev'>('next')
function turn(step: number) {
  const next = Math.min(spreads.value - 1, Math.max(0, spread.value + step))
  if (next === spread.value)
    return
  direction.value = step > 0 ? 'next' : 'prev'
  spread.value = next
}
const firstPage = computed(() => spread.value * perView.value + 1)
const lastPage = computed(() => Math.min(pages.value.length, firstPage.value + perView.value - 1))

function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.closest('input, textarea, select, [role="dialog"]'))
    return
  if (e.key === 'ArrowRight')
    turn(1)
  else if (e.key === 'ArrowLeft')
    turn(-1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
// A swipe turns the page on a phone.
let swipeX: number | null = null
const onTouchStart = (e: TouchEvent) => (swipeX = e.touches[0]?.clientX ?? null)
function onTouchEnd(e: TouchEvent) {
  const x = e.changedTouches[0]?.clientX
  if (swipeX != null && x != null && Math.abs(x - swipeX) > 60)
    turn(x < swipeX ? 1 : -1)
  swipeX = null
}

// ---- Pockets ----
/** The printing a tap puts in, in the binder's language when there is one. */
function printingFor(c: ChecklistCard): { id: string, lang?: 'fr' | 'en' } | null {
  const id = prefs.lang === 'fr' ? c.printings.fr ?? c.printings.en : c.printings.en ?? c.printings.fr
  if (!id)
    return null
  // Magic: a French copy of a printing Scryfall only has in English.
  return { id, lang: props.game === 'mtg' ? prefs.lang : undefined }
}

async function add(c: ChecklistCard) {
  const p = printingFor(c)
  if (!p)
    return
  const finish = c.finishes.includes(prefs.finish) ? prefs.finish : c.finishes[0] ?? 'nonfoil'
  c.owned++
  const copy = await collection.add({ printingId: p.id, finish, condition: prefs.condition, quantity: 1, lang: p.lang })
  if (!copy) {
    c.owned--
    return
  }
  // One toast for the last card filed, not a pile of them.
  toast.remove('binder-add')
  toast.add({
    id: 'binder-add',
    title: `${nameOf(c)} · ${t('collection.binder.added')}`,
    description: finish !== prefs.finish ? t('collection.binder.finishFallback').replace('{finish}', t(`collection.finish.${finish}`)) : undefined,
    color: 'success',
    icon: 'i-lucide-check',
    duration: 2500,
    actions: [{ label: t('collection.binder.undo'), color: 'neutral', variant: 'outline', onClick: () => void takeOne(c, copy) }],
  })
}

/** The copy lines of this card in this set (any language or finish). */
function linesOf(c: ChecklistCard): CollectionCopy[] {
  return collection.copies.value
    // One Piece numbers are unique; Magic's within their set.
    .filter(x => x.card && x.card.number === c.number && (props.game === 'optcg' || x.card.set === props.code))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** One copy out: from the line just added to, else the last touched. */
async function takeOne(c: ChecklistCard, from?: CollectionCopy) {
  const line = (from && collection.copies.value.find(x => x.id === from.id)) ?? linesOf(c)[0]
  if (!line)
    return
  c.owned = Math.max(0, c.owned - 1)
  await collection.update(line.id, { quantity: line.quantity - 1 })
}

function details(c: ChecklistCard) {
  const p = printingFor(c)
  openAdd({ query: props.game === 'mtg' ? c.name : c.number, printing: p?.id ?? c.printingId })
}

// ---- Arriving from the library: the binder grows out of the 3D one ----
const still = ref(arrival?.still && arrival.stage ? { src: arrival.still, ...arrival.stage } : null)
const binderEl = ref<HTMLElement | null>(null)
onMounted(async () => {
  if (!arrival?.rect || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    still.value = null
    return
  }
  await nextTick()
  const el = binderEl.value?.querySelector<HTMLElement>('.spread')
  if (!el) {
    still.value = null
    return
  }
  const to = el.getBoundingClientRect()
  const from = arrival.rect
  el.style.transformOrigin = 'top left'
  el.style.transform = `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.width}, ${from.h / to.height})`
  el.getBoundingClientRect()
  requestAnimationFrame(() => {
    el.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)'
    el.style.transform = ''
    setTimeout(() => {
      el.style.transition = ''
      el.style.transformOrigin = ''
    }, 650)
  })
  setTimeout(() => (still.value = null), 700)
})
// Back to the library: it shows this binder.
const back = useState<string | null>('binder-return', () => null)

// ---- Header ----
const nf = computed(() => new Intl.NumberFormat(locale.value === 'fr' ? 'fr-FR' : 'en-US'))
const pct = computed(() => (cards.value.length ? Math.floor((ownedCount.value / cards.value.length) * 100) : 0))
const done = computed(() => cards.value.length > 0 && ownedCount.value >= cards.value.length)
const date = computed(() => (set.value?.releasedAt ? new Date(set.value.releasedAt).toLocaleDateString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'long' }) : null))

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
  <div class="binder-view">
    <NuxtLink :to="collectionPath(game)" class="back" @click="back = code">
      <UIcon name="i-lucide-arrow-left" class="h-4 w-4" />
      {{ t('collection.tabBinder') }}
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
          <CollectionSetSymbol v-if="set.icon" :icon="set.icon" :rarity="done ? 'rare' : null" :size="34" />
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
            </template>
          </p>
          <CollectionProgress :owned="ownedCount" :total="cards.length" size="lg" />
        </div>
        <p class="count">
          <b>{{ nf.format(ownedCount) }}</b><span>/ {{ nf.format(cards.length) }}</span><em>{{ pct }}%</em>
        </p>
      </section>

      <!-- What a tap puts in the binder. -->
      <section class="prefs" :aria-label="t('collection.binder.settings')">
        <span class="prefs-title"><UIcon name="i-lucide-hand" class="h-4 w-4" /> {{ t('collection.binder.tapHint') }}</span>
        <div class="seg" role="group" :aria-label="t('collection.copyLang')">
          <button v-for="l in (['fr', 'en'] as const)" :key="l" type="button" :aria-pressed="prefs.lang === l" @click="prefs.lang = l">
            {{ l.toUpperCase() }}
          </button>
        </div>
        <div v-if="game === 'mtg'" class="seg" role="group" :aria-label="t('collection.finish')">
          <button v-for="f in (['nonfoil', 'foil'] as const)" :key="f" type="button" :aria-pressed="prefs.finish === f" :class="{ shiny: f === 'foil' }" @click="prefs.finish = f">
            {{ t(`collection.finish.${f}`) }}
          </button>
        </div>
        <USelect v-model="prefs.condition" :items="conditionItems" size="sm" class="w-40" :aria-label="t('collection.condition')" />
      </section>

      <div class="toolbar">
        <div class="seg" role="group">
          <button v-for="s in (['all', 'owned', 'missing'] as const)" :key="s" type="button" :aria-pressed="show === s" @click="show = s">
            {{ t(`collection.show.${s}`) }} <span>{{ nf.format(counts[s]) }}</span>
          </button>
        </div>
        <UInput v-model="q" icon="i-lucide-search" :placeholder="t('collection.checklistSearch')" class="grow sm:grow-0 sm:w-52" />
        <USelect v-if="rarities.length > 1" v-model="rarity" :items="rarityItems" class="w-40" />
        <UButton v-if="counts.missing" class="ml-auto" color="neutral" variant="ghost" icon="i-lucide-clipboard-list" @click="copyMissing">
          {{ t('collection.copyMissing') }}
        </UButton>
      </div>

      <p v-if="!shown.length" class="state">
        {{ show === 'missing' && !counts.missing ? t('collection.nothingMissing') : t('collection.noMatch') }}
      </p>
      <template v-else>
        <div ref="binderEl" class="binder" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
          <button type="button" class="turn turn--prev" :disabled="spread === 0" :aria-label="t('collection.binder.prev')" @click="turn(-1)">
            <UIcon name="i-lucide-chevron-left" class="h-6 w-6" />
          </button>
          <Transition :name="`turn-${direction}`" mode="out-in">
            <div :key="spread" class="spread" :class="{ single: visible.length === 1 }">
              <div v-for="(page, i) in visible" :key="i" class="page" :class="i === 0 && visible.length === 2 ? 'page--left' : 'page--right'">
                <span class="rings" aria-hidden="true"><i /><i /><i /></span>
                <div class="pockets">
                  <CollectionBinderPocket
                    v-for="c in page"
                    :key="c.key"
                    :card="c"
                    :name="nameOf(c)"
                    :wished="wishlist.wished.value.has(c.printingId)"
                    @add="add(c)"
                    @remove="takeOne(c)"
                    @details="details(c)"
                    @wish="wishlist.add(c.printingId)"
                  />
                  <span v-for="n in PER_PAGE - page.length" :key="`empty-${n}`" class="blank" aria-hidden="true" />
                </div>
                <span class="folio">{{ firstPage + i }}</span>
              </div>
            </div>
          </Transition>
          <button type="button" class="turn turn--next" :disabled="spread >= spreads - 1" :aria-label="t('collection.binder.next')" @click="turn(1)">
            <UIcon name="i-lucide-chevron-right" class="h-6 w-6" />
          </button>
        </div>
        <div class="pager">
          <span>{{ t('collection.binder.pages').replace('{from}', String(firstPage)).replace('{to}', String(lastPage)).replace('{n}', String(pages.length)) }}</span>
          <input v-if="spreads > 1" type="range" min="0" :max="spreads - 1" :value="spread" :aria-label="t('collection.binder.jump')" @input="spread = Number(($event.target as HTMLInputElement).value)">
        </div>
      </template>
    </template>
    <!-- The library's last image, fading while the binder takes its place. -->
    <Teleport to="body">
      <img v-if="still" :src="still.src" alt="" class="arrival" :style="{ left: `${still.x}px`, top: `${still.y}px`, width: `${still.w}px`, height: `${still.h}px` }">
    </Teleport>
  </div>
</template>

<style scoped>
.binder-view {
  display: grid;
  gap: 16px;
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
  gap: 18px;
  padding: 16px 20px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: radial-gradient(420px 160px at 100% 0%, var(--accent-soft), transparent 70%), var(--color-surface-1);
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
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-surface-2);
}
.emblem b {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-mid);
}
.hero-body {
  display: grid;
  flex: 1;
  gap: 6px;
  min-width: 0;
}
.name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
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
  font-size: 11px;
  font-weight: 700;
  color: #2b1d02;
}
.meta {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}
.count {
  display: grid;
  justify-items: end;
  margin: 0;
  font-family: var(--font-mono);
  line-height: 1.1;
}
.count b {
  font-size: 24px;
  color: var(--color-text-high);
}
.count span {
  font-size: 12px;
  color: var(--color-text-muted);
}
.count em {
  font-size: 13px;
  font-style: normal;
  font-weight: 600;
  color: var(--color-text-mid);
}
.prefs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
}
.prefs-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  font-size: 13px;
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
  padding: 4px 11px;
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
.seg button.shiny[aria-pressed='true'] {
  background: linear-gradient(110deg, #ffd6e8, #d6f0ff 50%, #fff3c4);
  color: #1b1f22;
}
/* The binder: facing pages on a leather-dark cover. */
.binder {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  /* A binder the size of a real one: the whole spread fits the screen. */
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
}
.spread {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1;
  min-width: 0;
  padding: 14px;
  border-radius: 14px;
  background: linear-gradient(135deg, #2c2a33, #1d1c22);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  perspective: 1600px;
}
.spread.single {
  grid-template-columns: 1fr;
}
.page {
  position: relative;
  padding: 18px 18px 26px 30px;
  background: var(--color-surface-1);
  box-shadow: inset 0 0 0 1px var(--color-border-subtle);
}
.page--left {
  padding: 18px 30px 26px 18px;
  border-radius: 8px 2px 2px 8px;
  box-shadow:
    inset -14px 0 18px -14px rgba(0, 0, 0, 0.35),
    inset 0 0 0 1px var(--color-border-subtle);
}
.page--right {
  border-radius: 2px 8px 8px 2px;
  box-shadow:
    inset 14px 0 18px -14px rgba(0, 0, 0, 0.3),
    inset 0 0 0 1px var(--color-border-subtle);
}
.single .page--right {
  border-radius: 8px;
}
.rings {
  position: absolute;
  top: 10%;
  bottom: 10%;
  left: 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}
.page--left .rings {
  right: 8px;
  left: auto;
}
.rings i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #d9d9de, #7c7c86 60%, #3d3d44);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
.pockets {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.blank {
  aspect-ratio: 63 / 88;
  border-radius: 5% / 3.6%;
  background: repeating-linear-gradient(135deg, transparent 0 8px, var(--color-surface-2) 8px 9px);
  opacity: 0.5;
}
.folio {
  position: absolute;
  right: 18px;
  bottom: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}
.page--left .folio {
  right: auto;
  left: 18px;
}
.turn {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 40px;
  height: 64px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface-1);
  color: var(--color-text-mid);
  transition:
    background 0.15s,
    color 0.15s;
}
.turn:hover:not(:disabled) {
  background: var(--color-surface-2);
  color: var(--color-text-high);
}
.turn:disabled {
  opacity: 0.35;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}
.pager input {
  width: min(360px, 50%);
  accent-color: var(--ui-primary);
}
/* Turning a page: the spread swings out, the next swings in. */
.turn-next-enter-active,
.turn-next-leave-active,
.turn-prev-enter-active,
.turn-prev-leave-active {
  transition:
    transform 0.22s ease,
    opacity 0.22s ease;
}
.turn-next-leave-to,
.turn-prev-enter-from {
  opacity: 0;
  transform: translateX(-24px) rotateY(8deg);
}
.turn-next-enter-from,
.turn-prev-leave-to {
  opacity: 0;
  transform: translateX(24px) rotateY(-8deg);
}
@media (max-width: 640px) {
  .binder-view {
    gap: 12px;
  }
  .prefs {
    gap: 6px;
    padding: 8px;
  }
  .prefs-title {
    display: none;
  }
  .toolbar {
    gap: 6px;
  }
  .toolbar .seg {
    order: 2;
  }
  .toolbar > :not(.seg):not(:first-child) {
    display: none;
  }
}
@media (max-width: 640px) {
  .hero {
    gap: 12px;
    padding: 12px 14px;
  }
  .emblem {
    width: 40px;
    height: 40px;
  }
  .turn {
    display: none;
  }
  .spread {
    padding: 8px;
  }
  .page,
  .page--left {
    padding: 12px 10px 22px 22px;
  }
  .pockets {
    gap: 6px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .turn-next-enter-active,
  .turn-next-leave-active,
  .turn-prev-enter-active,
  .turn-prev-leave-active {
    transition: none;
  }
}
.arrival {
  position: fixed;
  z-index: 60;
  border-radius: var(--radius-xl);
  pointer-events: none;
  animation: arrival-fade 0.7s ease forwards;
}
@keyframes arrival-fade {
  0%,
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
</style>
