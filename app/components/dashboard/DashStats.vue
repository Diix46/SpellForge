<script setup lang="ts">
import { useLocale } from '~/composables/useLocale'

// Dashboard stat strip (decks / cards / ready / last-update). Pure presentation;
// the page computes the values. Extracted from index.vue.

defineProps<{
  deckCount: number
  totalCards: number
  readyCount: number
  lastUpdated: string
}>()

const { t } = useLocale()
</script>

<template>
  <div class="stats">
    <div class="stat">
      <div class="stat-lab">
        <UIcon name="i-lucide-layout-grid" class="h-3.5 w-3.5" />{{ t('dash.decks') }}
      </div>
      <div class="stat-val">
        {{ deckCount }}
      </div>
    </div>
    <div class="stat">
      <div class="stat-lab">
        <UIcon name="i-lucide-layers" class="h-3.5 w-3.5" />{{ t('dash.cards') }}
      </div>
      <div class="stat-val">
        {{ totalCards }}
      </div>
    </div>
    <div class="stat">
      <div class="stat-lab">
        <UIcon name="i-lucide-zap" class="h-3.5 w-3.5" />{{ t('dash.ready') }}
      </div>
      <div class="stat-val">
        {{ readyCount }}
      </div>
    </div>
    <div class="stat">
      <div class="stat-lab">
        <UIcon name="i-lucide-clock" class="h-3.5 w-3.5" />{{ t('dash.lastUpdate') }}
      </div>
      <div class="stat-val stat-val--sm">
        {{ lastUpdated }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 24px;
}
.stat {
  border: 1px solid var(--color-border-hairline);
  background: var(--color-surface-1);
  border-radius: var(--radius-md);
  padding: 15px 17px;
  transition: border-color var(--dur) var(--ease-out);
}
.stat:hover {
  border-color: var(--color-border-subtle);
}
.stat-lab {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-disabled);
  font-weight: 500;
  margin-bottom: 9px;
}
.stat-val {
  font-family: var(--font-mono);
  font-size: 25px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--color-text-high);
}
.stat-val--sm {
  font-size: 18px;
}

@media (max-width: 920px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
