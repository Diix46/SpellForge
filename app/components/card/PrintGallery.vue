<script setup lang="ts">
import type { ArtStyle } from '#shared/mtg/prints'
import type { PrintOption } from '~/composables/usePrintings'
import { computed, ref, watch } from 'vue'
import { ART_STYLES } from '#shared/mtg/prints'
import { useLocale } from '~/composables/useLocale'

// Every printing of a card in a grid, for cards with too many to scroll through
// a strip (a basic land has over a thousand). Search by set or artist, filter
// by language, scan quality, promo and style, sort by date or price; dated
// sorts get a heading per set. Hover and click work as in the strip.

const props = defineProps<{
  prints: PrintOption[]
  isPinned: (p: PrintOption) => boolean
  isAutoShown: (p: PrintOption) => boolean
}>()

const emit = defineEmits<{
  pick: [print: PrintOption]
  preview: [print: PrintOption | null]
}>()

const { t, locale } = useLocale()

const query = ref('')
// The deck's own language first; English (or everything) is one click away.
const lang = ref<'all' | 'fr' | 'en'>(props.prints.some(p => p.lang === locale.value) ? locale.value : 'all')
const hdOnly = ref(false)
const noPromo = ref(false)
const style = ref<ArtStyle | 'all'>('all')
const sort = ref<'new' | 'old' | 'price'>('new')
// Rendered in pages: a basic land has over a thousand printings.
const PAGE = 120
const limit = ref(PAGE)
watch([query, lang, hdOnly, noPromo, style, sort], () => {
  limit.value = PAGE
})

const langs = computed(() => [...new Set(props.prints.map(p => p.lang))])
const styles = computed(() => (Object.keys(ART_STYLES) as ArtStyle[]).filter(s => props.prints.some(p => p.styles.includes(s))))

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const shown = computed(() => {
  const q = fold(query.value.trim())
  const list = props.prints.filter(p =>
    (lang.value === 'all' || p.lang === lang.value)
    && (!hdOnly.value || p.highres)
    && (!noPromo.value || !p.promo)
    && (style.value === 'all' || p.styles.includes(style.value))
    && (!q || fold(`${p.setName} ${p.set} ${p.artist ?? ''}`).includes(q)))
  const date = (p: PrintOption) => p.releasedAt ?? ''
  const price = (p: PrintOption) => (p.priceEur ? Number(p.priceEur) : Infinity)
  // Sets released the same day stay together (one heading each), numbers in order.
  const within = (a: PrintOption, b: PrintOption) => a.set.localeCompare(b.set) || a.lang.localeCompare(b.lang)
    || a.collectorNumber.localeCompare(b.collectorNumber, undefined, { numeric: true })
  return [...list].sort((a, b) =>
    sort.value === 'price'
      ? price(a) - price(b) || within(a, b)
      : (sort.value === 'old' ? date(a).localeCompare(date(b)) : date(b).localeCompare(date(a))) || within(a, b))
})

// Dated sorts read as a timeline: a heading when the set changes.
const rows = computed(() => {
  const out: ({ kind: 'set', key: string, label: string } | { kind: 'print', key: string, print: PrintOption })[] = []
  let last = ''
  for (const p of shown.value.slice(0, limit.value)) {
    const set = `${p.set}|${p.lang}`
    if (sort.value !== 'price' && set !== last) {
      out.push({ kind: 'set', key: `h-${out.length}-${set}`, label: `${p.setName} · ${(p.releasedAt ?? '').slice(0, 4)}${p.lang === 'en' && langs.value.length > 1 ? ' · EN' : ''}` })
      last = set
    }
    out.push({ kind: 'print', key: p.id, print: p })
  }
  return out
})

const sortItems = computed(() => [
  { label: t('print.gallery.sortNew'), value: 'new' },
  { label: t('print.gallery.sortOld'), value: 'old' },
  { label: t('print.gallery.sortPrice'), value: 'price' },
])
</script>

