<script setup lang="ts">
import { computed } from 'vue'

// A One Piece set as a binder: what the member owns of it, what is missing.
// No page transition: the binder grows out of the library's 3D one.
definePageMeta({ pageTransition: false, universe: 'optcg' })
useShowUniverseOnMount()
const route = useRoute()
const { t } = useLocale()
const code = computed(() => String(route.params.code))
useSeoMeta({ title: () => `One Piece · ${t('collection.tabSets')} · ${code.value.toUpperCase()}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="optcg">
    <CollectionBinder :key="code" game="optcg" :code="code" />
  </CollectionShell>
</template>
