<script setup lang="ts">
import type { Deck } from '~/composables/useDeckStore'
import type { ManaColor } from '~/composables/useMtg'
import { computed } from 'vue'
import { useDecklist } from '~/composables/useDecklist'
import { useManaIdentity } from '~/composables/useManaIdentity'

const props = defineProps<{ deck: Deck }>()
const emit = defineEmits<{
  open: [id: string]
  duplicate: [id: string]
  delete: [id: string, name: string]
  rename: [id: string]
}>()

const { parse, totalCards } = useDecklist()
const { identity, colorVar, accentStyle } = useManaIdentity()
const { t, formatShortDate } = useLocale()

// Stable id so the clickable tile (role=button) borrows the deck-name heading
// as its accessible name (visible label === accessible name).
const titleId = useId()

const cardCount = computed(() => {
  const { mainboard, sideboard } = parse(props.deck.raw)
  return totalCards(mainboard) + totalCards(sideboard)
})

const colors = computed<ManaColor[]>(() => identity(props.deck.raw))

const sourceBadge = computed(() => {
  if (props.deck.source?.includes('edhrec'))
    return { label: 'EDHREC', kind: 'import' as const }
  if (props.deck.source && props.deck.source !== 'manual')
    return { label: t('source.import'), kind: 'import' as const }
  return { label: t('source.manual'), kind: 'manual' as const }
})

// Per-tile accent from the deck's mana identity (drives the hover top-bar + glow).
const tileAccent = computed(() => accentStyle(colors.value))

const menuItems = computed(() => [
  [{ label: t('tile.open'), icon: 'i-lucide-folder-open', onSelect: () => emit('open', props.deck.id) }],
  [
    { label: t('tile.rename'), icon: 'i-lucide-pencil', onSelect: () => emit('rename', props.deck.id) },
    { label: t('tile.duplicate'), icon: 'i-lucide-copy', onSelect: () => emit('duplicate', props.deck.id) },
  ],
  [{ label: t('tile.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete', props.deck.id, props.deck.name) }],
])
</script>

<template>
  <div
    role="button"
    tabindex="0"
    :aria-labelledby="titleId"
    class="deck-tile lift"
    :style="tileAccent"
    @click="emit('open', deck.id)"
    @keydown.enter.prevent="emit('open', deck.id)"
    @keydown.space.prevent="emit('open', deck.id)"
  >
    <!-- header row -->
    <div class="flex items-start justify-between gap-2">
      <h2 :id="titleId" class="tile-name">
        {{ deck.name }}
      </h2>
      <UDropdownMenu :items="menuItems" @click.stop>
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('tile.menu')"
          class="tile-menu"
          @click.stop
        />
      </UDropdownMenu>
    </div>

    <p class="tile-sub">
      {{ t('tile.updated') }} {{ formatShortDate(deck.updatedAt) }}
    </p>

    <!-- mana fingerprint -->
    <div class="tile-pips">
      <template v-if="colors.length">
        <span
          v-for="c in colors"
          :key="c"
          class="pip"
          :style="{ background: colorVar(c) }"
        />
      </template>
      <span v-else class="pip pip-colorless" />
      <span class="tile-colors">{{ colors.length ? colors.join('').toUpperCase() : t('tile.colorless') }}</span>
    </div>

    <!-- footer -->
    <div class="tile-foot">
      <span class="tile-count">{{ cardCount }} <span>{{ t('tile.cards') }}</span></span>
      <span class="tile-badge" :class="sourceBadge.kind">{{ sourceBadge.label }}</span>
    </div>

    <!-- hover open hint -->
    <span class="tile-open">
      {{ t('tile.open') }}
      <UIcon name="i-lucide-arrow-right" class="h-3 w-3" />
    </span>
  </div>
</template>

<style scoped>
.deck-tile {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 40%), var(--color-surface-1);
  padding: 18px;
  box-shadow: var(--shadow-elev-1);
}
/* mana-colored top bar reveals on hover */
.deck-tile::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  opacity: 0;
  transition: opacity var(--dur) var(--ease-out);
}
.deck-tile:hover {
  border-color: var(--color-border-strong);
  background: radial-gradient(360px 160px at 90% 0%, var(--accent-soft), transparent 60%), var(--color-surface-2);
}
.deck-tile:hover::before {
  opacity: 0.9;
}
.deck-tile:focus-visible {
  outline: none;
}

.tile-name {
  min-width: 0;
  flex: 1;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: var(--color-text-high);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tile-menu {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--dur) var(--ease-out);
}
.deck-tile:hover .tile-menu,
.deck-tile:focus-within .tile-menu {
  opacity: 0.7;
}
.tile-sub {
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--color-text-disabled);
}

.tile-pips {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 16px 0;
}
.pip {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.14);
}
.pip-colorless {
  background: var(--color-ink-500);
}
.tile-colors {
  margin-left: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.tile-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border-hairline);
}
.tile-count {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-text-high);
}
.tile-count span {
  color: var(--color-text-disabled);
}
.tile-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
}
.tile-badge.manual {
  color: var(--color-text-mid);
  background: var(--color-surface-3);
  border: 1px solid var(--color-border-subtle);
}
.tile-badge.import {
  color: var(--accent-text);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
}

.tile-open {
  position: absolute;
  right: 16px;
  bottom: 52px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-text);
  opacity: 0;
  transform: translateX(-6px);
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out);
}
.deck-tile:hover .tile-open {
  opacity: 1;
  transform: none;
}
</style>