<template>
  <div>
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <UInput
        v-model="query"
        size="xs"
        icon="i-lucide-search"
        :placeholder="t('print.gallery.search')"
        class="min-w-44 flex-1"
      />
      <div v-if="langs.length > 1" class="flex overflow-hidden rounded-[var(--radius-md)] ring-1 ring-(--color-border-strong)">
        <button
          v-for="l in (['all', ...langs] as const)"
          :key="l"
          type="button"
          class="px-2 py-1 font-mono text-[10px] uppercase transition-colors"
          :class="lang === l ? 'bg-(--accent-soft) text-(--accent-text)' : 'text-(--color-text-muted) hover:text-(--color-text-high)'"
          :aria-pressed="lang === l"
          @click="lang = l as typeof lang"
        >
          {{ l === 'all' ? t('print.gallery.allLangs') : l }}
        </button>
      </div>
      <USelect v-model="sort" :items="sortItems" size="xs" class="w-32" />
    </div>

    <div class="mb-2 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        class="rounded-full px-2 py-0.5 text-[11px] ring-1 transition-colors"
        :class="hdOnly ? 'bg-(--accent-soft) text-(--accent-text) ring-(--accent-border)' : 'text-(--color-text-muted) ring-(--color-border-strong) hover:text-(--color-text-high)'"
        :aria-pressed="hdOnly"
        @click="hdOnly = !hdOnly"
      >
        {{ t('print.gallery.hdOnly') }}
      </button>
      <button
        type="button"
        class="rounded-full px-2 py-0.5 text-[11px] ring-1 transition-colors"
        :class="noPromo ? 'bg-(--accent-soft) text-(--accent-text) ring-(--accent-border)' : 'text-(--color-text-muted) ring-(--color-border-strong) hover:text-(--color-text-high)'"
        :aria-pressed="noPromo"
        @click="noPromo = !noPromo"
      >
        {{ t('print.gallery.noPromo') }}
      </button>
      <button
        v-for="s in styles"
        :key="s"
        type="button"
        class="rounded-full px-2 py-0.5 text-[11px] ring-1 transition-colors"
        :class="style === s ? 'bg-(--accent-soft) text-(--accent-text) ring-(--accent-border)' : 'text-(--color-text-muted) ring-(--color-border-strong) hover:text-(--color-text-high)'"
        :aria-pressed="style === s"
        @click="style = style === s ? 'all' : s"
      >
        {{ t(`print.style.${s}`) }}
      </button>
      <span class="ml-auto font-mono text-[10px] text-(--color-text-muted)">{{ shown.length }} / {{ prints.length }}</span>
    </div>

    <p v-if="!shown.length" class="py-6 text-center text-xs text-(--color-text-muted)">
      {{ t('print.gallery.empty') }}
    </p>
    <div
      v-else
      class="print-grid grid max-h-[46vh] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6 md:grid-cols-7"
      @mouseleave="emit('preview', null)"
    >
      <template v-for="r in rows" :key="r.key">
        <h4
          v-if="r.kind === 'set'"
          class="col-span-full mt-1 truncate border-b border-(--color-border-subtle) pb-0.5 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted) first:mt-0"
        >
          {{ r.label }}
        </h4>
        <CardPrintTile
          v-else
          :print="r.print"
          :pinned="isPinned(r.print)"
          :auto-shown="isAutoShown(r.print)"
          @pick="emit('pick', $event)"
          @preview="emit('preview', $event)"
        />
      </template>
      <button
        v-if="shown.length > limit"
        type="button"
        class="col-span-full mt-1 rounded-[var(--radius-md)] py-2 text-xs text-(--color-text-mid) ring-1 ring-(--color-border-strong) transition-colors hover:text-(--accent-text) hover:ring-(--accent-border)"
        @click="limit += PAGE"
      >
        {{ t('print.gallery.more') }} ({{ shown.length - limit }})
      </button>
    </div>
  </div>
</template>

<style scoped>
.print-grid {
  scrollbar-width: thin;
}
</style>
