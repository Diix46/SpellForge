<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed, ref } from 'vue'
import { can } from '#shared/game'

// "What am I missing?": a deck's cards the collection doesn't cover yet, how
// many of each, what they cost today, and the lot sent to the wishlist in one
// go. Each deck page hands its missing lines over (useDeckOwnership).
export interface MissingItem {
  key: string
  name: string
  image: string | null
  quantity: number
  /** One copy, in euros. */
  price: number | null
  /** As the collection names the printing. */
  printingId: string | null
}

const props = defineProps<{ game: GameId, items: MissingItem[] }>()
const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useLocale()
const toast = useToast()
const wishlist = useWishlist(props.game)
const priced = computed(() => can(props.game, 'prices'))
const copies = computed(() => props.items.reduce((n, i) => n + i.quantity, 0))
const total = computed(() => props.items.reduce((n, i) => n + (i.price ?? 0) * i.quantity, 0))
const unpriced = computed(() => props.items.filter(i => i.price == null).length)
const money = (n: number) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'EUR' })

const sending = ref(false)
async function toWishlist() {
  sending.value = true
  let added = 0
  for (const item of props.items.filter(i => i.printingId)) {
    // Any printing will do: the cheapest one is what the wishlist watches.
    if (await wishlist.add(item.printingId!, { anyPrinting: true, quantity: item.quantity, silent: true }))
      added++
  }
  sending.value = false
  toast.add({ title: t('missing.sent').replace('{n}', String(added)), color: 'success', icon: 'i-lucide-heart' })
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="t('missing.title')" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="missing">
        <p class="sum">
          <b>{{ copies }}</b> {{ t('missing.copies') }}
          <template v-if="priced">
            · <b>{{ money(total) }}</b> {{ t('missing.today') }}
            <span v-if="unpriced" class="note">{{ t('missing.unpriced').replace('{n}', String(unpriced)) }}</span>
          </template>
        </p>
        <ul class="list">
          <li v-for="i in items" :key="i.key" class="row">
            <img v-if="i.image" :src="i.image" alt="" loading="lazy">
            <span v-else class="ph" />
            <span class="name">{{ i.name }}</span>
            <span class="qty">×{{ i.quantity }}</span>
            <span v-if="priced" class="price">{{ i.price == null ? '—' : money(i.price * i.quantity) }}</span>
          </li>
        </ul>
      </div>
    </template>
    <template #footer>
      <div class="foot">
        <UButton color="neutral" variant="ghost" @click="open = false">
          {{ t('missing.close') }}
        </UButton>
        <UButton color="primary" icon="i-lucide-heart" :loading="sending" :disabled="!items.length" @click="toWishlist">
          {{ t('missing.toWishlist') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.missing {
  display: grid;
  gap: 12px;
}
.sum {
  margin: 0;
  color: var(--color-text-mid);
}
.sum b {
  color: var(--color-text-high);
}
.note {
  display: block;
  font-size: 12px;
  color: var(--color-text-muted);
}
.list {
  display: grid;
  gap: 4px;
  max-height: 55vh;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.row {
  display: grid;
  grid-template-columns: 36px 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 4px 6px;
  border-radius: 8px;
}
.row:hover {
  background: var(--color-surface-2);
}
.row img,
.ph {
  width: 36px;
  aspect-ratio: 63 / 88;
  border-radius: 3px;
  object-fit: cover;
  background: var(--color-surface-3);
}
.name {
  overflow: hidden;
  color: var(--color-text-high);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.qty {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.price {
  min-width: 70px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-high);
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}
</style>
