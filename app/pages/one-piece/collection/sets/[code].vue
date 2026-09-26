<script setup lang="ts">
import { computed } from 'vue'

// A One Piece set's checklist: what the member owns of it, what is missing.
definePageMeta({ universe: 'optcg' })
const route = useRoute()
const { t } = useLocale()
const code = computed(() => String(route.params.code))
useSeoMeta({ title: () => `One Piece · ${t('collection.tabSets')} · ${code.value.toUpperCase()}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="optcg">
    <CollectionChecklist :key="code" game="optcg" :code="code" />
  </CollectionShell>
</template>
