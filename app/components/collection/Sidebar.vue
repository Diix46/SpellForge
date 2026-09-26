<script setup lang="ts">
import type { CollectionSummary } from '#shared/collection'
import type { GameId } from '#shared/game'
import type { CollectionFilters } from '~/composables/useCollectionView'
import { computed } from 'vue'
import { CONDITIONS, FINISHES } from '#shared/collection'

// The collection at a glance (value, copies, cards) and its filters.
const props = defineProps<{
  game: GameId
  summary: CollectionSummary
  sets: { code: string, name: string, icon: string | null }[]
  rarities: string[]
  active: boolean
}>()
defineEmits<{ reset: [] }>()
const filters = defineModel<CollectionFilters>({ required: true })
const { t, locale, rarityLabel } = useLocale()
const money = (n: number) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'EUR' })
const count = (n: number) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US')
const gain = computed(() => (props.summary.paid > 0 ? props.summary.value - props.summary.paid : null))

const setItems = computed(() => [{ label: t('collection.allSets'), value: 'all' }, ...props.sets.map(s => ({ label: s.name, value: s.code }))])
const finishItems = computed(() => [{ label: t('collection.allFinishes'), value: 'all' }, ...FINISHES.map(f => ({ label: t(`collection.finish.${f}`), value: f }))])
const conditionItems = computed(() => [{ label: t('collection.allConditions'), value: 'all' }, ...CONDITIONS.map(c => ({ label: `${c} · ${t(`collection.condition.${c}`)}`, value: c }))])
const rarityItems = computed(() => [{ label: t('collection.allRarities'), value: 'all' }, ...props.rarities.map(r => ({ label: rarityLabel(r), value: r }))])
</script>

<template>
  <aside class="side">
    <section class="summary">
      <template v-if="game === 'mtg'">
        <p class="label" :title="t('collection.valueHint')">
          {{ t('collection.value') }}
        </p>
        <p class="value">
          {{ money(summary.value) }}
        </p>
        <p v-if="gain != null" class="gain" :class="gain >= 0 ? 'up' : 'down'">
          <UIcon :name="gain >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'" class="h-3.5 w-3.5" />
          {{ t('collection.gain') }} {{ gain >= 0 ? '+' : '' }}{{ money(gain) }} · {{ t('collection.paid') }} {{ money(summary.paid) }}
        </p>
      </template>
      <div class="counts">
        <span><b>{{ count(summary.copies) }}</b> {{ t('collection.copies') }}</span>
        <span><b>{{ count(summary.cards) }}</b> {{ t('collection.cards') }}</span>
        <span><b>{{ count(summary.printings) }}</b> {{ t('collection.printings') }}</span>
      </div>
      <p v-if="game === 'mtg' && summary.unpriced" class="unpriced">
        {{ t('collection.unpriced').replace('{n}', count(summary.unpriced)) }}
      </p>
    </section>

    <section class="filters">
      <UInput v-model="filters.q" icon="i-lucide-search" :placeholder="t('collection.filterPlaceholder')" class="w-full" />
      <USelect v-if="sets.length > 1" v-model="filters.set" :items="setItems" class="w-full" />
      <USelect v-if="game === 'mtg'" v-model="filters.finish" :items="finishItems" class="w-full" />
      <USelect v-model="filters.condition" :items="conditionItems" class="w-full" />
      <USelect v-if="rarities.length > 1" v-model="filters.rarity" :items="rarityItems" class="w-full" />
      <UButton v-if="active" color="neutral" variant="ghost" size="sm" icon="i-lucide-rotate-ccw" @click="$emit('reset')">
        {{ t('discover.reset') }}
      </UButton>
    </section>
  </aside>
</template>

<style scoped>
.side {
  display: grid;
  align-content: start;
  gap: 16px;
}
.summary {
  padding: 18px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: radial-gradient(260px 120px at 100% 0%, var(--accent-soft), transparent 70%), var(--color-surface-1);
  box-shadow: var(--shadow-elev-1);
}
.label {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.value {
  margin: 4px 0 2px;
  font-family: var(--font-mono);
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--color-text-high);
}
.gain {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 10px;
  font-size: 12px;
}
.gain.up {
  color: var(--ui-success);
}
.gain.down {
  color: var(--ui-error);
}
.counts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-muted);
}
.counts b {
  font-family: var(--font-mono);
  color: var(--color-text-high);
}
.unpriced {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--color-text-disabled);
}
.filters {
  display: grid;
  gap: 8px;
}
</style>
