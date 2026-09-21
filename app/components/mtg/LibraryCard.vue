<script setup lang="ts">
import type { ScryfallCard } from '~/composables/useScryfall'
import { computed } from 'vue'
import { displayName, displayType } from '~/composables/useMtg'
import { getImageUris } from '~/composables/useScryfall'

// A Magic card as it sits on the table: the card in a brass-edged sleeve, its name
// engraved beneath, the type line in italic. Perfectly square to the page,
// and slow to answer: the gold warms under the pointer.
const props = defineProps<{ card: ScryfallCard }>()
const emit = defineEmits<{ open: [card: ScryfallCard] }>()

const { isFr } = useLocale()
const name = computed(() => displayName(props.card, isFr.value))
const type = computed(() => displayType(props.card, isFr.value))
const image = computed(() => getImageUris(props.card)?.normal ?? null)
const price = computed(() => (props.card.prices?.eur ? `${props.card.prices.eur} €` : ''))
</script>

<template>
  <button type="button" class="page" :aria-label="name" @click="emit('open', card)">
    <span class="frame">
      <img v-if="image" :src="image" :alt="name" loading="lazy" decoding="async" width="488" height="680">
      <span v-else class="missing">{{ name }}</span>
    </span>
    <span class="name">{{ name }}</span>
    <span class="type u-prose">{{ type }}</span>
    <span v-if="price" class="price">{{ price }}</span>
  </button>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 10px 10px 12px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  box-shadow: var(--shadow-elev-1);
  text-align: center;
  transition:
    border-color var(--dur-slow) var(--ease-out),
    box-shadow var(--dur-slow) var(--ease-out),
    transform var(--dur-slow) var(--ease-out);
}
.page:hover,
.page:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.5);
  box-shadow: var(--shadow-elev-2);
  transform: translateY(-3px);
}
.frame {
  position: relative;
  display: block;
  padding: 4px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
}
.frame img {
  display: block;
  width: 100%;
  aspect-ratio: 63 / 88;
  border-radius: 4.5% / 3.2%;
  object-fit: cover;
}
.missing {
  display: grid;
  place-items: center;
  aspect-ratio: 63 / 88;
  padding: 8px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12.5px;
  letter-spacing: 0.04em;
  line-height: 1.2;
  color: var(--color-text-high);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.type {
  margin-top: -3px;
  font-size: 12.5px;
  line-height: 1.2;
  color: var(--color-text-muted);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.price {
  align-self: center;
  padding: 0 6px;
  border-top: 1px solid var(--color-border-hairline);
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--accent-text);
}
</style>
