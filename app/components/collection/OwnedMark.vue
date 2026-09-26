<script setup lang="ts">
import type { OwnedCount } from '#shared/collection'
import { computed } from 'vue'

// A deck row's standing against the collection: every copy owned (a filled
// gem), some of them (how many of how many), none (a hollow ring).
const props = defineProps<{ count: OwnedCount }>()
const { t } = useLocale()

const state = computed(() => (props.count.have >= props.count.need ? 'full' : props.count.have > 0 ? 'part' : 'none'))
const label = computed(() => t(`collection.ownedMark.${state.value}`).replace('{have}', String(props.count.have)).replace('{need}', String(props.count.need)))
</script>

<template>
  <span class="owned" :class="`owned--${state}`" :title="label" role="img" :aria-label="label">
    <UIcon v-if="state === 'full'" name="i-lucide-gem" class="h-3 w-3" />
    <template v-else-if="state === 'part'">{{ count.have }}/{{ count.need }}</template>
  </span>
</template>

<style scoped>
.owned {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}
.owned--full {
  background: rgba(46, 160, 98, 0.16);
  color: #23945a;
}
.owned--part {
  background: rgba(214, 150, 30, 0.18);
  color: #b27510;
}
.owned--none {
  width: 10px;
  min-width: 10px;
  height: 10px;
  padding: 0;
  border: 1.5px dashed var(--color-border-strong);
}
</style>
