<script setup lang="ts">
// What the member's Magic collection is worth, and how that moves.
definePageMeta({ universe: 'mtg' })
const { t } = useLocale()
useSeoMeta({ title: () => `Magic · ${t('collection.tabValue')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="mtg">
    <CollectionValue game="mtg" />
  </CollectionShell>
</template>
