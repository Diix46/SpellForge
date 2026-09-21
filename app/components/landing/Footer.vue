<script setup lang="ts">
import { libraryPath } from '#shared/game'

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
      <NuxtLink :to="libraryPath('optcg')">
        One Piece
      </NuxtLink>
      <NuxtLink :to="libraryPath('mtg')">
        Magic
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
      <p>{{ t('footer.wotc') }}</p>
      <p>{{ t('footer.bandai') }}</p>
      <p>
        {{ t('footer.dataVia') }} <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>,
        <a href="https://github.com/buhbbl/punk-records" target="_blank" rel="noopener">punk-records</a>.
      </p>
    </div>
  </footer>
</template>

<style scoped>
.foot {
  --color-text-high: #f3ecda;
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 2fr;
  gap: 32px;
  padding: 56px clamp(20px, 5vw, 88px) calc(40px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(201, 162, 78, 0.2);
  background: #07060b;
  color: #b9ac8e;
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
  color: #f1d994;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.col a {
  color: #efe6d0;
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
