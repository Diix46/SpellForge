<script setup lang="ts">
import type { CollectionCopy } from '#shared/collection'
import { computed } from 'vue'
import { MAX_COPIES, unitValue } from '#shared/collection'

// One copy line in the list: everything at a glance, the quantity steps in place.
// While picking several lines, `selected` says whether this one is.
const props = defineProps<{ copy: CollectionCopy, name: string, selected?: boolean | null }>()
const emit = defineEmits<{ open: [copy: CollectionCopy], quantity: [copy: CollectionCopy, quantity: number] }>()

const { t, locale } = useLocale()
const money = (n: number) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'EUR' })
const unit = computed(() => unitValue(props.copy.card, props.copy.finish))
</script>

<template>
  <div class="row" :class="{ 'is-selected': selected }" role="button" tabindex="0" :aria-pressed="selected ?? undefined" @click="emit('open', copy)" @keydown.enter.self="emit('open', copy)">
    <span v-if="selected != null" class="thumb pick" aria-hidden="true"><UIcon v-if="selected" name="i-lucide-check" class="h-4 w-4" /></span>
    <img v-else-if="copy.card" :src="copy.card.thumb" alt="" class="thumb" loading="lazy">
    <span v-else class="thumb" />
    <span class="name">{{ name }}</span>
    <span class="set">
      <CollectionSetSymbol v-if="copy.card" :icon="copy.card.setIcon" :rarity="copy.card.rarity" :size="15" />
      <span class="code">{{ copy.card?.set.toUpperCase() }} #{{ copy.card?.number }}</span>
    </span>
    <span class="tag">{{ copy.lang.toUpperCase() }}</span>
    <span class="tag" :class="{ shiny: copy.finish !== 'nonfoil' }">{{ t(`collection.finish.${copy.finish}`) }}</span>
    <span class="tag" :title="t(`collection.condition.${copy.condition}`)">{{ copy.condition }}</span>
    <span class="loc">{{ copy.location }}</span>
    <span class="stepper" @click.stop @keydown.stop>
      <button type="button" :aria-label="`- ${name}`" @click="emit('quantity', copy, copy.quantity - 1)">
        <UIcon name="i-lucide-minus" class="h-3 w-3" />
      </button>
      <span>{{ copy.quantity }}</span>
      <button type="button" :aria-label="`+ ${name}`" :disabled="copy.quantity >= MAX_COPIES" @click="emit('quantity', copy, copy.quantity + 1)">
        <UIcon name="i-lucide-plus" class="h-3 w-3" />
      </button>
    </span>
    <span class="value">{{ unit == null ? '—' : money(unit * copy.quantity) }}</span>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 32px minmax(140px, 2fr) minmax(110px, 1.2fr) 34px 70px 36px minmax(0, 1fr) 84px 84px;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.row:hover,
.row:focus-visible {
  background: var(--color-surface-2);
  outline: none;
}
.thumb {
  width: 32px;
  height: 44px;
  border-radius: 3px;
  object-fit: cover;
  background: var(--color-surface-2);
}
.name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-high);
}
.set {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.code,
.value {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.value {
  text-align: right;
  color: var(--accent-text);
}
.tag {
  justify-self: start;
  padding: 1px 5px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-mid);
  white-space: nowrap;
}
.tag.shiny {
  border-color: transparent;
  background: linear-gradient(90deg, #ffb3d6, #b3e6ff, #fff0b3);
  color: #1b1f22;
}
.loc {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--color-text-muted);
}
.stepper {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 2px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-text-high);
}
.stepper button {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  color: var(--color-text-muted);
}
.stepper button:hover:not(:disabled) {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}
@media (max-width: 900px) {
  .row {
    grid-template-columns: 32px 1fr auto 84px;
  }
  .set,
  .tag,
  .loc {
    display: none;
  }
}
.pick {
  display: grid;
  place-items: center;
  height: 32px;
  border: 2px solid var(--color-border-strong);
  border-radius: 6px;
  color: #fff;
}
.is-selected {
  background: var(--accent-soft);
}
.is-selected .pick {
  border-color: var(--ui-primary);
  background: var(--ui-primary);
}
</style>
