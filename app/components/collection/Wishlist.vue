<script setup lang="ts">
import type { WishItem } from '#shared/collection'
import type { GameId } from '#shared/game'
import { computed, onMounted, ref } from 'vue'
import { wishReached } from '#shared/collection'

// The cards the member is after: what each costs today against the price
// they set, the ones that came down to it first, a list to shop with, and a
// click to put a card found into the collection.
const props = defineProps<{ game: GameId }>()

const { t, locale } = useLocale()
const toast = useToast()
const wishlist = useWishlist(props.game)
const { openAdd } = useCollectionAdd()
onMounted(() => void wishlist.load())

const loc = computed(() => (locale.value === 'fr' ? 'fr-FR' : 'en-US'))
const money = (n: number) => n.toLocaleString(loc.value, { style: 'currency', currency: 'EUR' })
const priced = computed(() => props.game === 'mtg')

type Sort = 'reached' | 'recent' | 'price' | 'name'
const sort = ref<Sort>('reached')
const sortItems = computed(() => [
  { label: t('collection.wish.sortReached'), value: 'reached' },
  { label: t('collection.sortRecent'), value: 'recent' },
  ...(priced.value ? [{ label: t('collection.wish.sortPrice'), value: 'price' }] : []),
  { label: t('collection.sortName'), value: 'name' },
])
const nameOf = (w: WishItem) => w.card?.printedName ?? w.card?.name ?? '?'
const shown = computed(() => {
  const list = [...wishlist.items.value]
  if (sort.value === 'name')
    return list.sort((a, b) => nameOf(a).localeCompare(nameOf(b), locale.value))
  if (sort.value === 'price')
    return list.sort((a, b) => (b.price ?? -1) - (a.price ?? -1))
  if (sort.value === 'reached')
    return list.sort((a, b) => Number(wishReached(b)) - Number(wishReached(a)) || b.createdAt - a.createdAt)
  return list
})
const total = computed(() => wishlist.items.value.reduce((n, w) => n + (w.price ?? 0) * w.quantity, 0))

function setTarget(w: WishItem, e: Event) {
  const raw = (e.target as HTMLInputElement).value.replace(',', '.').trim()
  const next = raw === '' ? null : Number(raw)
  if (next !== null && (!Number.isFinite(next) || next < 0))
    return
  if (next !== w.targetPrice)
    void wishlist.update(w.id, { targetPrice: next })
}
function found(w: WishItem) {
  openAdd({ query: props.game === 'mtg' ? w.card?.name ?? '' : w.card?.number ?? '', printing: w.printingId })
}

