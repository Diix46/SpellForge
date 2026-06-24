<script setup lang="ts">
import type { CategoryKey, ManaColor } from '~/composables/useMtg'
import type { PageFormat, PdfSettings } from '~/composables/usePdfExport'
import type { ResolvedCard } from '~/composables/useScryfall'
import { useLocale } from '~/composables/useLocale'

// Preview & print overlay (right slide-over): commander feature, clickable type
// stats, the paginated visual card grid, and the PDF export console. A terminal
// "review + print" action launched from the deck toolbar. Pure presentation —
// data, settings (v-model), pagination/filter (v-model) and handlers come from
// the page.

interface TypeStat { key: CategoryKey, icon: string, count: number }

defineProps<{
  open: boolean
  commander: ResolvedCard | null | undefined
  commanderName: string
  commanderType: string
  themeColors: ManaColor[]
  stats: TypeStat[]
  errorCards: ResolvedCard[]
  filteredGridCards: ResolvedCard[]
  pagedCards: ResolvedCard[]
  page: number
  totalPages: number
  typeFilter: CategoryKey | null
  resolvedCards: ResolvedCard[]
  successCards: ResolvedCard[]
  frCount: number
  lang: 'en' | 'fr'
  settings: Omit<PdfSettings, 'format'>
  exporting: PageFormat | null
  exportProgress: { loaded: number, total: number, phase: string }
  fetching: boolean
  fetchProgress: { loaded: number, total: number }
  printPageEstimate: number
  colorVar: (c: ManaColor) => string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:settings': [value: Omit<PdfSettings, 'format'>]
  'update:page': [value: number]
  'update:typeFilter': [value: CategoryKey | null]
  'details': [card: ResolvedCard]
  'toggleTypeFilter': [key: CategoryKey]
  'export': [format: PageFormat]
}>()

const { t } = useLocale()
</script>

