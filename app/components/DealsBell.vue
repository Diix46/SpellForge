<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed, onMounted, ref } from 'vue'
import { collectionPath, GAMES } from '#shared/game'

// The price alerts, in the top bar for members: every wished card now at or
// under the price set for it, in any game. A dot marks those not seen yet —
// what was seen (a card at a price) is kept in this browser.
interface Deal { id: string, game: GameId, name: string, image: string | null, price: number, target: number }

const { t, locale } = useLocale()
const { data, refresh } = useFetch<{ deals: Deal[] }>('/api/collection/wishlist/deals', { server: false, default: () => ({ deals: [] }), lazy: true })
const deals = computed(() => data.value?.deals ?? [])

const SEEN_KEY = 'prism_deals_seen'
const seen = ref<Set<string>>(new Set())
const key = (d: Deal) => `${d.id}@${d.price}`
onMounted(() => {
  try {
    seen.value = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'))
  }
  catch {}
})
const fresh = computed(() => deals.value.filter(d => !seen.value.has(key(d))).length)

const open = ref(false)
function onOpen(v: boolean) {
  open.value = v
  if (!v)
    return
  void refresh()
  seen.value = new Set(deals.value.map(key))
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.value]))
  }
  catch {}
}

const money = (n: number) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'EUR' })
</script>

<template>
  <UPopover :open="open" :content="{ align: 'end', sideOffset: 8 }" @update:open="onOpen">
    <button type="button" class="icon-btn bell" :aria-label="t('deals.title')" :title="t('deals.title')">
      <UIcon name="i-lucide-bell" class="h-[18px] w-[18px]" />
      <span v-if="fresh" class="dot" aria-hidden="true">{{ fresh > 9 ? '9+' : fresh }}</span>
    </button>
    <template #content>
      <div class="panel">
        <p class="head">
          {{ t('deals.title') }}
        </p>
        <p v-if="!deals.length" class="empty">
          {{ t('deals.empty') }}
        </p>
        <ul v-else class="list">
          <li v-for="d in deals" :key="d.id">
            <NuxtLink :to="collectionPath(d.game, '/wishlist')" class="deal" @click="open = false">
              <img v-if="d.image" :src="d.image" alt="" loading="lazy">
              <span class="deal-body">
                <b>{{ d.name }}</b>
                <span class="deal-game" :style="{ color: GAMES[d.game].swatch }">{{ GAMES[d.game].label }}</span>
              </span>
              <span class="deal-price">
                <b>{{ money(d.price) }}</b>
                <small>≤ {{ money(d.target) }}</small>
              </span>
            </NuxtLink>
          </li>
        </ul>
        <p class="foot">
          {{ t('deals.help') }}
        </p>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.bell {
  position: relative;
}
.dot {
  position: absolute;
  top: 2px;
  right: 2px;
  display: grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #e0443a;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}
.panel {
  display: grid;
  gap: 10px;
  width: min(360px, 92vw);
  padding: 14px;
}
.head {
  margin: 0;
  font-weight: 700;
  color: var(--color-text-high);
}
.empty,
.foot {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
.list {
  display: grid;
  gap: 4px;
  max-height: 360px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.deal {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  border-radius: 8px;
  color: var(--color-text-high);
  text-decoration: none;
}
.deal:hover {
  background: var(--color-surface-2);
}
.deal img {
  width: 34px;
  aspect-ratio: 63 / 88;
  border-radius: 3px;
  object-fit: cover;
}
.deal-body {
  display: grid;
  flex: 1;
  min-width: 0;
}
.deal-body b {
  overflow: hidden;
  font-size: 13.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.deal-game {
  font-size: 11.5px;
}
.deal-price {
  display: grid;
  justify-items: end;
  font-variant-numeric: tabular-nums;
}
.deal-price b {
  color: var(--ui-success);
  font-size: 13.5px;
}
.deal-price small {
  color: var(--color-text-muted);
  font-size: 11px;
}
</style>
