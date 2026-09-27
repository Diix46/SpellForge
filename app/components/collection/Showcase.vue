<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed, ref } from 'vue'
import { can, collectionPath } from '#shared/game'

// A collection shown off: what it is worth (and how that moved in a month),
// its finest cards — the dearest copies, each catching the light — and the
// showcase, cards the member picks with a star, shown on their public
// profile. The profile's switch is here too.
interface Shown { id: string, name: string, image: string | null, setName: string | null, set: string, number: string, rarity: string | null, finish: string, value: number | null, quantity: number }
interface Highlights { value: number, before: { value: number, day: string } | null, copies: number, finest: Shown[], showcase: Shown[] }

const props = defineProps<{ game: GameId }>()
const { t, locale } = useLocale()
const toast = useToast()
const collection = useCollection(props.game)
const { data, refresh, status } = useFetch<Highlights>('/api/collection/highlights', { query: { game: props.game }, server: false })
const { data: summary, refresh: refreshProfile } = useFetch<{ profile: { id: string | null, public: boolean, collectionPublic: boolean } }>('/api/account/summary', { server: false })
const profile = computed(() => summary.value?.profile ?? null)

const priced = computed(() => can(props.game, 'prices'))
const money = (n: number, digits = 2) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: digits })
const change = computed(() => {
  const h = data.value
  if (!h?.before || h.before.value <= 0)
    return null
  const diff = h.value - h.before.value
  return { diff, pct: (diff / h.before.value) * 100 }
})
const featured = computed(() => new Set((data.value?.showcase ?? []).map(c => c.id)))

const busy = ref<string | null>(null)
/** In or out of the showcase: last in, last shown. */
async function toggle(c: Shown) {
  busy.value = c.id
  const next = featured.value.has(c.id) ? 0 : (data.value?.showcase.length ?? 0) + 1
  const ok = await collection.update(c.id, { featured: next })
  busy.value = null
  if (ok)
    await refresh()
}

async function setProfile(patch: { profilePublic?: boolean, collectionPublic?: boolean }) {
  await $fetch('/api/account/profile', { method: 'PATCH', body: patch })
  await refreshProfile()
}
const profileUrl = computed(() => (profile.value?.id && import.meta.client ? `${location.origin}/joueur/${profile.value.id}` : ''))
async function copyProfile() {
  await navigator.clipboard.writeText(profileUrl.value)
  toast.add({ title: t('showcase.linkCopied'), color: 'success', icon: 'i-lucide-link' })
}
</script>

