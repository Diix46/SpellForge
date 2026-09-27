<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed } from 'vue'
import { can, collectionPath, GAMES, libraryPath } from '#shared/game'
import { lookVars, WORLD_LOOK } from '~/utils/landing/looks'

// The account's worlds at a glance: each game's decks, copies, value and
// wishes, in its own colours; the favourite one marked, chosen with a tap;
// and the whole account as a file to keep.
interface GameSummary { game: GameId, decks: number, copies: number, wishes: number, value: number | null, valueDay: string | null }

const { t, locale } = useLocale()
const { favorite } = useFavoriteGame()
const { data, status } = useFetch<{ games: GameSummary[] }>('/api/account/summary', { server: false, default: () => ({ games: [] }) })

const games = computed(() => data.value?.games ?? [])
const totals = computed(() => games.value.reduce((a, g) => ({ decks: a.decks + g.decks, copies: a.copies + g.copies, value: a.value + (g.value ?? 0) }), { decks: 0, copies: 0, value: 0 }))
const fmt = (n: number) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US')
const money = (n: number) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
</script>

<template>
  <section class="dash">
    <header class="dash-head">
      <div>
        <h2>{{ t('account.worlds') }}</h2>
        <p class="help">
          {{ t('account.worldsHelp') }}
        </p>
      </div>
      <dl class="totals">
        <div>
          <dt>{{ t('account.totalDecks') }}</dt>
          <dd>{{ fmt(totals.decks) }}</dd>
        </div>
        <div>
          <dt>{{ t('account.totalCopies') }}</dt>
          <dd>{{ fmt(totals.copies) }}</dd>
        </div>
        <div>
          <dt>{{ t('account.totalValue') }}</dt>
          <dd>{{ money(totals.value) }}</dd>
        </div>
      </dl>
    </header>

    <div v-if="status === 'pending' && !games.length" class="loading" role="status">
      <UIcon name="i-lucide-loader-circle" class="h-6 w-6 animate-spin" />
    </div>
    <ul v-else class="worlds">
      <li v-for="g in games" :key="g.game" class="world" :class="{ fav: favorite === g.game }" :style="{ ...lookVars(g.game), '--swatch': GAMES[g.game].swatch }">
        <div class="world-top">
          <span class="world-name" :class="{ upper: WORLD_LOOK[g.game].upper }">{{ GAMES[g.game].label }}</span>
          <button
            type="button"
            class="star"
            :aria-pressed="favorite === g.game"
            :title="favorite === g.game ? t('account.favoriteOn') : t('account.favoriteSet')"
            :aria-label="favorite === g.game ? t('account.favoriteOn') : t('account.favoriteSet')"
            @click="favorite = favorite === g.game ? null : g.game"
          >
            <UIcon :name="favorite === g.game ? 'i-lucide-star' : 'i-lucide-star'" class="h-4 w-4" />
          </button>
        </div>
        <dl class="figures">
          <div>
            <dt>{{ t('account.decksOf') }}</dt>
            <dd>{{ fmt(g.decks) }}</dd>
          </div>
          <div>
            <dt>{{ t('account.copiesOf') }}</dt>
            <dd>{{ fmt(g.copies) }}</dd>
          </div>
          <div v-if="can(g.game, 'prices')">
            <dt>{{ t('account.valueOf') }}</dt>
            <dd>{{ g.value == null ? '—' : money(g.value) }}</dd>
          </div>
          <div>
            <dt>{{ t('account.wishesOf') }}</dt>
            <dd>{{ fmt(g.wishes) }}</dd>
          </div>
        </dl>
        <nav class="links">
          <NuxtLink :to="collectionPath(g.game)">
            {{ t('nav.collection') }}
          </NuxtLink>
          <NuxtLink :to="libraryPath(g.game)">
            {{ t('home.gallery.library') }}
          </NuxtLink>
        </nav>
      </li>
    </ul>

    <footer class="export">
      <p class="help">
        {{ t('account.exportHelp') }}
      </p>
      <UButton color="neutral" variant="subtle" icon="i-lucide-download" to="/api/account/export" external download>
        {{ t('account.export') }}
      </UButton>
    </footer>
  </section>
</template>

<style scoped>
.dash {
  display: grid;
  gap: 18px;
}
.dash-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px 24px;
}
.dash-head h2 {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-high);
}
.help {
  margin: 0;
  font-size: 13.5px;
  color: var(--color-text-muted);
}
.totals,
.figures {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  margin: 0;
}
.totals dt,
.figures dt {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.75;
}
.totals dd {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-high);
}
.loading {
  display: grid;
  place-items: center;
  padding: 30px;
  color: var(--color-text-muted);
}
.worlds {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.world {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--bg);
  color: var(--ink);
  box-shadow: inset 0 3px 0 var(--swatch);
}
.world.fav {
  box-shadow:
    inset 0 3px 0 var(--swatch),
    0 0 0 2px var(--swatch);
}
.world-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.world-name {
  font-family: var(--face);
  font-size: 22px;
  font-weight: var(--weight);
  line-height: 1;
}
.world-name.upper {
  text-transform: uppercase;
}
.star {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: var(--muted);
  cursor: pointer;
}
.star[aria-pressed='true'] {
  background: var(--accent);
  color: var(--on-accent);
}
.star:focus-visible {
  outline: 2px solid var(--swatch);
  outline-offset: 2px;
}
.figures {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
}
.figures dd {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.links {
  display: flex;
  gap: 14px;
  font-size: 13px;
}
.links a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.export {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
