<script setup lang="ts">
import { computed } from 'vue'

// One Magic set's checklist: what the member owns of it, what is missing.
definePageMeta({ universe: 'mtg' })
const route = useRoute()
const { t } = useLocale()
const code = computed(() => String(route.params.code))
useSeoMeta({ title: () => `Magic · ${t('collection.tabSets')} · ${code.value.toUpperCase()}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="mtg">
    <CollectionChecklist :key="code" game="mtg" :code="code" />
  </CollectionShell>
</template>