/** The wishlist as a shopping list (Cardmarket's wants list reads it). */
async function copyList() {
  const lines = wishlist.items.value.filter(w => w.card).map(w => props.game === 'optcg'
    ? `${w.quantity}x ${w.card!.number}`
    : w.anyPrinting ? `${w.quantity} ${w.card!.name}` : `${w.quantity} ${w.card!.name} (${w.card!.set.toUpperCase()}) ${w.card!.number}`)
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    toast.add({ title: t('collection.wish.copied').replace('{n}', String(lines.length)), color: 'success', icon: 'i-lucide-clipboard-check' })
  }
  catch {
    toast.add({ title: t('collection.copyFailed'), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <div class="wishlist">
    <div v-if="!wishlist.loaded.value" class="state" role="status">
      <UIcon name="i-lucide-loader-circle" class="h-7 w-7 animate-spin" />
    </div>

    <section v-else-if="!wishlist.items.value.length" class="empty">
      <div class="empty-art" aria-hidden="true">
        <UIcon name="i-lucide-heart" class="h-8 w-8" />
      </div>
      <h2>{{ t('collection.wish.emptyTitle') }}</h2>
      <p>{{ t(`collection.wish.emptyBody.${game}`) }}</p>
      <UButton color="neutral" variant="subtle" icon="i-lucide-library-big" :to="collectionPath(game)">
        {{ t('collection.wish.browseSets') }}
      </UButton>
    </section>

    <template v-else>
      <section class="summary">
        <div>
          <p class="label">
            {{ t('collection.tabWishlist') }}
          </p>
          <p class="big">
            {{ wishlist.items.value.length }} <small>{{ t('collection.cards') }}</small>
          </p>
        </div>
        <div v-if="priced">
          <p class="label">
            {{ t('collection.wish.total') }}
          </p>
          <p class="mid">
            {{ money(total) }}
          </p>
        </div>
        <div v-if="priced" class="reached-box" :class="{ on: wishlist.reached.value.length }">
          <UIcon name="i-lucide-bell-ring" class="h-5 w-5" />
          <span>{{ t('collection.wish.reachedCount').replace('{n}', String(wishlist.reached.value.length)) }}</span>
        </div>
      </section>

      <div class="toolbar">
        <USelect v-model="sort" :items="sortItems" icon="i-lucide-arrow-down-wide-narrow" class="w-52" />
        <UButton class="ml-auto" color="neutral" variant="subtle" icon="i-lucide-clipboard-list" @click="copyList">
          {{ t('collection.wish.copy') }}
        </UButton>
      </div>

      <TransitionGroup tag="ul" name="wish" class="list">
        <li v-for="w in shown" :key="w.id" class="wish" :class="{ 'is-reached': wishReached(w) }">
          <img v-if="w.card" :src="w.card.thumb" alt="" class="thumb" loading="lazy">
          <span v-else class="thumb" />
          <div class="info">
            <p class="name">
              {{ nameOf(w) }}
              <span v-if="wishReached(w)" class="pill"><UIcon name="i-lucide-bell-ring" class="h-3 w-3" /> {{ t('collection.wish.reached') }}</span>
            </p>
            <p class="meta">
              <template v-if="w.anyPrinting">
                {{ t('collection.wish.anyPrinting') }}
              </template>
              <template v-else-if="w.card">
                {{ w.card.set.toUpperCase() }} #{{ w.card.number }} · {{ w.card.lang.toUpperCase() }}
              </template>
              <template v-if="w.finish !== 'nonfoil'">
                · {{ t(`collection.finish.${w.finish}`) }}
              </template>
              <span v-if="w.owned" class="owned">· {{ t('collection.wish.owned').replace('{n}', String(w.owned)) }}</span>
            </p>
          </div>
          <label class="field">
            <span>{{ t('collection.quantity') }}</span>
            <UInputNumber :model-value="w.quantity" :min="1" :max="99" size="sm" class="w-24" @update:model-value="(q: number | null) => q && wishlist.update(w.id, { quantity: q })" />
          </label>
          <template v-if="priced">
            <div class="price">
              <span>{{ t('collection.wish.now') }}</span>
              <b>{{ w.price == null ? '—' : money(w.price) }}</b>
            </div>
            <label class="field">
              <span>{{ t('collection.wish.target') }}</span>
              <UInput :model-value="w.targetPrice == null ? '' : String(w.targetPrice)" inputmode="decimal" size="sm" class="w-24" placeholder="—" @change="setTarget(w, $event)">
                <template #trailing>
                  €
                </template>
              </UInput>
            </label>
          </template>
          <div class="acts">
            <UButton size="sm" icon="i-lucide-gem" color="neutral" variant="subtle" :title="t('collection.wish.found')" @click="found(w)">
              <span class="hidden lg:inline">{{ t('collection.wish.found') }}</span>
            </UButton>
            <UButton size="sm" icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="t('collection.wish.remove')" @click="wishlist.remove(w.id)" />
          </div>
        </li>
      </TransitionGroup>
    </template>
  </div>
</template>

<style scoped>
.wishlist {
  display: grid;
  gap: 16px;
}
.state {
  display: grid;
  place-items: center;
  padding: 48px 0;
  color: var(--color-text-muted);
}
.empty {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 40px 24px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: var(--color-surface-1);
  text-align: center;
  color: var(--color-text-mid);
}
.empty h2 {
  margin: 4px 0 0;
  font-size: 20px;
  color: var(--color-text-high);
}
.empty p {
  max-width: 52ch;
  margin: 0 0 6px;
  line-height: 1.55;
}
.empty-art {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(226, 72, 110, 0.12);
  color: #d63b66;
}
.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 36px;
  padding: 18px 22px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: radial-gradient(400px 150px at 100% 0%, rgba(226, 72, 110, 0.1), transparent 70%), var(--color-surface-1);
}
.label {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.big {
  margin: 4px 0 0;
  font-family: var(--font-mono);
  font-size: 30px;
  font-weight: 600;
  color: var(--color-text-high);
}
.big small {
  font-size: 14px;
  color: var(--color-text-muted);
}
.mid {
  margin: 6px 0 0;
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text-high);
}
.reached-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--color-surface-2);
  font-size: 13px;
  color: var(--color-text-muted);
}
.reached-box.on {
  background: rgba(46, 160, 98, 0.14);
  color: #23945a;
  font-weight: 600;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.wish {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface-1);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.wish.is-reached {
  border-color: rgba(46, 160, 98, 0.55);
  box-shadow: 0 0 0 3px rgba(46, 160, 98, 0.1);
}
.thumb {
  flex: 0 0 auto;
  width: 40px;
  height: 56px;
  border-radius: 4px;
  object-fit: cover;
  background: var(--color-surface-2);
}
.info {
  flex: 1 1 200px;
  min-width: 0;
}
.name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-high);
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  background: #23945a;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  animation: glow 2s ease-in-out infinite;
}
@keyframes glow {
  50% {
    box-shadow: 0 0 10px rgba(46, 160, 98, 0.6);
  }
}
.meta {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}
.owned {
  color: #23945a;
}
.field {
  display: grid;
  gap: 2px;
  font-size: 11px;
  color: var(--color-text-muted);
}
.price {
  display: grid;
  gap: 2px;
  min-width: 70px;
  font-size: 11px;
  color: var(--color-text-muted);
}
.price b {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--color-text-high);
}
.acts {
  display: flex;
  gap: 4px;
}
.wish-enter-from,
.wish-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
.wish-enter-active,
.wish-leave-active {
  transition: all 0.25s ease;
}
.wish-move {
  transition: transform 0.3s ease;
}
</style>
