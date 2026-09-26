<script setup lang="ts">
import type { Condition, Finish } from '#shared/collection'
import type { GameId } from '#shared/game'
import type { OptcgCard } from '#shared/optcg/types'
import type { PrintChoice } from '~/composables/useCollection'
import type { ImportSource } from '~/composables/useCollectionAdd'
import { computed, reactive, ref, watch } from 'vue'
import { CONDITIONS, MAX_COPIES, optcgPrintingId } from '#shared/collection'

// Adding copies: find the card, pick its exact printing, say which finish,
// condition, language and how many (where they are, if you like). Closes once
// they are in.
const props = defineProps<{ game: GameId, initialQuery?: string, initialPrinting?: string }>()
const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useLocale()
const toast = useToast()
const collection = useCollection(props.game)

const query = ref('')
const suggestions = ref<{ key: string, label: string, hint?: string, thumb?: string }[]>([])
const picked = ref<{ key: string, label: string } | null>(null)
const prints = ref<PrintChoice[]>([])
const loadingPrints = ref(false)
const selected = ref<string | null>(null)
const form = reactive({ finish: 'nonfoil' as Finish, condition: 'NM' as Condition, quantity: 1, location: '' })
const adding = ref(false)
// Where the copies are: optional, behind a button.
const showLocation = ref(false)
// The copy's language. One Piece: the same art in either language. Magic: the
// printing's, unless the copy is in the other one (a French copy of a
// printing Scryfall only lists in English).
const copyLang = ref<'fr' | 'en'>(locale.value === 'fr' ? 'fr' : 'en')
const { loadPrints, relang } = usePrintChoices(props.game)

const current = computed(() => prints.value.find(p => p.printingId === selected.value) ?? null)
const finishes = computed<Finish[]>(() => current.value?.finishes ?? ['nonfoil'])
const conditions = computed(() => CONDITIONS.map(c => ({ label: `${c} · ${t(`collection.condition.${c}`)}`, value: c })))

watch(open, (v) => {
  if (v && props.game === 'optcg' && props.initialPrinting?.startsWith('en:'))
    copyLang.value = 'en'
  if (v && props.initialQuery) {
    query.value = props.initialQuery
    void choose({ key: props.initialQuery, label: props.initialQuery })
  }
})
// Magic: a printing picked brings its language.
watch(current, (c) => {
  if (c && props.game === 'mtg')
    copyLang.value = c.lang === 'fr' ? 'fr' : 'en'
})
// Closed: the next opening starts afresh.
watch(open, (v) => {
  if (v)
    return
  query.value = ''
  picked.value = null
  prints.value = []
  selected.value = null
  showLocation.value = false
  Object.assign(form, { finish: 'nonfoil', condition: 'NM', quantity: 1, location: '' })
})
watch(finishes, (f) => {
  if (!f.includes(form.finish))
    form.finish = f[0] ?? 'nonfoil'
})

let timer: ReturnType<typeof setTimeout> | undefined
watch(query, (q) => {
  clearTimeout(timer)
  if (picked.value && q === picked.value.label)
    return
  timer = setTimeout(() => void suggest(q.trim()), 180)
})

async function suggest(q: string) {
  if (q.length < 2) {
    suggestions.value = []
    return
  }
  try {
    if (props.game === 'mtg') {
      // English or French names; the card is then found by its English one.
      const { cards } = await $fetch<{ cards: { name: string, label: string, hint: string | null, thumb: string | null }[] }>('/api/collection/suggest', { query: { q, lang: locale.value } })
      suggestions.value = cards.map(c => ({ key: c.name, label: c.label, hint: c.hint ?? undefined, thumb: c.thumb ?? undefined }))
    }
    else {
      const { cards } = await $fetch<{ cards: OptcgCard[] }>('/api/optcg/autocomplete', { query: { q, lang: locale.value } })
      suggestions.value = cards.slice(0, 8).map(c => ({ key: c.number, label: c.name, hint: c.number, thumb: c.thumb }))
    }
  }
  catch {
    suggestions.value = []
  }
}

const { openImport } = useCollectionImportDialog()
function bulk(source: ImportSource) {
  open.value = false
  openImport(source)
}

/** Enter takes the first suggestion, once they have come (typed fast, they may not have). */
async function pickFirst() {
  clearTimeout(timer)
  if (!suggestions.value.length)
    await suggest(query.value.trim())
  const first = suggestions.value[0]
  if (first)
    void choose(first)
}

async function choose(s: { key: string, label: string }) {
  picked.value = s
  query.value = s.label
  suggestions.value = []
  selected.value = null
  loadingPrints.value = true
  try {
    prints.value = await loadPrints(s.key, copyLang.value)
    // The printing the dialog was opened on, else the newest.
    selected.value = prints.value.find(p => p.printingId === props.initialPrinting)?.printingId ?? prints.value[0]?.printingId ?? null
  }
  catch {
    prints.value = []
  }
  finally {
    loadingPrints.value = false
  }
}

// One Piece: switching the copy language re-keys the arts.
watch(copyLang, (lang) => {
  if (props.game !== 'optcg')
    return
  const art = selected.value?.split(':')[1]
  prints.value = relang(prints.value, lang)
  selected.value = art ? optcgPrintingId(lang, art) : null
})

