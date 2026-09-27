<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed } from 'vue'
import { GAMES, sharedPath } from '#shared/game'
import { lookVars, WORLD_LOOK } from '~/utils/landing/looks'

// A member's public profile, rendered by the server so it can be shared: the
// decks they listed in Discover, their showcase, their trade list and — if
// they opened it — what their collection is worth and its finest cards.
interface Shown { id: string, game: GameId, name: string, image: string | null, setName: string | null, set: string, number: string, finish: string, condition: string, lang: string, quantity: number, value: number | null }
interface Profile {
  name: string
  since: number
  decks: { name: string, game: GameId, shareId: string | null, updatedAt: string, likes: number }[]
  showcase: Shown[]
  trades: Shown[]
  collection: { game: GameId, copies: number, value: number, finest: Shown[] }[] | null
}

const route = useRoute()
const { t, locale, formatShortDate } = useLocale()
const id = computed(() => String(route.params.id))
const { data: profile, error } = await useFetch<Profile>(() => `/api/profile/${encodeURIComponent(id.value)}`)
// A private or unknown profile is the site's 404 page, with its status.
if (error.value?.statusCode === 404 || (!profile.value && !error.value))
  throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })

const money = (n: number, digits = 2) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: digits })
const total = computed(() => profile.value?.collection?.reduce((n, g) => n + g.value, 0) ?? 0)
const since = computed(() => (profile.value ? new Date(profile.value.since).toLocaleDateString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' }) : ''))

usePublicSeo({
  title: () => (profile.value ? `${profile.value.name} · ${t('profile.title')}` : t('profile.missing')),
  description: () => (profile.value ? t('profile.meta').replace('{name}', profile.value.name).replace('{decks}', String(profile.value.decks.length)).replace('{cards}', String(profile.value.showcase.length)) : ''),
  image: () => profile.value?.showcase[0]?.image ?? null,
  noindex: () => !profile.value,
})
</script>

<template>
  <div class="profile fade-up">
    <div v-if="!profile" class="missing">
      <UIcon name="i-lucide-user-x" class="h-10 w-10" />
      <p>{{ t('profile.missing') }}</p>
    </div>

    <template v-else>
      <header class="head">
        <span class="avatar">{{ profile.name.slice(0, 2).toUpperCase() }}</span>
        <div>
          <h1>{{ profile.name }}</h1>
          <p class="sub">
            {{ t('profile.since').replace('{date}', since) }}
            <template v-if="profile.collection">
              · <b>{{ money(total, 0) }}</b> {{ t('profile.collectionWorth') }}
            </template>
          </p>
        </div>
      </header>

      <section v-if="profile.showcase.length" class="block">
        <h2>{{ t('profile.showcase') }}</h2>
        <ul class="cards cards--big">
          <li v-for="c in profile.showcase" :key="c.id">
            <CollectionHoloCard :image="c.image" :name="c.name" :foil="c.finish !== 'nonfoil'" />
            <p class="cap">
              <b>{{ c.name }}</b>
              <span>{{ GAMES[c.game].label }} · {{ c.setName ?? c.set.toUpperCase() }}</span>
            </p>
          </li>
        </ul>
      </section>

      <section v-if="profile.decks.length" class="block">
        <h2>{{ t('profile.decks') }}</h2>
        <ul class="decks">
          <li v-for="d in profile.decks" :key="d.shareId ?? d.name">
            <NuxtLink v-if="d.shareId" :to="sharedPath(d.game, d.shareId)" class="deck" :style="{ ...lookVars(d.game), '--swatch': GAMES[d.game].swatch }">
              <span class="deck-game">{{ GAMES[d.game].label }}</span>
              <b class="deck-name" :class="{ upper: WORLD_LOOK[d.game].upper }">{{ d.name }}</b>
              <span class="deck-meta">
                <UIcon name="i-lucide-heart" class="h-3.5 w-3.5" /> {{ d.likes }} · {{ formatShortDate(new Date(d.updatedAt).getTime()) }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section v-if="profile.collection?.length" class="block">
        <h2>{{ t('profile.collection') }}</h2>
        <div v-for="g in profile.collection" :key="g.game" class="world">
          <p class="world-head" :style="{ '--swatch': GAMES[g.game].swatch }">
            <b>{{ GAMES[g.game].label }}</b> · {{ t('profile.copies').replace('{n}', String(g.copies)) }} · <b>{{ money(g.value, 0) }}</b>
          </p>
          <ul class="cards">
            <li v-for="c in g.finest" :key="c.id">
              <CollectionHoloCard :image="c.image" :name="c.name" :foil="c.finish !== 'nonfoil'" />
              <p class="cap">
                <b>{{ c.name }}</b>
                <span v-if="c.value != null">{{ money(c.value) }}</span>
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section v-if="profile.trades.length" class="block">
        <h2>{{ t('profile.trades') }}</h2>
        <p class="help">
          {{ t('profile.tradesHelp') }}
        </p>
        <ul class="trades">
          <li v-for="c in profile.trades" :key="c.id" class="trade">
            <img v-if="c.image" :src="c.image" alt="" loading="lazy">
            <span class="trade-name"><b>{{ c.name }}</b><span>{{ GAMES[c.game].label }} · {{ c.setName ?? c.set.toUpperCase() }} #{{ c.number }} · {{ c.lang.toUpperCase() }} · {{ c.condition }}<template v-if="c.finish !== 'nonfoil'"> · {{ c.finish }}</template></span></span>
            <span class="trade-qty">×{{ c.quantity }}</span>
            <span v-if="c.value != null" class="trade-price">{{ money(c.value) }}</span>
          </li>
        </ul>
      </section>

      <p v-if="!profile.showcase.length && !profile.decks.length && !profile.trades.length && !profile.collection?.length" class="empty">
        {{ t('profile.empty') }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.profile {
  display: grid;
  gap: 36px;
  max-width: 1320px;
  margin: 0 auto;
}
.missing,
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 0;
  color: var(--color-text-muted);
}
.head {
  display: flex;
  align-items: center;
  gap: 18px;
}
.avatar {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #c9312a, #e3b22b, #6b3fa0, #1f8a9a, #2d4f7c);
  color: #ffffff;
  font-size: 22px;
  font-weight: 800;
}
.head h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--color-text-high);
}
.sub {
  margin: 4px 0 0;
  color: var(--color-text-muted);
}
.sub b {
  color: var(--color-text-high);
}
.block {
  display: grid;
  gap: 16px;
}
.block h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-high);
}
.help {
  margin: -8px 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(150px, 42vw), 1fr));
  gap: var(--grid-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}
