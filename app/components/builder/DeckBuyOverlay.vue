<script setup lang="ts">
import type { BuyLang } from '~/composables/useCardmarket'
import type { BuyRow } from '~/composables/useDeckBuy'
import { useLocale } from '~/composables/useLocale'

// Buy / checkout overlay (centered modal): cost summary, one-step "buy the whole
// deck" + per-card Cardmarket list. A terminal transaction launched from the deck
// toolbar. Pure presentation — all data/handlers come from the page via props.

defineProps<{
  open: boolean
  buyRows: BuyRow[]
  buySummary: { total: number, missing: number, avg: number }
  buyLang: BuyLang
  /** Loading state (mirrors the deck's background resolve). */
  loading: boolean
  fetchProgress: { loaded: number, total: number }
  fmtEur: (n: number) => string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:buyLang': [value: BuyLang]
  'buyWholeDeck': []
  'copyWants': []
  'openAll': []
}>()

const { t } = useLocale()
</script>

<template>
  <Teleport to="body">
    <Transition name="ovl-fade">
      <div v-if="open" class="ovl-root ovl-root--center">
        <div class="ovl-scrim" @click="emit('update:open', false)" />
        <section class="ovl-modal" role="dialog" aria-modal="true" :aria-label="t('tab.buy')">
          <header class="ovl-head">
            <div class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[2px] text-(--accent-text)">
              <UIcon name="i-lucide-shopping-cart" class="h-4 w-4" />
              {{ t('tab.buy') }}
            </div>
            <button
              type="button"
              class="grid h-8 w-8 place-items-center rounded-full text-(--color-text-muted) transition-colors hover:bg-(--color-surface-2) hover:text-(--color-text-high)"
              :aria-label="t('modal.cancel')"
              @click="emit('update:open', false)"
            >
              <UIcon name="i-lucide-x" class="h-4.5 w-4.5" />
            </button>
          </header>
          <div class="ovl-body space-y-5">
            <!-- Loading -->
            <div
              v-if="loading"
              class="glass flex items-center justify-center gap-3 rounded-[var(--radius-xl)] py-12"
            >
              <UIcon name="i-lucide-loader-circle" class="h-6 w-6 animate-spin text-(--accent-text)" />
              <span class="font-mono text-sm text-(--color-text-muted)">{{ fetchProgress.loaded }} / {{ fetchProgress.total }}</span>
            </div>

            <template v-else>
              <!-- Cost summary -->
              <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div class="glass-solid rounded-[var(--radius-xl)] p-4">
                  <div class="mb-1 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
                    {{ t('buy.estTotal') }}
                  </div>
                  <div class="font-display text-2xl font-bold text-(--accent-text)">
                    {{ fmtEur(buySummary.total) }}
                  </div>
                </div>
                <div class="glass-solid rounded-[var(--radius-xl)] p-4">
                  <div class="mb-1 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
                    {{ t('buy.avgPerCard') }}
                  </div>
                  <div class="font-display text-2xl font-bold text-(--color-text-high)">
                    {{ fmtEur(buySummary.avg) }}
                  </div>
                </div>
                <div class="glass-solid rounded-[var(--radius-xl)] p-4">
                  <div class="mb-1 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
                    {{ t('buy.uniqueCards') }}
                  </div>
                  <div class="font-display text-2xl font-bold text-(--color-text-high)">
                    {{ buyRows.length }}
                  </div>
                </div>
                <div class="glass-solid rounded-[var(--radius-xl)] p-4">
                  <div class="mb-1 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
                    {{ t('buy.noPrice') }}
                  </div>
                  <div
                    class="font-display text-2xl font-bold"
                    :class="buySummary.missing ? 'text-(--color-warning)' : 'text-(--color-text-high)'"
                  >
                    {{ buySummary.missing }}
                  </div>
                </div>
              </div>

              <!-- One-step buy the whole deck -->
              <div class="glass rounded-[var(--radius-xl)] p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div class="min-w-0">
                    <div class="font-display font-semibold text-(--color-text-high)">
                      {{ t('buy.wholeDeckTitle') }}
                    </div>
                    <p class="mt-0.5 text-sm text-(--color-text-mid)">
                      {{ t('buy.wholeDeckHint') }}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-3">
                    <!-- Cardmarket marketplace language -->
                    <div
                      class="flex items-center overflow-hidden rounded-[var(--radius-md)] border border-(--color-border-strong)"
                      role="group"
                      :aria-label="t('buy.langLabel')"
                    >
                      <button
                        v-for="opt in (['fr', 'en'] as const)"
                        :key="opt"
                        type="button"
                        class="px-2.5 py-1.5 font-mono text-xs font-semibold uppercase transition-colors"
                        :class="buyLang === opt
                          ? 'accent-soft-bg text-(--accent-text)'
                          : 'text-(--color-text-muted) hover:text-(--color-text-high)'"
                        :aria-pressed="buyLang === opt"
                        @click="emit('update:buyLang', opt)"
                      >
                        {{ opt }}
                      </button>
                    </div>
                    <UButton
                      icon="i-lucide-shopping-cart"
                      color="primary"
                      variant="solid"
                      size="lg"
                      class="font-medium tracking-wide neon-ring"
                      @click="emit('buyWholeDeck')"
                    >
                      {{ t('buy.wholeDeck') }}
                    </UButton>
                  </div>
                </div>
                <!-- Secondary actions -->
                <div class="mt-3 flex flex-wrap gap-2 border-t border-(--color-border-subtle) pt-3">
                  <UButton
                    icon="i-lucide-clipboard-copy"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    class="bg-(--color-surface-2) text-(--color-text-high) ring-1 ring-(--color-border-strong) hover:bg-(--color-surface-3)"
                    @click="emit('copyWants')"
                  >
                    {{ t('buy.copyWants') }}
                  </UButton>
                  <UButton
                    icon="i-lucide-external-link"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    class="bg-(--color-surface-2) text-(--color-text-high) ring-1 ring-(--color-border-strong) hover:bg-(--color-surface-3)"
                    @click="emit('openAll')"
                  >
                    {{ t('buy.openCards') }}
                  </UButton>
                </div>
              </div>

              <!-- Priced list -->
              <div
                v-if="buyRows.length"
                class="glass-solid overflow-hidden rounded-[var(--radius-xl)]"
              >
                <!-- header -->
                <div class="flex items-center gap-3 border-b border-(--color-border-strong) bg-(--color-surface-2)/60 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
                  <span class="w-7" />
                  <span class="flex-1">{{ t('buy.card') }}</span>
                  <span class="w-14 text-right">{{ t('buy.unit') }}</span>
                  <span class="w-10 text-center">{{ t('buy.qty') }}</span>
                  <span class="w-16 text-right">{{ t('buy.lineTotal') }}</span>
                  <span class="w-8" />
                </div>
                <div
                  v-for="row in buyRows"
                  :key="row.enName"
                  class="flex items-center gap-3 border-b border-(--color-border-subtle) px-4 py-2 transition-colors last:border-0 hover:bg-(--color-surface-2)/40"
                >
                  <img
                    v-if="row.thumb"
                    :src="row.thumb"
                    :alt="row.name"
                    loading="lazy"
                    class="h-9 w-7 shrink-0 rounded object-cover ring-1 ring-black/30"
                  >
                  <span
                    v-else
                    class="h-9 w-7 shrink-0 rounded bg-(--color-surface-2)"
                  />
                  <span class="flex-1 truncate text-sm text-(--color-text-high)">{{ row.name }}</span>
                  <span
                    class="w-14 text-right font-mono text-xs"
                    :class="row.unit == null ? 'text-(--color-text-disabled)' : 'text-(--color-text-mid)'"
                    :title="row.unit == null ? t('buy.notListed') : undefined"
                  >{{ row.unit == null ? '—' : fmtEur(row.unit) }}</span>
                  <span class="w-10 text-center font-mono text-xs text-(--color-text-muted)">×{{ row.quantity }}</span>
                  <span
                    class="w-16 text-right font-mono text-sm font-semibold"
                    :class="row.lineTotal == null ? 'text-(--color-text-disabled)' : 'text-(--accent-text)'"
                  >{{ row.lineTotal == null ? '—' : fmtEur(row.lineTotal) }}</span>
                  <UButton
                    :to="row.url"
                    target="_blank"
                    icon="i-lucide-external-link"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="w-8 shrink-0"
                    :aria-label="`Cardmarket — ${row.name}`"
                  />
                </div>
              </div>
              <p class="px-1 font-mono text-[10px] text-(--color-text-muted)">
                {{ t('buy.priceNote') }}
              </p>
            </template>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
