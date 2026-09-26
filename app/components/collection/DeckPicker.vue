<script setup lang="ts">
import type { ImportRow } from '#shared/collection-csv'
import type { GameId } from '#shared/game'
import { computed, ref } from 'vue'
import { ownershipKey } from '#shared/collection'
import { deckImportRows } from '#shared/collection-decks'

// One of the member's decks, held in real life, into the collection. By
// default only the cards the collection lacks: a deck built in Prism was
// often built from it, and adding it whole would count those cards twice.
// A deck owned on top of the collection goes in whole.
const props = defineProps<{ game: GameId }>()
const emit = defineEmits<{ rows: [rows: ImportRow[], name: string] }>()

const { t, locale } = useLocale()
const { decks } = useDeckStore()
const collection = useCollection(props.game)

const mine = computed(() => decks.value.filter(d => d.game === props.game && d.raw.trim()).sort((a, b) => b.updatedAt - a.updatedAt))
const pickedId = ref<string | null>(null)
const picked = computed(() => mine.value.find(d => d.id === pickedId.value) ?? null)
const onlyMissing = ref(true)
const lang = ref<'fr' | 'en'>(locale.value === 'fr' ? 'fr' : 'en')
const location = ref('')

function pick(id: string) {
  pickedId.value = id
  location.value = mine.value.find(d => d.id === id)?.name ?? ''
}

/** Copies held of each card, any printing (what a deck line matches). */
const owned = computed(() => {
  const m = new Map<string, number>()
  for (const c of collection.copies.value) {
    const name = props.game === 'mtg' ? c.card?.name : c.card?.number
    if (name)
      m.set(ownershipKey(props.game, name), (m.get(ownershipKey(props.game, name)) ?? 0) + c.quantity)
  }
  return m
})
const rows = computed(() => (picked.value ? deckImportRows(props.game, picked.value.raw, lang.value, { owned: onlyMissing.value ? owned.value : undefined, location: location.value.trim() || null }) : []))
const copies = computed(() => rows.value.reduce((n, r) => n + r.quantity, 0))
const total = computed(() => (picked.value ? deckImportRows(props.game, picked.value.raw, lang.value).reduce((n, r) => n + r.quantity, 0) : 0))
const date = (ms: number) => new Date(ms).toLocaleDateString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })
</script>

<template>
  <div class="decks">
    <p v-if="!mine.length" class="state">
      {{ t('collection.fromDeck.none') }}
    </p>
    <template v-else>
      <ul class="list">
        <li v-for="d in mine" :key="d.id">
          <button type="button" class="deck" :aria-pressed="pickedId === d.id" @click="pick(d.id)">
            <UIcon :name="pickedId === d.id ? 'i-lucide-circle-check' : 'i-lucide-layers'" class="h-5 w-5 shrink-0" />
            <span class="name">{{ d.name }}</span>
            <span class="meta">{{ date(d.updatedAt) }}</span>
          </button>
        </li>
      </ul>

      <section v-if="picked" class="opts">
        <USwitch v-model="onlyMissing" :label="t('collection.fromDeck.onlyMissing')" :description="onlyMissing ? t('collection.fromDeck.onlyMissingHint') : t('collection.fromDeck.wholeHint')" />
        <div class="row">
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
        <p class="summary">
          {{ t('collection.fromDeck.summary').replace('{n}', String(copies)).replace('{total}', String(total)) }}
        </p>
        <UButton size="lg" icon="i-lucide-scan-search" block :disabled="!rows.length" @click="emit('rows', rows, picked.name)">
          {{ rows.length ? t('collection.precon.preview') : t('collection.fromDeck.allOwned') }}
        </UButton>
      </section>
    </template>
  </div>
</template>

<style scoped>
.decks {
  display: grid;
  gap: 14px;
}
.state {
  padding: 28px 0;
  font-size: 13px;
  text-align: center;
  color: var(--color-text-muted);
}
.list {
  display: grid;
  gap: 4px;
  overflow-y: auto;
  max-height: 32vh;
  margin: 0;
  padding: 0;
  list-style: none;
}
.deck {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  text-align: left;
  color: var(--color-text-muted);
}
.deck[aria-pressed='true'] {
  border-color: var(--ui-primary);
  background: var(--accent-soft);
  color: var(--accent-text);
}
.name {
  flex: 1;
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-high);
}
.meta {
  font-size: 12px;
}
.opts {
  display: grid;
  gap: 14px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 14px;
}
.grow {
  flex: 1 1 200px;
}
.summary {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-mid);
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
