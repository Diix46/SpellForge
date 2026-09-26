<script setup lang="ts">
import type { PrintChoice } from '~/composables/useCollection'

// The printings of one card to pick from: art, set symbol and number,
// language, price, and how many are already owned.
defineProps<{ prints: PrintChoice[], selected: string | null, owned: Map<string, number> }>()
defineEmits<{ select: [printingId: string] }>()

const { t } = useLocale()
</script>

<template>
  <div class="grid">
    <button
      v-for="p in prints"
      :key="p.printingId"
      type="button"
      class="choice"
      :class="{ on: selected === p.printingId }"
      :aria-pressed="selected === p.printingId"
      @click="$emit('select', p.printingId)"
    >
      <span class="art">
        <img v-if="p.image" :src="p.image" alt="" loading="lazy" decoding="async">
        <span v-if="owned.get(p.printingId)" class="owned">{{ t('collection.owned').replace('{n}', String(owned.get(p.printingId))) }}</span>
      </span>
      <span class="meta">
        <CollectionSetSymbol :icon="p.setIcon" :rarity="p.rarity" :size="13" :title="p.setName" />
        <span class="code">{{ p.set.toUpperCase() }} #{{ p.number }}</span>
        <span class="lang">{{ p.lang.toUpperCase() }}</span>
      </span>
      <span v-if="p.price" class="price">{{ p.price }} €</span>
    </button>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 12px;
}
.choice {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 4px;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background var(--dur-fast) var(--ease-out);
}
.choice:hover {
  background: var(--color-surface-2);
}
.choice.on {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 2px var(--accent-border);
}
.art {
  position: relative;
  display: block;
  aspect-ratio: 63 / 88;
  overflow: hidden;
  border-radius: 4.5% / 3.3%;
  background: var(--color-surface-2);
}
.art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.owned {
  position: absolute;
  left: 4px;
  right: 4px;
  bottom: 4px;
  padding: 1px 4px;
  border-radius: 999px;
  background: rgba(10, 12, 14, 0.8);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
}
.meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--color-text-muted);
}
.code {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--font-mono);
}
.lang {
  margin-left: auto;
  font-weight: 600;
}
.price {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent-text);
}
</style>
