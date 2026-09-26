<script setup lang="ts">
// How far the member's Magic collection goes into each set.
definePageMeta({ universe: 'mtg' })
const { t } = useLocale()
useSeoMeta({ title: () => `Magic · ${t('collection.tabSets')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="mtg">
    <CollectionSets game="mtg" />
  </CollectionShell>
</template>
