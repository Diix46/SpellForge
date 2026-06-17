<script setup lang="ts">
import type { PageFormat, PdfSettings } from '~/composables/usePdfExport'
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed } from 'vue'
import { usePdfExport } from '~/composables/usePdfExport'

const props = defineProps<{
  settings: Omit<PdfSettings, 'format'>
  cards: ResolvedCard[]
  uniqueCount: number
  frCount: number
  lang: 'en' | 'fr'
  exporting: PageFormat | null
  exportProgress: { loaded: number, total: number, phase: string }
}>()

const emit = defineEmits<{
  'update:settings': [value: Omit<PdfSettings, 'format'>]
  'export': [format: PageFormat]
}>()

const { t } = useLocale()
const { computeLayout, buildImageList } = usePdfExport()

function patch(key: keyof Omit<PdfSettings, 'format'>, value: unknown) {
  emit('update:settings', { ...props.settings, [key]: value })
}

const layoutInfo = computed(() => {
  const a4 = computeLayout({ ...props.settings, format: 'a4' })
  return { perPage: a4.perPage, cols: a4.cols, rows: a4.rows }
})

function pages(format: PageFormat): number {
  const layout = computeLayout({ ...props.settings, format })
  const imgs = buildImageList(props.cards, props.settings.includeBack)
  return Math.max(1, Math.ceil(imgs.length / layout.perPage))
}

const progressPct = computed(() => {
  if (!props.exportProgress.total)
    return 0
  return Math.round((props.exportProgress.loaded / props.exportProgress.total) * 100)
})
const isExporting = computed(() => props.exporting !== null)
</script>