<template>
  <Teleport to="body">
    <Transition name="ovl-slide">
      <div v-if="open" class="ovl-root">
        <div class="ovl-scrim" @click="emit('update:open', false)" />
        <section class="ovl-panel ovl-panel--wide" role="dialog" aria-modal="true" :aria-label="t('tab.preview')" @keydown.escape="emit('update:open', false)">
          <header class="ovl-head">
            <div class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[2px] text-(--accent-text)">
              <UIcon name="i-lucide-eye" class="h-4 w-4" />
              {{ t('tab.preview') }}
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
          <div class="ovl-body">
            <!-- Loading state: images resolve automatically on opening. -->
            <div
              v-if="resolvedCards.length === 0 && fetching"
              class="glass mx-auto flex max-w-md flex-col items-center rounded-[var(--radius-2xl)] py-16 text-center"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="mb-3 h-10 w-10 animate-spin text-(--accent-text)"
              />
              <p class="font-mono text-sm text-(--color-text-muted)">
                {{ fetchProgress.loaded }} / {{ fetchProgress.total }}
              </p>
            </div>

            <!-- Empty deck: nothing to resolve. -->
            <div
              v-else-if="resolvedCards.length === 0"
              class="glass mx-auto flex max-w-md flex-col items-center rounded-[var(--radius-2xl)] py-16 text-center"
            >
              <UIcon
                name="i-lucide-image-off"
                class="mb-3 h-12 w-12 text-(--color-text-muted)"
              />
              <p class="text-(--color-text-muted)">
                {{ t('editor.noCards') }}
              </p>
            </div>

            <div
              v-else
              class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]"
            >
              <!-- LEFT: commander + stats + grid -->
              <div class="order-2 space-y-6 lg:order-1">
                <!-- Commander feature -->
                <div
                  v-if="commander"
                  class="glass relative overflow-hidden rounded-[var(--radius-xl)] p-5"
                >
                  <div class="flex flex-col gap-4 sm:flex-row">
                    <button
                      class="holo-sheen relative w-32 shrink-0 self-center overflow-hidden rounded-[var(--radius-lg)] ring-2 ring-(--accent-border) sm:self-start"
                      :style="{ boxShadow: 'var(--accent-glow-soft)' }"
                      @click="emit('details', commander)"
                    >
                      <img
                        :src="commander.imageUrl!"
                        :alt="commander.card?.name"
                        class="block w-full"
                      >
                    </button>
                    <div class="min-w-0 flex-1">
                      <div class="mb-1 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[2px] text-(--accent-text)">
                        <UIcon
                          name="i-lucide-crown"
                          class="h-3.5 w-3.5"
                        />
                        {{ t('commander.label') }}
                      </div>
                      <h3 class="font-display text-lg font-bold text-(--color-text-high)">
                        {{ commanderName }}
                      </h3>
                      <p class="mt-0.5 text-sm text-(--color-text-muted)">
                        {{ commanderType }}
                      </p>
                      <div class="mt-3 flex items-center gap-1.5">
                        <span
                          v-for="c in themeColors"
                          :key="c"
                          class="h-3 w-3 rounded-full ring-1 ring-white/10"
                          :style="{ background: colorVar(c), boxShadow: `0 0 8px ${colorVar(c)}` }"
                        />
                        <span class="ml-1 font-mono text-xs text-(--color-text-muted)">
                          {{ t('commander.identity') }} {{ themeColors.length ? themeColors.join('').toUpperCase() : t('tile.colorless') }}
                        </span>
                      </div>
                      <UButton
                        class="mt-3"
                        size="xs"
                        color="neutral"
                        variant="subtle"
                        icon="i-lucide-search"
                        @click="emit('details', commander)"
                      >
                        {{ t('commander.details') }}
                      </UButton>
                    </div>
                  </div>
                </div>

                <!-- Type stats — click a type to filter the grid below. -->
                <div
                  v-if="stats.length"
                  class="glass-solid rounded-[var(--radius-xl)] p-4"
                >
                  <div class="mb-3 flex items-center justify-between">
                    <h3 class="font-mono text-[11px] uppercase tracking-[2px] text-(--color-text-muted)">
                      {{ t('stats.title') }}
                    </h3>
                    <button
                      v-if="typeFilter"
                      type="button"
                      class="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-(--accent-text) hover:underline"
                      @click="emit('update:typeFilter', null)"
                    >
                      <UIcon name="i-lucide-x" class="h-3 w-3" />
                      {{ t('stats.clearFilter') }}
                    </button>
                  </div>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <button
                      v-for="s in stats"
                      :key="s.key"
                      type="button"
                      class="flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left ring-1 transition-all"
                      :class="typeFilter === s.key
                        ? 'accent-soft-bg ring-(--accent-border)'
                        : 'bg-(--color-surface-2)/50 ring-transparent hover:bg-(--color-surface-2)'"
                      :aria-pressed="typeFilter === s.key"
                      @click="emit('toggleTypeFilter', s.key)"
                    >
                      <UIcon
                        :name="s.icon"
                        class="h-4 w-4 shrink-0"
                        :class="typeFilter === s.key ? 'text-(--accent-text)' : 'text-(--color-text-muted)'"
                      />
                      <div class="min-w-0">
                        <div class="font-mono text-sm font-semibold text-(--color-text-high)">
                          {{ s.count }}
                        </div>
                        <div class="truncate text-[10px] text-(--color-text-muted)">
                          {{ t(`type.${s.key}`) }}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                <!-- Errors -->
                <div
                  v-if="errorCards.length"
                  class="rounded-[var(--radius-lg)] border border-(--color-warning)/40 bg-(--color-warning)/10 p-3 text-sm"
                >
                  <div class="mb-1 flex items-center gap-2 font-medium text-(--color-warning)">
                    <UIcon
                      name="i-lucide-alert-triangle"
                      class="h-4 w-4"
                    />
                    {{ errorCards.length }} {{ t('errors.notFound') }}
                  </div>
                  <p class="text-xs text-(--color-text-muted)">
                    {{ errorCards.map(c => c.entry.name).join(', ') }}
                  </p>
                </div>

                <!-- Grid -->
                <div>
                  <!-- Active filter banner -->
                  <div
                    v-if="typeFilter"
                    class="mb-3 flex items-center gap-2 font-mono text-xs text-(--color-text-muted)"
                  >
                    <UIcon name="i-lucide-filter" class="h-3.5 w-3.5 text-(--accent-text)" />
                    <span>
                      {{ filteredGridCards.length }} · {{ t(`type.${typeFilter}`) }}
                    </span>
                    <button
                      type="button"
                      class="text-(--accent-text) hover:underline"
                      @click="emit('update:typeFilter', null)"
                    >
                      {{ t('stats.clearFilter') }}
                    </button>
                  </div>
                  <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                    <MtgCardPreview
                      v-for="(card, idx) in pagedCards"
                      :key="card.card?.id ?? card.entry.name"
                      :card="card"
                      :index="idx"
                      @details="emit('details', $event)"
                    />
                  </div>

                  <!-- Pagination -->
                  <div
                    v-if="totalPages > 1"
                    class="mt-6 flex items-center justify-center gap-2"
                  >
                    <UButton
                      icon="i-lucide-chevron-left"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                      :aria-label="t('preview.prevPage')"
                      :disabled="page === 1"
                      @click="emit('update:page', page - 1)"
                    />
                    <span class="font-mono text-sm text-(--color-text-mid)">
                      <span class="text-(--accent-text)">{{ page }}</span> / {{ totalPages }}
                    </span>
                    <UButton
                      icon="i-lucide-chevron-right"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                      :aria-label="t('preview.nextPage')"
                      :disabled="page === totalPages"
                      @click="emit('update:page', page + 1)"
                    />
                  </div>
                </div>
              </div>

              <!-- RIGHT: export console -->
              <div class="order-1 lg:order-2">
                <div class="lg:sticky lg:top-4">
                  <ExportConsole
                    :settings="settings"
                    :cards="resolvedCards"
                    :unique-count="successCards.length"
                    :fr-count="frCount"
                    :lang="lang"
                    :exporting="exporting"
                    :export-progress="exportProgress"
                    @update:settings="emit('update:settings', $event)"
                    @export="emit('export', $event)"
                  />
                  <!-- Print-readiness hint: demystifies the export before download. -->
                  <p
                    v-if="successCards.length"
                    class="mt-2 text-center font-mono text-[10px] text-(--color-text-muted)"
                  >
                    {{ successCards.length }} {{ t('editor.cardsWord') }} · ~{{ printPageEstimate }} {{ t('preview.pages') }} · {{ t('preview.readyToPrint') }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
