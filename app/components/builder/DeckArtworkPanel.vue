<script setup lang="ts">
import type { BulkArtMode, SetCoverage } from '#shared/mtg/prints'
import { computed, ref } from 'vue'
import { useLocale } from '~/composables/useLocale'

// Deck-wide artwork actions in the preview overlay: back to automatic, all retro,
// all newest, all in English (sharp scans, pinned "[EN]"), or one set for every
// card that has a printing in it. The sets are
// listed by how many of the deck's cards they cover, fetched on first use.
// The menu is not portalled: the overlay sits above the page's portal layer.

const props = defineProps<{
  sets: SetCoverage[]
  loading: boolean
}>()

const emit = defineEmits<{
  apply: [mode: BulkArtMode]
  /** The set list is needed (the select opened): fetch the deck's printings. */
  load: []
}>()

const { t } = useLocale()

const chosenSet = ref<string | undefined>()
const setItems = computed(() => props.sets.map(s => ({
  label: `${s.setName} (${s.set.toUpperCase()})`,
  value: s.set,
  suffix: `${s.cards} ${t('print.bulk.cards')}`,
})))
</script>

<template>
  <div class="glass-solid relative z-30 rounded-[var(--radius-xl)] p-4">
    <div class="mb-1 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[2px] text-(--color-text-muted)">
      <UIcon name="i-lucide-layers" class="h-3.5 w-3.5 text-(--accent-text)" />
      {{ t('print.bulk.title') }}
    </div>
    <p class="mb-3 text-xs text-(--color-text-muted)">
      {{ t('print.bulk.hint') }}
    </p>

    <div class="flex flex-wrap gap-2">
      <UButton size="xs" color="neutral" variant="subtle" icon="i-lucide-wand-sparkles" @click="emit('apply', { kind: 'auto' })">
        {{ t('print.bulk.auto') }}
      </UButton>
      <UButton size="xs" color="neutral" variant="subtle" icon="i-lucide-history" :loading="loading" @click="emit('apply', { kind: 'oldest' })">
        {{ t('print.bulk.oldest') }}
      </UButton>
      <UButton size="xs" color="neutral" variant="subtle" icon="i-lucide-sparkles" :loading="loading" @click="emit('apply', { kind: 'newest' })">
        {{ t('print.bulk.newest') }}
      </UButton>
      <UButton size="xs" color="neutral" variant="subtle" icon="i-lucide-languages" :loading="loading" :title="t('print.bulk.englishTitle')" @click="emit('apply', { kind: 'english' })">
        {{ t('print.bulk.english') }}
      </UButton>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="text-xs text-(--color-text-mid)">{{ t('print.bulk.set') }}</span>
      <USelectMenu
        v-model="chosenSet"
        :items="setItems"
        value-key="value"
        :loading="loading"
        :placeholder="t('print.bulk.setPlaceholder')"
        size="xs"
        class="min-w-56 flex-1"
        :portal="false"
        :search-input="{ placeholder: t('print.bulk.search') }"
        @update:open="(o: boolean) => o && emit('load')"
      >
        <template #item-trailing="{ item }">
          <span class="font-mono text-[10px] text-(--color-text-muted)">{{ item.suffix }}</span>
        </template>
      </USelectMenu>
      <UButton
        size="xs"
        icon="i-lucide-check"
        :disabled="!chosenSet"
        @click="chosenSet && emit('apply', { kind: 'set', set: chosenSet })"
      >
        {{ t('print.bulk.apply') }}
      </UButton>
    </div>
  </div>
</template>