<template>
  <div class="glass relative overflow-hidden rounded-[var(--radius-xl)] p-5">
    <!-- HUD label -->
    <div class="mb-4 flex items-center justify-between">
      <span class="font-display text-[11px] font-semibold uppercase tracking-[2px] text-(--color-text-muted)">
        {{ t('export.console') }}
      </span>
      <span
        class="flex h-2 w-2 rounded-full bg-(--color-success)"
        style="box-shadow: var(--shadow-glow-success)"
      />
    </div>

    <!-- Format toggle -->
    <div class="mb-4">
      <label class="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">{{ t('export.format') }}</label>
      <div class="grid grid-cols-2 gap-2">
        <button
          class="rounded-[var(--radius-md)] border px-3 py-2 font-mono text-sm transition-all"
          :class="settings.orientation === 'portrait'
            ? 'accent-border-c accent-soft-bg text-(--accent-text)'
            : 'border-(--color-border-subtle) text-(--color-text-muted) hover:border-(--color-border-strong)'"
          @click="patch('orientation', 'portrait')"
        >
          {{ t('export.portrait') }}
        </button>
        <button
          class="rounded-[var(--radius-md)] border px-3 py-2 font-mono text-sm transition-all"
          :class="settings.orientation === 'landscape'
            ? 'accent-border-c accent-soft-bg text-(--accent-text)'
            : 'border-(--color-border-subtle) text-(--color-text-muted) hover:border-(--color-border-strong)'"
          @click="patch('orientation', 'landscape')"
        >
          {{ t('export.landscape') }}
        </button>
      </div>
    </div>

    <!-- Readouts -->
    <div class="mb-4 space-y-2.5 rounded-[var(--radius-md)] bg-(--color-surface-2)/60 p-3">
      <div class="flex items-center justify-between text-sm">
        <span class="text-(--color-text-muted)">{{ t('export.layout') }}</span>
        <span class="font-mono text-(--color-text-high)">{{ layoutInfo.perPage }}/{{ t('export.pages') }} · {{ layoutInfo.cols }}×{{ layoutInfo.rows }}</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <label
          for="export-margin"
          class="text-(--color-text-muted)"
        >{{ t('export.margin') }}</label>
        <div class="flex items-center gap-1.5">
          <input
            id="export-margin"
            name="export-margin"
            :value="settings.marginMm"
            type="number"
            min="0"
            max="30"
            aria-label="Marge en mm"
            class="w-14 rounded-[var(--radius-sm)] border border-(--color-border-subtle) bg-(--color-surface-1) px-2 py-1 text-right font-mono text-sm text-(--color-text-high) focus:border-(--accent-border) focus:outline-none"
            @input="patch('marginMm', Number(($event.target as HTMLInputElement).value))"
          >
          <span class="font-mono text-xs text-(--color-text-muted)">mm</span>
        </div>
      </div>
      <div class="flex items-center justify-between text-sm">
        <label
          for="export-gap"
          class="text-(--color-text-muted)"
        >{{ t('export.spacing') }}</label>
        <div class="flex items-center gap-1.5">
          <input
            id="export-gap"
            name="export-gap"
            :value="settings.gapMm"
            type="number"
            min="0"
            max="10"
            step="0.5"
            aria-label="Espacement en mm"
            class="w-14 rounded-[var(--radius-sm)] border border-(--color-border-subtle) bg-(--color-surface-1) px-2 py-1 text-right font-mono text-sm text-(--color-text-high) focus:border-(--accent-border) focus:outline-none"
            @input="patch('gapMm', Number(($event.target as HTMLInputElement).value))"
          >
          <span class="font-mono text-xs text-(--color-text-muted)">mm</span>
        </div>
      </div>
    </div>

    <!-- Toggles -->
    <div class="mb-5 space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="text-sm text-(--color-text-mid)">{{ t('export.cutGuides') }}</span>
        <USwitch
          :model-value="settings.cutGuides"
          @update:model-value="patch('cutGuides', $event)"
        />
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-(--color-text-mid)">{{ t('export.includeBack') }}</span>
        <USwitch
          :model-value="settings.includeBack"
          @update:model-value="patch('includeBack', $event)"
        />
      </div>
    </div>

    <!-- Progress while exporting -->
    <div
      v-if="isExporting"
      class="mb-3"
    >
      <div class="mb-1 flex justify-between font-mono text-xs">
        <span class="text-(--color-text-muted)">
          {{ exportProgress.phase === 'loading' ? `${t('export.images')} ${exportProgress.loaded}/${exportProgress.total}` : t('export.generating') }}
        </span>
        <span class="text-(--accent-text)">{{ progressPct }}%</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-(--color-surface-1)">
        <div
          class="h-full rounded-full transition-all duration-200"
          :style="{ width: `${progressPct}%`, background: 'var(--gradient-accent)', boxShadow: 'var(--accent-glow-soft)' }"
        />
      </div>
    </div>

    <!-- Primary CTA: A4 with neon ring -->
    <div class="neon-ring mb-2.5">
      <button
        class="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-3 font-semibold text-(--color-text-on-neon) transition-transform active:scale-[.98] disabled:opacity-60"
        style="background: var(--gradient-accent)"
        :disabled="isExporting"
        @click="emit('export', 'a4')"
      >
        <UIcon
          name="i-lucide-file-down"
          class="h-5 w-5"
        />
        {{ exporting === 'a4' ? t('export.generating') : `${t('export.download')} A4 · ${pages('a4')}${t('export.pages')}` }}
      </button>
    </div>

    <!-- Secondary CTA: A3 -->
    <button
      class="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-(--color-border-strong) bg-(--color-surface-2)/40 px-4 py-2.5 font-medium text-(--color-text-mid) transition-all hover:border-(--accent-border) hover:text-(--accent-text) hover:shadow-[var(--accent-glow-soft)] disabled:opacity-60"
      :disabled="isExporting"
      @click="emit('export', 'a3')"
    >
      <UIcon
        name="i-lucide-file-down"
        class="h-4 w-4"
      />
      {{ exporting === 'a3' ? t('export.generating') : `${t('export.download')} A3 · ${pages('a3')}${t('export.pages')}` }}
    </button>

    <!-- Footer stats -->
    <div class="mt-4 flex flex-wrap gap-2 border-t border-(--color-border-subtle) pt-3">
      <span class="rounded-full bg-(--color-surface-2) px-2.5 py-1 font-mono text-[11px] text-(--color-text-mid)">
        {{ uniqueCount }} {{ t('export.unique') }}
      </span>
      <span
        v-if="lang === 'fr'"
        class="accent-soft-bg rounded-full px-2.5 py-1 font-mono text-[11px] text-(--accent-text)"
      >
        {{ frCount }} {{ t('export.inFr') }}
      </span>
    </div>
  </div>
</template>
