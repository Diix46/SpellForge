<script setup lang="ts">
import type { LandingDeck } from '#shared/landing'

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
        <NuxtLink :to="d.path" class="deck" :class="`deck--${d.game}`">
          <span class="world">{{ d.game === 'optcg' ? 'One Piece' : 'Magic' }}</span>
          <strong class="name">{{ d.name }}</strong>
          <span class="meta">{{ t('home.showcase.by') }} {{ d.owner }} · {{ formatShortDate(d.updatedAt) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.showcase {
  padding: 90px clamp(20px, 5vw, 88px);
  background: #0e0b12;
  color: #1b1f22;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  max-width: 1180px;
  margin: 0 auto 34px;
}
.kicker {
  margin: 0 0 6px;
  color: #2d4f7c;
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
  color: #616a6f;
}
.all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border: 1px solid rgba(243, 236, 218, 0.35);
  border-radius: 999px;
  color: #1b1f22;
  font-size: 14px;
  text-decoration: none;
}
.all:hover {
  border-color: #1b1f22;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 18px;
  max-width: 1180px;
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
.deck:hover {
  transform: translateY(-4px);
}
.deck:focus-visible {
  outline: 2px solid #2d4f7c;
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
.deck--optcg {
  border: 1px solid rgba(58, 38, 22, 0.35);
  border-radius: 2px;
  background: linear-gradient(180deg, #fbf3e3, #efdfc0);
  color: #231708;
  rotate: -0.6deg;
}
.deck--optcg .world {
  font-family: 'Anton', Impact, sans-serif;
  color: #a4231d;
}
.deck--optcg .name {
  font-family: 'Anton', Impact, sans-serif;
  font-weight: 400;
  text-transform: uppercase;
}
.deck--optcg .meta {
  color: #6b5236;
}
.deck--mtg {
  border: 1px solid rgba(27, 31, 34, 0.14);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, #ffffff, #f2f3f0);
  color: #1b1f22;
}
.deck--mtg .world {
  font-family: var(--mtg-face);
  font-weight: 700;
  color: #2d4f7c;
}
.deck--mtg .name {
  font-family: var(--mtg-face);
}
.deck--mtg .meta {
  color: #616a6f;
}
</style>