<template>
  <div class="showcase">
    <section v-if="priced" class="worth">
      <p class="kicker">
        {{ t('showcase.worth') }}
      </p>
      <p class="value">
        {{ data ? money(data.value, 0) : '…' }}
      </p>
      <p class="meta">
        <template v-if="data">
          {{ t('showcase.copies').replace('{n}', data.copies.toLocaleString(locale)) }}
        </template>
        <span v-if="change" class="change" :class="change.diff >= 0 ? 'up' : 'down'">
          <UIcon :name="change.diff >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'" class="h-4 w-4" />
          {{ change.diff >= 0 ? '+' : '' }}{{ money(change.diff, 0) }} ({{ change.pct.toFixed(1) }} %) {{ t('showcase.month') }}
        </span>
      </p>
    </section>

    <section class="block">
      <header class="block-head">
        <h2>{{ t('showcase.finest') }}</h2>
        <p>{{ t('showcase.finestHelp') }}</p>
      </header>
      <div v-if="status === 'pending' && !data" class="state">
        <UIcon name="i-lucide-loader-circle" class="h-6 w-6 animate-spin" />
      </div>
      <p v-else-if="!data?.finest.length" class="state">
        {{ t('showcase.empty') }}
        <NuxtLink :to="collectionPath(game)">
          {{ t('showcase.emptyLink') }}
        </NuxtLink>
      </p>
      <ul v-else class="grid">
        <li v-for="(c, i) in data.finest" :key="c.id" class="item">
          <span class="rank">#{{ i + 1 }}</span>
          <CollectionHoloCard :image="c.image" :name="c.name" :foil="c.finish !== 'nonfoil'" />
          <div class="caption">
            <b>{{ c.name }}</b>
            <span>{{ c.setName ?? c.set.toUpperCase() }} · {{ c.number }}</span>
            <span v-if="c.value != null" class="price">{{ money(c.value) }}<template v-if="c.quantity > 1"> ×{{ c.quantity }}</template></span>
          </div>
          <button
            type="button"
            class="star"
            :aria-pressed="featured.has(c.id)"
            :disabled="busy === c.id"
            :title="featured.has(c.id) ? t('showcase.unfeature') : t('showcase.feature')"
            :aria-label="featured.has(c.id) ? t('showcase.unfeature') : t('showcase.feature')"
            @click="toggle(c)"
          >
            <UIcon name="i-lucide-star" class="h-4 w-4" />
          </button>
        </li>
      </ul>
    </section>

    <section class="block">
      <header class="block-head">
        <h2>{{ t('showcase.title') }}</h2>
        <p>{{ t('showcase.help') }}</p>
      </header>
      <ul v-if="data?.showcase.length" class="grid grid--show">
        <li v-for="c in data.showcase" :key="c.id" class="item">
          <CollectionHoloCard :image="c.image" :name="c.name" :foil="c.finish !== 'nonfoil'" />
          <button type="button" class="star" aria-pressed="true" :title="t('showcase.unfeature')" :aria-label="t('showcase.unfeature')" @click="toggle(c)">
            <UIcon name="i-lucide-star" class="h-4 w-4" />
          </button>
        </li>
      </ul>
      <p v-else class="state">
        {{ t('showcase.none') }}
      </p>

      <div class="profile">
        <USwitch :model-value="profile?.public ?? false" :label="t('showcase.profilePublic')" @update:model-value="setProfile({ profilePublic: $event })" />
        <USwitch v-if="profile?.public" :model-value="profile?.collectionPublic ?? false" :label="t('showcase.collectionPublic')" @update:model-value="setProfile({ collectionPublic: $event })" />
        <div v-if="profile?.public && profile.id" class="profile-link">
          <NuxtLink :to="`/joueur/${profile.id}`" target="_blank">
            {{ t('showcase.seeProfile') }}
          </NuxtLink>
          <UButton size="sm" color="neutral" variant="subtle" icon="i-lucide-link" @click="copyProfile">
            {{ t('showcase.copyLink') }}
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.showcase {
  display: grid;
  gap: 28px;
}
.worth {
  padding: 28px;
  border-radius: var(--radius-xl);
  background:
    radial-gradient(80% 120% at 100% 0%, color-mix(in srgb, rgb(var(--accent-rgb)) 22%, transparent), transparent 60%),
    var(--color-surface-1);
  border: 1px solid var(--color-border-subtle);
}
.kicker {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.value {
  margin: 4px 0 6px;
  font-size: clamp(40px, 6vw, 64px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-high);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin: 0;
  color: var(--color-text-mid);
}
.change {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}
.change.up {
  color: var(--ui-success);
}
.change.down {
  color: var(--ui-error);
}
.block {
  display: grid;
  gap: 16px;
}
.block-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-high);
}
.block-head p {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
}
.state {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  padding: 30px;
  color: var(--color-text-muted);
}
.state a {
  color: var(--accent-text);
  text-decoration: underline;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(170px, 42vw), 1fr));
  gap: var(--grid-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}
.grid--show {
  grid-template-columns: repeat(auto-fill, minmax(min(200px, 44vw), 1fr));
}
.item {
  position: relative;
  display: grid;
  gap: 8px;
}
.rank {
  position: absolute;
  z-index: 2;
  top: -8px;
  left: -8px;
  display: grid;
  place-items: center;
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-text-high);
  color: var(--color-bg-base);
  font-size: 12px;
  font-weight: 800;
}
.caption {
  display: grid;
  gap: 1px;
  min-width: 0;
  font-size: 12.5px;
  color: var(--color-text-muted);
}
.caption b {
  overflow: hidden;
  color: var(--color-text-high);
  font-size: 13.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.price {
  color: var(--color-text-high);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.star {
  position: absolute;
  z-index: 2;
  top: 8px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(10, 10, 14, 0.6);
  color: #ffffff;
  cursor: pointer;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}
.star[aria-pressed='true'] {
  background: #f0c43a;
  color: #1b1405;
}
.star:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}
.profile {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
  padding: 16px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
}
.profile-link {
  display: flex;
  align-items: center;
  gap: 10px;
}
.profile-link a {
  color: var(--accent-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
