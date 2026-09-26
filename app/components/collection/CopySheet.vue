<script setup lang="ts">
import type { CollectionCopy, Condition, Finish } from '#shared/collection'
import type { CopyEdit, PrintChoice } from '~/composables/useCollection'
import { computed, reactive, ref, watch } from 'vue'
import { CONDITIONS, MAX_COPIES, optcgPrintingId, unitValue } from '#shared/collection'

// Edit one copy line: its printing (the right set, when the wrong one was
// picked) and language, finish, condition, quantity, location, note — or
// take it out of the collection.
const props = defineProps<{ copy: CollectionCopy | null, name: string }>()
const emit = defineEmits<{ save: [id: string, edit: CopyEdit], remove: [id: string] }>()
const open = defineModel<boolean>('open', { required: true })
const { t, locale } = useLocale()
const form = reactive({ printingId: '', lang: 'en' as 'fr' | 'en', finish: 'nonfoil' as Finish, condition: 'NM' as Condition, quantity: 1, location: '', note: '' })

// The card's other printings, loaded when asked for.
const prints = ref<PrintChoice[]>([])
const choosing = ref(false)
const loadingPrints = ref(false)
const game = computed(() => props.copy?.game ?? 'mtg')
const { loadPrints, relang } = usePrintChoices(game.value)
const collection = useCollection(game.value)

watch(() => props.copy, (c) => {
  if (!c)
    return
  Object.assign(form, { printingId: c.printingId, lang: c.lang, finish: c.finish, condition: c.condition, quantity: c.quantity, location: c.location ?? '', note: c.note ?? '' })
  prints.value = []
  choosing.value = false
}, { immediate: true })

async function choose() {
  choosing.value = !choosing.value
  if (!choosing.value || prints.value.length || !props.copy?.card)
    return
  loadingPrints.value = true
  try {
    prints.value = await loadPrints(game.value === 'mtg' ? props.copy.card.name : props.copy.card.number, form.lang)
  }
  catch {
    prints.value = []
  }
  finally {
    loadingPrints.value = false
  }
}

/** The printing now chosen: from the list once loaded, else the copy's own. */
const chosen = computed(() => prints.value.find(p => p.printingId === form.printingId) ?? null)
const changed = computed(() => !!props.copy && form.printingId !== props.copy.printingId)
const image = computed(() => (changed.value && chosen.value?.image) || props.copy?.card?.image || '')
const where = computed(() => {
  if (changed.value && chosen.value)
    return { set: chosen.value.set, setName: chosen.value.setName, setIcon: chosen.value.setIcon, rarity: chosen.value.rarity, number: chosen.value.number }
  const c = props.copy?.card
  return c ? { set: c.set, setName: c.setName ?? c.set.toUpperCase(), setIcon: c.setIcon, rarity: c.rarity, number: c.number } : null
})

function setLang(lang: 'fr' | 'en') {
  form.lang = lang
  // One Piece: the language is part of the printing.
  if (game.value === 'optcg') {
    form.printingId = optcgPrintingId(lang, form.printingId.split(':')[1]!)
    prints.value = relang(prints.value, lang)
  }
}
function pick(id: string) {
  form.printingId = id
  const p = prints.value.find(x => x.printingId === id)
  // Magic: a printing picked brings its language (switch it back for a
  // copy Scryfall lacks in yours).
  if (p && game.value === 'mtg')
    form.lang = p.lang === 'fr' ? 'fr' : 'en'
}

const finishList = computed<Finish[]>(() => (changed.value ? chosen.value?.finishes : props.copy?.card?.finishes) ?? ['nonfoil'])
watch(finishList, (f) => {
  if (!f.includes(form.finish))
    form.finish = f[0] ?? 'nonfoil'
})
const finishes = computed(() => finishList.value.map(f => ({ label: t(`collection.finish.${f}`), value: f })))
const conditions = computed(() => CONDITIONS.map(c => ({ label: `${c} · ${t(`collection.condition.${c}`)}`, value: c })))
const money = (n: number) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'EUR' })
const unit = computed(() => {
  if (!props.copy)
    return null
  if (!changed.value)
    return unitValue(props.copy.card, form.finish)
  const p = chosen.value
  const raw = form.finish !== 'nonfoil' ? p?.priceFoil ?? p?.price : p?.price
  return raw == null ? null : Number(raw)
})

