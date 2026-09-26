<script setup lang="ts">
import type { CollectionCopy, Condition, Finish } from '#shared/collection'
import type { CopyEdit } from '~/composables/useCollection'
import { computed, reactive, watch } from 'vue'
import { CONDITIONS, MAX_COPIES, unitValue } from '#shared/collection'

// Edit one copy line: finish, condition, quantity, purchase price, location,
// note — or take it out of the collection.
const props = defineProps<{ copy: CollectionCopy | null, name: string }>()
const emit = defineEmits<{ save: [id: string, edit: CopyEdit], remove: [id: string] }>()
const open = defineModel<boolean>('open', { required: true })
const { t, locale } = useLocale()
const form = reactive({ finish: 'nonfoil' as Finish, condition: 'NM' as Condition, quantity: 1, purchasePrice: '', location: '', note: '' })
watch(() => props.copy, (c) => {
  if (!c)
    return
  Object.assign(form, { finish: c.finish, condition: c.condition, quantity: c.quantity, purchasePrice: c.purchasePrice == null ? '' : String(c.purchasePrice), location: c.location ?? '', note: c.note ?? '' })
}, { immediate: true })

const finishes = computed(() => (props.copy?.card?.finishes ?? ['nonfoil']).map(f => ({ label: t(`collection.finish.${f}`), value: f })))
const conditions = computed(() => CONDITIONS.map(c => ({ label: `${c} · ${t(`collection.condition.${c}`)}`, value: c })))
const money = (n: number) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'EUR' })
const unit = computed(() => (props.copy ? unitValue(props.copy.card, form.finish) : null))

function save() {
  if (!props.copy)
    return
  const price = form.purchasePrice === '' ? null : Number(form.purchasePrice)
  emit('save', props.copy.id, {
    finish: form.finish,
    condition: form.condition,
    quantity: Math.max(1, Math.min(MAX_COPIES, Math.round(Number(form.quantity) || 1))),
    purchasePrice: price != null && Number.isFinite(price) ? price : null,
    location: form.location.trim() || null,
    note: form.note.trim() || null,
  })
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="name" :description="copy?.card ? `${copy.card.setName ?? copy.card.set.toUpperCase()} · #${copy.card.number} · ${copy.card.lang.toUpperCase()}` : undefined" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div v-if="copy" class="sheet">
        <div class="art" :class="{ shiny: form.finish !== 'nonfoil' }">
          <img v-if="copy.card" :src="copy.card.image" :alt="name">
        </div>
        <form class="form" @submit.prevent="save">
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
            <UFormField :label="t('collection.purchasePrice')">
              <UInput v-model="form.purchasePrice" type="number" min="0" step="0.01" icon="i-lucide-euro" class="w-full" />
            </UFormField>
          </div>
          <UFormField :label="t('collection.location')">
            <UInput v-model="form.location" :placeholder="t('collection.locationPlaceholder')" icon="i-lucide-archive" maxlength="80" class="w-full" />
          </UFormField>
          <UFormField :label="t('collection.note')">
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
