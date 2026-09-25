<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed, onBeforeUnmount, ref } from 'vue'
import { libraryPath } from '#shared/game'

// The game picker beside the logo: the game on screen ("Magic ▾"), and every
// game one click away, each in its own colours with the decks it holds. A list,
// not a row of buttons, so a tenth game costs the header nothing. Opens on
// click (touch, keyboard) and, with a mouse, on hover.
const { t } = useLocale()
const { universe } = useUniverse()
const { decks } = useDeckStore()

interface GameEntry { id: GameId, label: string, swatch: string }
const GAMES: GameEntry[] = [
  { id: 'optcg', label: 'One Piece', swatch: '#c9312a' },
  { id: 'mtg', label: 'Magic', swatch: '#2d4f7c' },
]
const current = computed(() => GAMES.find(g => g.id === universe.value) ?? null)
const counts = computed(() => {
  const n: Partial<Record<GameId, number>> = {}
  for (const d of decks.value)
    n[d.game] = (n[d.game] ?? 0) + 1
  return n
})

const open = ref(false)
// Hover: open at once, close a moment after the pointer leaves both the
// trigger and the list (the list is portalled, so both are watched). While the
// pointer is on them a click does not close what the hover opened.
let closing: ReturnType<typeof setTimeout> | undefined
const fine = import.meta.client && window.matchMedia('(hover: hover) and (pointer: fine)').matches
const hovering = ref(false)
const shown = computed({
  get: () => open.value,
  set: (v: boolean) => {
    if (!v && hovering.value)
      return
    open.value = v
  },
})
function enter() {
  if (!fine)
    return
  clearTimeout(closing)
  hovering.value = true
  open.value = true
}
function leave() {
  if (!fine)
    return
  clearTimeout(closing)
  closing = setTimeout(() => {
    hovering.value = false
    open.value = false
  }, 180)
}
// Opened by the pointer, the list does not take the focus (a keyboard or a
// tap still lands in it).
const content = computed(() => ({
  align: 'start' as const,
  sideOffset: 8,
  onOpenAutoFocus: (e: Event) => {
    if (hovering.value)
      e.preventDefault()
  },
}))
onBeforeUnmount(() => clearTimeout(closing))
</script>

<template>
  <UPopover v-model:open="shown" :content="content">
    <button
      type="button"
      class="switch"
      :aria-label="t('nav.chooseGame')"
      @mouseenter="enter"
      @mouseleave="leave"
    >
      <span class="slash" aria-hidden="true">/</span>
      <span v-if="current" class="name" :class="`name--${current.id}`">{{ current.label }}</span>
      <span v-else class="name">{{ t('nav.games') }}</span>
      <UIcon name="i-lucide-chevron-down" class="chev" :class="{ up: open }" />
    </button>

    <template #content>
      <nav class="games" :aria-label="t('nav.games')" @mouseenter="enter" @mouseleave="leave">
        <NuxtLink
          v-for="g in GAMES"
          :key="g.id"
          :to="libraryPath(g.id)"
          class="game"
          :aria-current="universe === g.id ? 'page' : undefined"
          @click="hovering = false; open = false"
        >
          <span class="swatch" :style="{ background: g.swatch }" aria-hidden="true" />
          <span class="game-name" :class="`name--${g.id}`">{{ g.label }}</span>
          <span v-if="counts[g.id]" class="game-count">{{ t('account.decks').replace('{n}', String(counts[g.id])) }}</span>
          <UIcon v-if="universe === g.id" name="i-lucide-check" class="game-check" />
        </NuxtLink>
      </nav>
    </template>
  </UPopover>
</template>

<style scoped>
.switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 2px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  color: var(--color-text-high);
  font-size: 14px;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-out);
}
.switch:hover,
.switch[data-state='open'] {
  background: var(--color-surface-2);
}
.slash {
  color: var(--color-text-disabled);
  font-weight: 300;
}
.chev {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  transition: rotate var(--dur-fast) var(--ease-out);
}
.chev.up {
  rotate: 180deg;
}
/* Each game in its own voice. */
.name--optcg {
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.name--mtg {
  font-family: var(--mtg-face);
  font-weight: 700;
  letter-spacing: 0.04em;
}
.games {
  display: grid;
  gap: 2px;
  min-width: 230px;
  padding: 6px;
}
.game {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  color: var(--color-text-high);
  text-decoration: none;
  transition: background var(--dur-fast) var(--ease-out);
}
.game:hover,
.game:focus-visible {
  background: var(--color-surface-2);
}
.game[aria-current='page'] {
  background: var(--accent-soft);
}
.swatch {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 50%;
  box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 12%, transparent);
}
.game-name {
  font-size: 14px;
}
.game-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-muted);
}
.game-check {
  width: 15px;
  height: 15px;
  color: var(--accent-text);
}
.game-count + .game-check {
  margin-left: 4px;
}
.game-name + .game-check {
  margin-left: auto;
}
</style>
