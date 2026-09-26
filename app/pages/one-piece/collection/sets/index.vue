<script setup lang="ts">
// How far the member's One Piece collection goes into each set.
definePageMeta({ universe: 'optcg' })
const { t } = useLocale()
useSeoMeta({ title: () => `One Piece · ${t('collection.tabSets')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="optcg">
    <CollectionSets game="optcg" />
  </CollectionShell>
</template>
