<script setup lang="ts">
import { computed } from 'vue'
import { GAME_IDS, GAME_LIST, GAMES, libraryPath } from '#shared/game'

// The one footer, on every page (the home page included) and on the error
// page: the tagline, the data sources, and the rights — the game on screen's,
// or all five folded away. `compact`: the deck workspace, one screen tall.
defineProps<{ compact?: boolean }>()
const { universe } = useUniverse()
const { t } = useLocale()
const footerGames = computed(() => (universe.value ? [universe.value] : GAME_IDS))
const footerSources = computed(() => [...new Map(footerGames.value.flatMap(g => GAMES[g].sources).map(s => [s.url, s])).values()])
</script>

<template>
  <footer class="foot" :class="{ compact }">
    <div class="foot-inner">
      <div class="foot-brand">
        <AppLogo :wordmark="false" :size="20" />
        <span>{{ t(`footer.tagline.${universe ?? 'all'}`) }}</span>
      </div>
      <nav class="foot-links" :aria-label="t('home.foot.explore')">
        <NuxtLink v-for="g in GAME_LIST" :key="g.id" :to="libraryPath(g.id)">
          {{ g.label }}
        </NuxtLink>
        <NuxtLink to="/discover">
          {{ t('nav.discover') }}
        </NuxtLink>
      </nav>
      <p class="foot-sources">
        {{ t('footer.dataVia') }}
        <template v-for="(src, i) in footerSources" :key="src.url">
          <template v-if="i">
            ·
          </template>
          <a :href="src.url" target="_blank" rel="noopener">{{ src.label }}</a>
        </template>
      </p>
    </div>
    <!-- The rights: the game on screen's, or all five folded away. -->
    <p v-if="footerGames.length === 1" class="foot-legal">
      {{ t(`footer.rights.${footerGames[0]}`) }}
    </p>
    <details v-else class="foot-legal">
      <summary>{{ t('footer.legal') }}</summary>
      <p v-for="g in footerGames" :key="g">
        {{ t(`footer.rights.${g}`) }}
      </p>
    </details>
  </footer>
</template>

<style scoped>
/* ---------- Footer ---------- */
.foot {
  position: relative;
  border-top: 1px solid var(--color-border-hairline);
  /* Over a universe's backdrop (the meadow's grass, the sea) it keeps its own ground. */
  background: color-mix(in srgb, var(--color-bg-base) 90%, transparent);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.foot-inner {
  max-width: var(--shell-max);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--gutter);
  font-size: 13px;
  color: var(--color-text-muted);
}
.foot-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.foot-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}
.foot-sources {
  margin: 0;
}
.foot-legal {
  max-width: var(--shell-max);
  margin: 0 auto;
  padding: 0 var(--gutter) var(--space-3);
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.55;
}
.foot-legal summary {
  width: fit-content;
  cursor: pointer;
}
.foot-legal summary:hover {
  color: var(--color-text-high);
}
.foot-legal p {
  margin: 6px 0 0;
  max-width: 110ch;
}
.foot a {
  color: var(--color-text-mid);
  text-decoration: none;
  text-underline-offset: 2px;
}
.foot a:hover {
  color: var(--color-text-high);
  text-decoration: underline;
}

@media (min-width: 768px) {
  .foot-inner {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.foot.compact {
  flex-shrink: 0;
}
.foot.compact .foot-links {
  display: none;
}
.foot.compact .foot-inner {
  padding-top: 12px;
  padding-bottom: 12px;
}
.foot.compact .foot-legal {
  padding-bottom: 12px;
}
</style>
