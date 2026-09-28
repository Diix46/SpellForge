<script setup lang="ts">
import type { LandingDeck } from '#shared/landing'
import { GAMES } from '#shared/game'
import { lookVars, WORLD_LOOK } from '~/utils/landing/looks'

// The latest decks listed in Discover, each dressed as its world. The page
// hides the section while nobody has published anything.
defineProps<{ decks: LandingDeck[] }>()

const { t, formatShortDate } = useLocale()
</script>

<template>
  <section class="showcase">
    <header class="head">
      <div>
        <p class="kicker">
          {{ t('home.showcase.kicker') }}
        </p>
        <h2 class="title">
          {{ t('home.showcase.title') }}
        </h2>
        <p class="sub">
          {{ t('home.showcase.sub') }}
        </p>
      </div>
      <NuxtLink to="/discover" class="all">
        {{ t('home.showcase.all') }}
        <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
      </NuxtLink>
    </header>
    <ul class="grid">
      <li v-for="d in decks" :key="d.path">
        <NuxtLink :to="d.path" class="deck" :style="{ ...lookVars(d.game), '--swatch': GAMES[d.game].swatch }">
          <span class="world">{{ GAMES[d.game].label }}</span>
          <strong class="name" :class="{ upper: WORLD_LOOK[d.game].upper }">{{ d.name }}</strong>
          <span class="meta">{{ t('home.showcase.by') }} {{ d.owner }} · {{ formatShortDate(d.updatedAt) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.showcase {
  padding: var(--l-section) var(--l-gutter);
  background: var(--l-bg);
  color: var(--l-ink);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  max-width: var(--l-width);
  margin: 0 auto var(--l-head-gap);
}
.kicker {
  margin: 0 0 6px;
  color: var(--l-muted);
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}
.title {
  margin: 0;
  font-size: clamp(28px, 3vw, 42px);
  font-weight: 700;
}
.sub {
  margin: 6px 0 0;
  color: var(--l-muted);
}
.all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border: 1px solid var(--l-line-strong);
  border-radius: 999px;
  color: var(--l-ink);
  font-size: 14px;
  text-decoration: none;
}
.all:hover {
  border-color: var(--l-ink);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 18px;
  max-width: var(--l-width);
  margin: 0 auto;
  padding: 0;
  list-style: none;
}
.deck {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 18px;
  text-decoration: none;
  transition: transform 0.35s cubic-bezier(0.3, 1.5, 0.5, 1);
}
.deck:focus-visible {
  outline: 2px solid var(--swatch);
  outline-offset: 3px;
}
.world {
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.name {
  overflow: hidden;
  font-size: 20px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 12.5px;
}
.deck {
  border-top: 3px solid var(--swatch);
  border-radius: 12px;
  background: var(--bg);
  color: var(--ink);
  box-shadow: 0 20px 40px -26px rgba(0, 0, 0, 0.6);
}
.world {
  font-family: var(--face);
  font-weight: var(--weight);
  color: var(--accent);
}
.name {
  font-family: var(--face);
  font-weight: var(--weight);
}
.name.upper {
  text-transform: uppercase;
}
.meta {
  color: var(--muted);
}
.deck:hover {
  box-shadow:
    inset 0 3px 0 var(--swatch),
    0 0 0 2px color-mix(in srgb, var(--swatch) 60%, transparent);
}
</style>
