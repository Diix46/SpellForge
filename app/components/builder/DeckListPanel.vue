<script setup lang="ts">
import type { ValidationIssue } from '~/composables/useDeckBuilder'
import type { DeckEntry } from '~/composables/useDecklist'
import { computed } from 'vue'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  entries: DeckEntry[]
  total: number
  commanderName: string
  validation: ValidationIssue[]
  /** name(lower) → simple category for grouping (creature/land/…); optional. */
  categoryByName?: Map<string, string>
}>()

const emit = defineEmits<{
  setQty: [name: string, qty: number]
  remove: [name: string]
  setCommander: [name: string]
}>()

const { t } = useLocale()

const CATEGORY_ORDER = ['commander', 'creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'battle', 'land', 'other']
const CATEGORY_KEY: Record<string, string> = {
  commander: 'commander.label',
  creature: 'type.creature',
  instant: 'type.instant',
  sorcery: 'type.sorcery',
  artifact: 'type.artifact',
  enchantment: 'type.enchantment',
  planeswalker: 'type.planeswalker',
  battle: 'type.battle',
  land: 'type.land',
  other: 'build.deckTitle',
}

function categoryOf(entry: DeckEntry): string {
  if (entry.name.trim().toLowerCase() === props.commanderName.trim().toLowerCase())
    return 'commander'
  return props.categoryByName?.get(entry.name.trim().toLowerCase()) ?? 'other'
}

const groups = computed(() => {
  const map = new Map<string, DeckEntry[]>()
  for (const e of props.entries) {
    const cat = categoryOf(e)
    if (!map.has(cat))
      map.set(cat, [])
    map.get(cat)!.push(e)
  }
  return CATEGORY_ORDER
    .filter(c => map.has(c))
    .map(c => ({
      key: c,
      label: t(CATEGORY_KEY[c] ?? 'build.deckTitle'),
      cards: map.get(c)!.sort((a, b) => a.name.localeCompare(b.name)),
      count: map.get(c)!.reduce((s, e) => s + e.quantity, 0),
    }))
})

const errors = computed(() => props.validation.filter(v => v.level === 'error'))
const warnings = computed(() => props.validation.filter(v => v.level === 'warning'))
const isValid = computed(() => props.validation.length === 0)

function issueText(issue: ValidationIssue): string {
  return issue.value != null ? `${issue.value} ${t(issue.key)}` : t(issue.key)
}
</script>

<template>
  <div class="glass-solid flex h-full flex-col rounded-[var(--radius-xl)] p-4">
    <!-- Header: title + counter -->
    <div class="mb-3 flex items-center justify-between">
      <h3 class="font-mono text-[11px] uppercase tracking-[2px] text-(--color-text-muted)">
        {{ t('build.deckTitle') }}
      </h3>
      <span
        class="rounded-full px-2.5 py-0.5 font-mono text-sm font-semibold"
        :class="total === 100 ? 'text-(--color-success)' : 'text-(--accent-text)'"
      >
        {{ total }} / 100
      </span>
    </div>

    <!-- Validation -->
    <div
      class="mb-3 rounded-[var(--radius-md)] p-2.5 text-xs"
      :class="isValid ? 'bg-(--color-success)/10 text-(--color-success)' : 'bg-(--color-surface-2)/60'"
    >
      <div v-if="isValid" class="flex items-center gap-1.5 font-medium">
        <UIcon name="i-lucide-check-circle-2" class="h-4 w-4" />
        {{ t('valid.ok') }}
      </div>
      <template v-else>
        <div
          v-for="(issue, i) in [...errors, ...warnings]"
          :key="i"
          class="flex items-center gap-1.5"
          :class="issue.level === 'error' ? 'text-(--color-error)' : 'text-(--color-warning)'"
        >
          <UIcon :name="issue.level === 'error' ? 'i-lucide-x-circle' : 'i-lucide-alert-triangle'" class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate">{{ issueText(issue) }}</span>
        </div>
      </template>
    </div>

    <!-- Empty -->
    <p v-if="!entries.length" class="flex-1 py-10 text-center text-sm text-(--color-text-muted)">
      {{ t('build.empty') }}
    </p>

    <!-- Grouped list (scrollable) -->
    <div v-else class="-mr-2 flex-1 space-y-3 overflow-y-auto pr-2">
      <div v-for="group in groups" :key="group.key">
        <div class="mb-1 flex items-center justify-between border-b border-(--color-border-subtle) pb-1">
          <span class="font-mono text-[10px] uppercase tracking-wider" :class="group.key === 'commander' ? 'text-(--accent-text)' : 'text-(--color-text-muted)'">
            <UIcon v-if="group.key === 'commander'" name="i-lucide-crown" class="mr-1 inline h-3 w-3" />
            {{ group.label }}
          </span>
          <span class="font-mono text-[10px] text-(--color-text-muted)">{{ group.count }}</span>
        </div>

        <div
          v-for="entry in group.cards"
          :key="entry.name"
          class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 transition-colors hover:bg-(--color-surface-2)/50"
        >
          <!-- qty -->
          <div class="flex items-center gap-0.5">
            <button
              type="button"
              class="grid h-5 w-5 place-items-center rounded text-(--color-text-muted) hover:bg-(--color-surface-3) hover:text-(--color-text-high)"
              aria-label="-"
              @click="emit('setQty', entry.name, entry.quantity - 1)"
            >
              <UIcon name="i-lucide-minus" class="h-3 w-3" />
            </button>
            <span class="w-5 text-center font-mono text-xs text-(--color-text-high)">{{ entry.quantity }}</span>
            <button
              type="button"
              class="grid h-5 w-5 place-items-center rounded text-(--color-text-muted) hover:bg-(--color-surface-3) hover:text-(--color-text-high)"
              aria-label="+"
              @click="emit('setQty', entry.name, entry.quantity + 1)"
            >
              <UIcon name="i-lucide-plus" class="h-3 w-3" />
            </button>
          </div>

          <span class="min-w-0 flex-1 truncate text-sm text-(--color-text-mid)">{{ entry.name }}</span>

          <!-- actions -->
          <div class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              v-if="group.key !== 'commander'"
              type="button"
              class="grid h-5 w-5 place-items-center rounded text-(--color-text-muted) hover:text-(--accent-text)"
              :title="t('build.setCommander')"
              @click="emit('setCommander', entry.name)"
            >
              <UIcon name="i-lucide-crown" class="h-3 w-3" />
            </button>
            <button
              type="button"
              class="grid h-5 w-5 place-items-center rounded text-(--color-text-muted) hover:text-(--color-error)"
              aria-label="remove"
              @click="emit('remove', entry.name)"
            >
              <UIcon name="i-lucide-trash-2" class="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
