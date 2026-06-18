<script setup lang="ts">
import type { Deck } from '~/composables/useDeckStore'
import type { ManaColor } from '~/composables/useMtg'
import { computed } from 'vue'
import { useDecklist } from '~/composables/useDecklist'
import { useManaIdentity } from '~/composables/useManaIdentity'
import { useSpotlight } from '~/composables/useSpotlight'
import { useTilt } from '~/composables/useTilt'

const props = defineProps<{ deck: Deck }>()
const emit = defineEmits<{
  open: [id: string]
  duplicate: [id: string]
  delete: [id: string, name: string]
  rename: [id: string]
}>()

const { parse, totalCards } = useDecklist()
const { identity, colorVar, accentStyle } = useManaIdentity()
const { locale, t } = useLocale()
const { el: tiltEl } = useTilt(6)
const { el: spotEl } = useSpotlight()

// Stable id so the clickable tile (role=button) can borrow the deck-name heading
// as its accessible name — visible label === accessible name (no a11y mismatch).
const titleId = useId()

const cardCount = computed(() => {
  const { mainboard, sideboard } = parse(props.deck.raw)
  return totalCards(mainboard) + totalCards(sideboard)
})

const colors = computed<ManaColor[]>(() => identity(props.deck.raw))

const sourceBadge = computed(() => {
  const neutral = 'text-(--color-text-mid) border-(--color-border-strong) bg-(--color-surface-2)'
  if (!props.deck.source)
    return { label: t('source.manual'), cls: neutral }
  if (props.deck.source.includes('edhrec'))
    return { label: 'EDHREC', cls: 'text-(--color-text-mid) border-(--color-border-strong) bg-(--color-surface-2)' }
  return { label: t('source.import'), cls: neutral }
})

// Per-tile accent style from the deck's mana identity (subtle, scoped to the tile).
const tileAccent = computed(() => accentStyle(colors.value))

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

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
    ref="spotEl"
    class="group glass-solid spotlight glow-accent-soft neon-edge relative cursor-pointer rounded-[var(--radius-xl)] p-px"
    :style="tileAccent"
  >
    <div
      ref="tiltEl"
      role="button"
      tabindex="0"
      :aria-labelledby="titleId"
      class="tilt relative h-full rounded-[var(--radius-xl)] p-5 focus-visible:outline-2 focus-visible:outline-(--accent-text)"
      @click="emit('open', deck.id)"
      @keydown.enter.prevent="emit('open', deck.id)"
      @keydown.space.prevent="emit('open', deck.id)"
    >
      <!-- header row -->
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <h2 :id="titleId" class="truncate font-display text-base font-semibold text-(--color-text-high)">
            {{ deck.name }}
          </h2>
          <p class="mt-1 font-mono text-xs text-(--color-text-muted)">
            {{ t('tile.updated') }} {{ formatDate(deck.updatedAt) }}
          </p>
        </div>

        <UDropdownMenu
          :items="menuItems"
          @click.stop
        >
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('tile.menu')"
            class="opacity-60 transition-opacity group-hover:opacity-100"
            @click.stop
          />
        </UDropdownMenu>
      </div>

      <!-- mana fingerprint -->
      <div class="mt-5 flex items-center gap-1.5">
        <template v-if="colors.length">
          <span
            v-for="c in colors"
            :key="c"
            class="h-3 w-3 rounded-full ring-1 ring-white/10"
            :style="{ background: colorVar(c), boxShadow: `0 0 8px ${colorVar(c)}` }"
          />
        </template>
        <span
          v-else
          class="h-3 w-3 rounded-full bg-(--color-ink-600) ring-1 ring-white/10"
        />
        <span class="ml-1 font-mono text-[11px] uppercase tracking-wider text-(--color-text-muted)">
          {{ colors.length ? colors.join('').toUpperCase() : t('tile.colorless') }}
        </span>
      </div>

      <!-- footer row -->
      <div class="mt-5 flex items-center justify-between border-t border-(--color-border-subtle) pt-4">
        <span class="font-mono text-sm font-medium text-(--accent-text)">
          {{ cardCount }} <span class="text-(--color-text-muted)">{{ t('tile.cards') }}</span>
        </span>
        <span
          class="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          :class="sourceBadge.cls"
        >
          {{ sourceBadge.label }}
        </span>
      </div>

      <!-- hover "open" hint -->
      <span
        class="pointer-events-none absolute bottom-5 right-5 translate-x-2 font-mono text-xs text-(--accent-text) opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
      >
        {{ t('tile.open') }} →
      </span>
    </div>
  </div>
</template>
