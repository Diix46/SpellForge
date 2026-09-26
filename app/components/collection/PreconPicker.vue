<script setup lang="ts">
import type { ImportRow } from '#shared/collection-csv'
import type { PreconCard, PreconKind, PreconSummary } from '#shared/collection-decks'
import { computed, ref, watch } from 'vue'
import { PRECON_KINDS, preconImportRows } from '#shared/collection-decks'

// A Magic preconstructed deck to add whole: found by name, set or commander,
// narrowed by family, then its cards in the box's exact printings and
// foiling, in the chosen language, handed to the import preview.
const emit = defineEmits<{ rows: [rows: ImportRow[], name: string] }>()

const { t, locale } = useLocale()
const q = ref('')
const kind = ref<PreconKind | 'all'>('commander')
const list = ref<PreconSummary[]>([])
const loading = ref(false)
const picked = ref<PreconSummary | null>(null)
const cards = ref<PreconCard[]>([])
const lang = ref<'fr' | 'en'>(locale.value === 'fr' ? 'fr' : 'en')
const location = ref('')

async function search() {
  loading.value = true
  try {
    list.value = (await $fetch<{ precons: PreconSummary[] }>('/api/collection/precons', { query: { q: q.value, kind: kind.value === 'all' ? undefined : kind.value, lang: locale.value } })).precons
  }
  catch {
    list.value = []
  }
  finally {
    loading.value = false
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
watch([q, kind], () => {
  clearTimeout(timer)
  timer = setTimeout(() => void search(), 220)
}, { immediate: true })

async function pick(p: PreconSummary) {
  picked.value = p
  location.value = p.name
  cards.value = []
  try {
    cards.value = (await $fetch<{ cards: PreconCard[] }>(`/api/collection/precons/${encodeURIComponent(p.file)}`)).cards
  }
  catch {
    picked.value = null
  }
}

const commander = computed(() => picked.value?.commanderLocal ?? cards.value.filter(c => c.section === 'commander').map(c => c.name).join(' · '))
const foils = computed(() => cards.value.filter(c => c.foil).reduce((n, c) => n + c.count, 0))
const year = (d: string | null) => d?.slice(0, 4) ?? ''
/** MTGJSON's product types, in the site's language when known. */
function typeLabel(type: string): string {
  const key = `collection.precon.type.${type.replace(/\W+/g, '')}`
  const label = t(key)
  return label === key ? type : label
}

function preview() {
  if (!picked.value || !cards.value.length)
    return
  emit('rows', preconImportRows(cards.value, lang.value, location.value.trim() || null), picked.value.name)
}
</script>

<template>
  <div class="precons">
    <template v-if="!picked">
      <UInput v-model="q" icon="i-lucide-search" :placeholder="t('collection.precon.search')" size="lg" class="w-full" autofocus />
      <div class="chips" role="group">
        <button v-for="k in (['all', ...PRECON_KINDS] as const)" :key="k" type="button" :aria-pressed="kind === k" @click="kind = k">
          {{ t(`collection.precon.kind.${k}`) }}
        </button>
      </div>
      <div v-if="loading && !list.length" class="state" role="status">
        <UIcon name="i-lucide-loader-circle" class="h-6 w-6 animate-spin" />
      </div>
      <p v-else-if="!list.length" class="state">
        {{ t('collection.precon.none') }}
      </p>
      <ul v-else class="list">
        <li v-for="p in list" :key="p.file">
          <button type="button" class="precon" @click="pick(p)">
            <img v-if="p.thumb" :src="p.thumb" alt="" loading="lazy">
            <span v-else class="noimg"><UIcon name="i-lucide-box" class="h-5 w-5" /></span>
            <span class="body">
              <b>{{ p.name }}</b>
              <span class="meta">{{ p.setName ?? p.code.toUpperCase() }} · {{ year(p.released) }}</span>
              <span class="meta">{{ p.commanderLocal ?? typeLabel(p.type) }} · {{ p.cards }} {{ t('collection.cards') }}</span>
            </span>
          </button>
        </li>
      </ul>
    </template>

    <section v-else class="chosen">
      <button type="button" class="back" @click="picked = null">
        <UIcon name="i-lucide-arrow-left" class="h-4 w-4" /> {{ t('collection.precon.others') }}
      </button>
      <div class="head">
        <img v-if="picked.thumb" :src="picked.thumb" alt="">
        <div>
          <h3>{{ picked.name }}</h3>
          <p class="meta">
            {{ picked.setName ?? picked.code.toUpperCase() }} · {{ year(picked.released) }} · {{ typeLabel(picked.type) }}
          </p>
          <p v-if="commander" class="meta">
            <UIcon name="i-lucide-crown" class="h-3.5 w-3.5" /> {{ commander }}
          </p>
          <p class="meta">
            {{ picked.cards }} {{ t('collection.cards') }}<template v-if="foils">
              · {{ foils }} foil
            </template>
          </p>
        </div>
      </div>
      <div class="opts">
        <UFormField :label="t('collection.precon.lang')">
          <div class="seg" role="group">
            <button v-for="l in (['fr', 'en'] as const)" :key="l" type="button" :aria-pressed="lang === l" @click="lang = l">
              {{ l.toUpperCase() }}
            </button>
          </div>
        </UFormField>
        <UFormField :label="t('collection.location')" class="grow">
          <UInput v-model="location" icon="i-lucide-archive" class="w-full" />
        </UFormField>
      </div>
      <UButton size="lg" icon="i-lucide-scan-search" :loading="!cards.length" block @click="preview">
        {{ t('collection.precon.preview') }}
      </UButton>
    </section>
  </div>
</template>

<style scoped>
.precons {
  display: grid;
  gap: 12px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chips button {
  padding: 4px 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 999px;
  font-size: 12px;
  color: var(--color-text-mid);
}
.chips button[aria-pressed='true'] {
  border-color: var(--ui-primary);
  background: var(--accent-soft);
  color: var(--color-text-high);
}
.state {
  display: grid;
  place-items: center;
  padding: 28px 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
.list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
  overflow-y: auto;
  max-height: 46vh;
  margin: 0;
  padding: 0;
  list-style: none;
}
.precon {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  text-align: left;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.precon:hover {
  border-color: var(--ui-primary);
  background: var(--accent-soft);
}
.precon img,
.noimg {
  flex: 0 0 auto;
  width: 40px;
  height: 56px;
  border-radius: 4px;
  object-fit: cover;
}
.noimg {
  display: grid;
  place-items: center;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
}
.body {
  display: grid;
  gap: 1px;
  min-width: 0;
}
.body b {
  overflow: hidden;
  font-size: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-high);
}
.meta {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  margin: 0;
  font-size: 11.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-muted);
}
.chosen {
  display: grid;
  gap: 14px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  font-size: 13px;
  color: var(--color-text-muted);
}
.head {
  display: flex;
  gap: 16px;
}
.head img {
  width: 96px;
  border-radius: 6px;
  box-shadow: var(--shadow-elev-1);
}
.head h3 {
  margin: 0 0 4px;
  font-size: 18px;
  color: var(--color-text-high);
}
.head .meta {
  white-space: normal;
}
.opts {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 14px;
}
.grow {
  flex: 1 1 200px;
}
.seg {
  display: flex;
  gap: 2px;
  width: fit-content;
  padding: 2px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-sm);
}
.seg button {
  padding: 5px 12px;
  border-radius: calc(var(--radius-sm) - 2px);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
}
.seg button[aria-pressed='true'] {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}
</style>
