<script setup lang="ts">
import { GAME_IDS, GAME_LIST, libraryPath } from '#shared/game'

// Every source the card databases are built from, once each.
const SOURCES = [...new Map(GAME_LIST.flatMap(g => g.sources).map(s => [s.url, s])).values()]

const { t } = useLocale()
</script>

<template>
  <footer class="foot">
    <div class="brand">
      <AppLogo />
      <p>{{ t('home.foot.tagline') }}</p>
    </div>
    <nav class="col" :aria-label="t('home.foot.explore')">
      <h3>{{ t('home.foot.explore') }}</h3>
      <NuxtLink v-for="g in GAME_LIST" :key="g.id" :to="libraryPath(g.id)">
        {{ g.label }}
      </NuxtLink>
      <NuxtLink to="/discover">
        {{ t('nav.discover') }}
      </NuxtLink>
      <NuxtLink to="/decks">
        {{ t('home.nav.decks') }}
      </NuxtLink>
    </nav>
    <div class="col col--legal">
      <h3>{{ t('home.foot.legal') }}</h3>
      <p v-for="g in GAME_IDS" :key="g">
        {{ t(`footer.rights.${g}`) }}
      </p>
      <p>
        {{ t('footer.dataVia') }}
        <template v-for="(src, i) in SOURCES" :key="src.url">
          <a :href="src.url" target="_blank" rel="noopener">{{ src.label }}</a>{{ i < SOURCES.length - 1 ? ', ' : '.' }}
        </template>
      </p>
    </div>
  </footer>
</template>

<style scoped>
.foot {
  --color-text-high: var(--l-ink);
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 2fr;
  gap: 32px;
  padding: 56px var(--l-gutter) calc(40px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--l-line);
  background: var(--l-bg);
  color: var(--l-muted);
  font-size: 13px;
  line-height: 1.55;
}
.brand p {
  margin: 12px 0 0;
  max-width: 28ch;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.col h3 {
  margin: 0 0 6px;
  color: var(--l-ink);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.col a {
  color: var(--l-ink);
  text-decoration: none;
}
.col a:hover {
  text-decoration: underline;
}
.col--legal p {
  margin: 0;
}
@media (max-width: 800px) {
  .foot {
    grid-template-columns: 1fr;
  }
}
</style>