function save() {
  if (!props.copy)
    return
  const edit: CopyEdit = {
    finish: form.finish,
    condition: form.condition,
    quantity: Math.max(1, Math.min(MAX_COPIES, Math.round(Number(form.quantity) || 1))),
    location: form.location.trim() || null,
    note: form.note.trim() || null,
  }
  if (changed.value)
    edit.printingId = form.printingId
  if (game.value === 'mtg' && form.lang !== props.copy.lang)
    edit.lang = form.lang
  emit('save', props.copy.id, edit)
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="name" :description="copy?.card ? `${copy.card.setName ?? copy.card.set.toUpperCase()} · #${copy.card.number} · ${copy.lang.toUpperCase()}` : undefined" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <div v-if="copy" class="sheet">
        <div class="art" :class="{ shiny: form.finish !== 'nonfoil' }">
          <img v-if="image" :src="image" :alt="name">
        </div>
        <form class="form" @submit.prevent="save">
          <!-- The printing: set and number, the copy's language, another one. -->
          <div v-if="where" class="printing" :class="{ changed }">
            <CollectionSetSymbol :icon="where.setIcon" :rarity="where.rarity" :size="18" />
            <div class="min-w-0 flex-1">
              <p class="p-name">
                {{ where.setName }}
              </p>
              <p class="p-meta">
                {{ where.set.toUpperCase() }} #{{ where.number }}
              </p>
            </div>
            <div class="langs" role="group" :aria-label="t('collection.copyLang')" :title="t('collection.copyLang')">
              <button v-for="l in (['fr', 'en'] as const)" :key="l" type="button" :aria-pressed="form.lang === l" @click="setLang(l)">
                {{ l.toUpperCase() }}
              </button>
            </div>
            <UButton size="sm" color="neutral" :variant="choosing ? 'soft' : 'subtle'" icon="i-lucide-replace" @click="choose">
              {{ t('collection.changePrinting') }}
            </UButton>
          </div>
          <div class="two">
            <UFormField v-if="finishes.length > 1" :label="t('collection.finish')">
              <USelect v-model="form.finish" :items="finishes" class="w-full" />
            </UFormField>
            <UFormField :label="t('collection.condition')">
              <USelect v-model="form.condition" :items="conditions" class="w-full" />
            </UFormField>
          </div>
          <div class="two">
            <UFormField :label="t('collection.quantity')">
              <UInputNumber v-model="form.quantity" :min="1" :max="MAX_COPIES" class="w-full" />
            </UFormField>
          </div>
          <UFormField :label="t('collection.location')" :hint="t('collection.optional')">
            <UInput v-model="form.location" :placeholder="t('collection.locationPlaceholder')" icon="i-lucide-archive" maxlength="80" class="w-full" />
          </UFormField>
          <UFormField :label="t('collection.note')" :hint="t('collection.optional')">
            <UTextarea v-model="form.note" :rows="2" maxlength="500" class="w-full" />
          </UFormField>
          <p v-if="unit != null" class="worth">
            {{ money(unit) }} {{ t('collection.unit') }} · <b>{{ money(unit * (Number(form.quantity) || 1)) }}</b>
          </p>
          <div class="actions">
            <UButton color="error" variant="ghost" icon="i-lucide-trash-2" @click="emit('remove', copy.id); open = false">
              {{ t('collection.delete') }}
            </UButton>
            <UButton type="submit" icon="i-lucide-check">
              {{ t('collection.save') }}
            </UButton>
          </div>
        </form>
        <!-- Another printing of the card, across the whole sheet. -->
        <section v-if="choosing" class="picker">
          <div v-if="loadingPrints" class="state">
            <UIcon name="i-lucide-loader-circle" class="h-6 w-6 animate-spin" />
          </div>
          <p v-else-if="!prints.length" class="state">
            {{ t('collection.noPrints') }}
          </p>
          <CollectionPrintChoices v-else :prints="prints" :selected="form.printingId" :owned="collection.ownedByPrinting.value" @select="pick" />
        </section>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.sheet {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 22px;
}
.art {
  position: relative;
  align-self: start;
  overflow: hidden;
  border-radius: 4.5% / 3.3%;
  box-shadow: var(--shadow-elev-2);
}
.art img {
  display: block;
  width: 100%;
}
.art.shiny::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    115deg,
    transparent 20%,
    rgba(255, 90, 160, 0.3) 35%,
    rgba(90, 200, 255, 0.3) 50%,
    rgba(255, 230, 90, 0.3) 65%,
    transparent 80%
  );
  background-size: 250% 250%;
  mix-blend-mode: color-dodge;
  animation: sheen 5s ease-in-out infinite;
}
@keyframes sheen {
  0%,
  100% {
    background-position: 100% 0;
  }
  50% {
    background-position: 0 100%;
  }
}
.printing {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
  transition: border-color 0.2s;
}
.printing.changed {
  border-color: var(--ui-primary);
  background: var(--accent-soft);
}
.p-name {
  overflow: hidden;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-high);
}
.p-meta {
  margin: 1px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}
.langs {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-sm);
}
.langs button {
  padding: 3px 8px;
  border-radius: calc(var(--radius-sm) - 2px);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
}
.langs button[aria-pressed='true'] {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}
.picker {
  grid-column: 1 / -1;
  overflow-y: auto;
  max-height: 360px;
  padding-top: 4px;
  border-top: 1px solid var(--color-border-subtle);
}
.state {
  display: grid;
  place-items: center;
  padding: 24px 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
.form {
  display: grid;
  align-content: start;
  gap: 12px;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.worth {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
.worth b {
  font-family: var(--font-mono);
  color: var(--accent-text);
}
.actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
}
@media (max-width: 640px) {
  .sheet {
    grid-template-columns: 1fr;
  }
  .art {
    max-width: 200px;
    justify-self: center;
  }
}
</style>