async function add() {
  if (!current.value || adding.value)
    return
  adding.value = true
  const quantity = Math.max(1, Math.min(MAX_COPIES, Math.round(Number(form.quantity) || 1)))
  const copy = await collection.add({
    printingId: current.value.printingId,
    finish: form.finish,
    condition: form.condition,
    quantity,
    lang: props.game === 'mtg' ? copyLang.value : undefined,
    location: form.location.trim() || undefined,
  })
  adding.value = false
  if (copy) {
    toast.add({ title: t('collection.added'), description: `${picked.value?.label} · ${current.value.set.toUpperCase()} #${current.value.number} · ${copyLang.value.toUpperCase()} ×${quantity}`, color: 'success', icon: 'i-lucide-check' })
    open.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('collection.add')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <div class="add">
        <!-- Not one card but a whole deck: the import dialog, on that source. -->
        <div class="whole">
          <span>{{ t('collection.add.whole') }}</span>
          <button v-if="game === 'mtg'" type="button" @click="bulk('precon')">
            <UIcon name="i-lucide-box" class="h-4 w-4" /> {{ t('collection.import.sourcePrecon') }}
          </button>
          <button type="button" @click="bulk('deck')">
            <UIcon name="i-lucide-layers" class="h-4 w-4" /> {{ t('collection.import.sourceDeck') }}
          </button>
          <button type="button" @click="bulk('file')">
            <UIcon name="i-lucide-file-up" class="h-4 w-4" /> {{ t('collection.import.sourceFile') }}
          </button>
        </div>
        <div class="search">
          <UInput v-model="query" icon="i-lucide-search" :placeholder="t('collection.searchCard')" size="lg" class="w-full" autofocus @keydown.enter.prevent="pickFirst" />
          <ul v-if="suggestions.length" class="suggestions" role="listbox">
            <li v-for="s in suggestions" :key="`${s.key}-${s.label}`">
              <button type="button" @click="choose(s)">
                <img v-if="s.thumb" :src="s.thumb" alt="" class="sthumb">
                <span>{{ s.label }}</span>
                <span v-if="s.hint" class="hint">{{ s.hint }}</span>
              </button>
            </li>
          </ul>
        </div>

        <div v-if="picked" class="prints">
          <div class="prints-head">
            <span>{{ t('collection.choosePrinting') }}</span>
            <div class="langs" role="group" :aria-label="t('collection.copyLang')" :title="t('collection.copyLang')">
              <button type="button" :aria-pressed="copyLang === 'fr'" @click="copyLang = 'fr'">
                FR
              </button>
              <button type="button" :aria-pressed="copyLang === 'en'" @click="copyLang = 'en'">
                EN
              </button>
            </div>
          </div>
          <div v-if="loadingPrints" class="state">
            <UIcon name="i-lucide-loader-circle" class="h-6 w-6 animate-spin" />
          </div>
          <p v-else-if="!prints.length" class="state">
            {{ t('collection.noPrints') }}
          </p>
          <CollectionPrintChoices v-else :prints="prints" :selected="selected" :owned="collection.ownedByPrinting.value" @select="selected = $event" />
        </div>
      </div>
    </template>
    <template v-if="current" #footer>
      <form class="options" @submit.prevent="add">
        <div v-if="finishes.length > 1" class="seg" role="group" :aria-label="t('collection.finish')">
          <button v-for="f in finishes" :key="f" type="button" :aria-pressed="form.finish === f" :class="{ shiny: f !== 'nonfoil' }" @click="form.finish = f">
            {{ t(`collection.finish.${f}`) }}
          </button>
        </div>
        <USelect v-model="form.condition" :items="conditions" class="w-44" :aria-label="t('collection.condition')" />
        <UInputNumber v-model="form.quantity" :min="1" :max="MAX_COPIES" class="w-28" :aria-label="t('collection.quantity')" />
        <UInput v-if="showLocation" v-model="form.location" icon="i-lucide-archive" :placeholder="t('collection.locationPlaceholder')" maxlength="80" class="min-w-0 flex-1" :aria-label="t('collection.location')" autofocus />
        <UButton v-else color="neutral" variant="ghost" icon="i-lucide-archive" @click="showLocation = true">
          {{ t('collection.addLocation') }}
        </UButton>
        <span class="grow" />
        <UButton type="submit" icon="i-lucide-plus" :loading="adding">
          {{ t('collection.addCopies').replace('{n}', String(form.quantity || 1)) }}
        </UButton>
      </form>
    </template>
  </UModal>
</template>

<style scoped>
.whole {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--color-text-muted);
}
.whole button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 11px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 999px;
  color: var(--color-text-high);
  transition:
    border-color 0.15s,
    background 0.15s;
}
.whole button:hover {
  border-color: var(--ui-primary);
  background: var(--accent-soft);
}
.add {
  display: grid;
  gap: 16px;
}
.search {
  position: relative;
}
/* In the flow, not floating: the dialog is short until a card is chosen,
   and would clip a floating list. */
.suggestions {
  margin: 4px 0 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  box-shadow: var(--shadow-elev-2);
}
.suggestions button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  text-align: left;
  font-size: 14px;
  color: var(--color-text-high);
}
.suggestions button:hover {
  background: var(--color-surface-2);
}
.sthumb {
  width: 22px;
  border-radius: 2px;
}
.hint {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}
.prints-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.langs,
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-sm);
}
.langs button,
.seg button {
  padding: 4px 10px;
  border-radius: calc(var(--radius-sm) - 2px);
  font-size: 12.5px;
  color: var(--color-text-muted);
}
.langs button[aria-pressed='true'],
.seg button[aria-pressed='true'] {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}
.seg button.shiny[aria-pressed='true'] {
  background: linear-gradient(90deg, #ffb3d6, #b3e6ff, #fff0b3);
  color: #1b1f22;
}
.state {
  display: grid;
  place-items: center;
  padding: 30px;
  color: var(--color-text-muted);
}
.prints {
  max-height: min(52vh, 520px);
  overflow-y: auto;
  padding-right: 4px;
}
.grow {
  flex: 1;
}
.options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
}
</style>