.cards--big {
  grid-template-columns: repeat(auto-fill, minmax(min(210px, 44vw), 1fr));
}
.cap {
  display: grid;
  gap: 1px;
  margin: 8px 0 0;
  font-size: 12.5px;
  color: var(--color-text-muted);
}
.cap b {
  overflow: hidden;
  color: var(--color-text-high);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.decks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.deck {
  display: grid;
  gap: 6px;
  padding: 16px;
  border-radius: 12px;
  background: var(--bg);
  color: var(--ink);
  text-decoration: none;
  box-shadow: inset 0 3px 0 var(--swatch);
}
.deck-game {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}
.deck-name {
  font-family: var(--face);
  font-size: 19px;
  font-weight: var(--weight);
}
.deck-name.upper {
  text-transform: uppercase;
}
.deck-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  color: var(--muted);
}
.world {
  display: grid;
  gap: 12px;
}
.world-head {
  margin: 0;
  padding-left: 10px;
  border-left: 3px solid var(--swatch);
  color: var(--color-text-mid);
}
.trades {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.trade {
  display: grid;
  grid-template-columns: 40px 1fr auto auto;
  align-items: center;
  gap: 14px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--color-surface-1);
}
.trade img {
  width: 40px;
  aspect-ratio: 63 / 88;
  border-radius: 3px;
  object-fit: cover;
}
.trade-name {
  display: grid;
  min-width: 0;
  font-size: 12.5px;
  color: var(--color-text-muted);
}
.trade-name b {
  overflow: hidden;
  color: var(--color-text-high);
  font-size: 14px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.trade-qty,
.trade-price {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-high);
}
</style>
