<script setup lang="ts">
import type { ScryfallCard } from '~/composables/useScryfall'
import { computed } from 'vue'
import { useCardDnd } from '~/composables/useCardDnd'
import { useLocale } from '~/composables/useLocale'
import { displayName } from '~/composables/useMtg'

// One search-result card: image (or name fallback), price tag, drag-to-add
// handle, and the add/remove toggle overlay. Extracted from CardSearchPanel so
// the panel template stays small (the user prefers many small components).

const props = defineProps<{
  card: ScryfallCard
  /** Whether this card is already in the deck (drives the toggle state). */
  inDeck: boolean
}>()

const emit = defineEmits<{
  add: [card: ScryfallCard]
  remove: [card: ScryfallCard]
  details: [card: ScryfallCard]
}>()

const { isFr, t } = useLocale()
const { startDrag, endDrag } = useCardDnd()

const name = computed(() => displayName(props.card, isFr.value))
const image = computed(() => props.card.image_uris?.normal ?? props.card.card_faces?.[0]?.image_uris?.normal ?? null)
const price = computed(() => props.card.prices?.eur ? `${props.card.prices.eur} €` : '')
</script>

<template>
  <div
    v-tilt="{ max: 12, scale: 1.06 }"
    class="dnd-draggable group relative overflow-hidden rounded-[var(--radius-md)]"
    draggable="true"
    @dragstart="startDrag($event, { source: 'search', name: card.name })"
    @dragend="endDrag"
  >
    <button type="button" class="block w-full" :aria-label="name" @click="emit('details', card)">
      <img
        v-if="image"
        :src="image"
        :alt="name"
        loading="lazy"
        class="block aspect-[63/88] w-full rounded-[var(--radius-md)] object-cover"
      >
      <div
        v-else
        class="flex aspect-[63/88] items-center justify-center rounded-[var(--radius-md)] bg-(--color-surface-2) p-1 text-center text-[10px] text-(--color-text-muted)"
      >
        {{ name }}
      </div>
    </button>

    <!-- price tag -->
    <span
      v-if="price"
      class="pointer-events-none absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 font-mono text-[9px] text-white"
    >{{ price }}</span>

    <!-- add / remove overlay: toggles. In deck → green check, turns into a
         red "remove" on hover so a second click takes it out of the deck. -->
    <div class="pointer-events-none absolute inset-x-0 bottom-0 flex gap-1 p-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        class="add-toggle pointer-events-auto flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] py-1 text-xs font-semibold text-(--color-bg-base)"
        :class="{ 'is-in-deck': inDeck }"
        :aria-label="`${inDeck ? t('build.removeFromDeck') : t('build.add')} — ${name}`"
        @click="inDeck ? emit('remove', card) : emit('add', card)"
      >
        <UIcon v-if="!inDeck" name="i-lucide-plus" class="h-3.5 w-3.5" />
        <template v-else>
          <UIcon name="i-lucide-check" class="check-icon h-3.5 w-3.5" />
          <UIcon name="i-lucide-x" class="remove-icon h-3.5 w-3.5" />
        </template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dnd-draggable {
  cursor: grab;
}
.dnd-draggable:active {
  cursor: grabbing;
}

/* Add / remove toggle. Default = accent (add). In deck = green check; hovering
   the in-deck button turns it red and swaps to an ✕ so a click clearly removes. */
.add-toggle {
  background: var(--accent);
  transition: background var(--dur-fast) var(--ease-out);
}
.add-toggle.is-in-deck {
  background: var(--color-success);
}
.add-toggle .remove-icon {
  display: none;
}
@media (hover: hover) {
  .add-toggle.is-in-deck:hover {
    background: var(--color-error);
  }
  .add-toggle.is-in-deck:hover .check-icon {
    display: none;
  }
  .add-toggle.is-in-deck:hover .remove-icon {
    display: inline-block;
  }
}
</style>
