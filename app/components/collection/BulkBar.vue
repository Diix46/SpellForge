<script setup lang="ts">
import type { Condition } from '#shared/collection'
import { computed, ref } from 'vue'
import { CONDITIONS } from '#shared/collection'

// What can be done to several copy lines at once: all shown picked or none,
// a condition or a location for all of them, or out of the collection.
const props = defineProps<{ count: number, total: number, copies: number }>()
const emit = defineEmits<{
  all: []
  none: []
  condition: [condition: Condition]
  location: [location: string | null]
  remove: []
  close: []
}>()

const { t } = useLocale()
const place = ref('')
const placeOpen = ref(false)
const confirming = ref(false)
const conditionItems = computed(() => CONDITIONS.map(c => ({ label: `${c} · ${t(`collection.condition.${c}`)}`, onSelect: () => emit('condition', c) })))

function setPlace() {
  emit('location', place.value.trim() || null)
  placeOpen.value = false
  place.value = ''
}
function remove() {
  if (!confirming.value) {
    confirming.value = true
    setTimeout(() => (confirming.value = false), 3000)
    return
  }
  confirming.value = false
  emit('remove')
}
const allPicked = computed(() => props.count >= props.total)
</script>

<template>
  <div class="bulk" role="toolbar" :aria-label="t('collection.bulk.label')">
    <span class="count">
      <b>{{ count }}</b> {{ t('collection.bulk.selected') }}
      <small v-if="count">({{ copies }} {{ t('collection.copies') }})</small>
    </span>
    <UButton color="neutral" variant="ghost" size="sm" @click="allPicked ? emit('none') : emit('all')">
      {{ allPicked ? t('collection.bulk.none') : t('collection.bulk.all').replace('{n}', String(total)) }}
    </UButton>
    <span class="sep" aria-hidden="true" />
    <UDropdownMenu :items="[conditionItems]" :content="{ side: 'top' }" :disabled="!count">
      <UButton color="neutral" variant="subtle" size="sm" icon="i-lucide-badge-check" :disabled="!count">
        {{ t('collection.condition') }}
      </UButton>
    </UDropdownMenu>
    <UPopover v-model:open="placeOpen" :content="{ side: 'top' }">
      <UButton color="neutral" variant="subtle" size="sm" icon="i-lucide-archive" :disabled="!count">
        {{ t('collection.location') }}
      </UButton>
      <template #content>
        <form class="place" @submit.prevent="setPlace">
          <UInput v-model="place" :placeholder="t('collection.locationPlaceholder')" autofocus class="w-64" />
          <UButton type="submit" size="sm" icon="i-lucide-check">
            {{ t('collection.bulk.apply') }}
          </UButton>
        </form>
      </template>
    </UPopover>
    <UButton :color="confirming ? 'error' : 'neutral'" :variant="confirming ? 'solid' : 'subtle'" size="sm" icon="i-lucide-trash-2" :disabled="!count" @click="remove">
      {{ confirming ? t('collection.bulk.confirmRemove').replace('{n}', String(count)) : t('collection.bulk.remove') }}
    </UButton>
    <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-x" :aria-label="t('collection.bulk.close')" @click="emit('close')" />
  </div>
</template>

<style scoped>
.bulk {
  position: sticky;
  z-index: 20;
  bottom: 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  margin: 16px auto 0;
  padding: 8px 10px 8px 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background: var(--color-surface-1);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  animation: rise 0.25s var(--ease-out, ease-out);
}
@keyframes rise {
  from {
    transform: translateY(12px);
    opacity: 0;
  }
}
.count {
  font-size: 13px;
  color: var(--color-text-mid);
}
.count b {
  font-family: var(--font-mono);
  color: var(--color-text-high);
}
.count small {
  color: var(--color-text-muted);
}
.sep {
  width: 1px;
  height: 20px;
  background: var(--color-border-subtle);
}
.place {
  display: flex;
  gap: 6px;
  padding: 8px;
}
</style>
