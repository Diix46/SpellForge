<script setup lang="ts">
// The cards the member is after in Magic, and what they cost now.
definePageMeta({ universe: 'mtg' })
const { t } = useLocale()
useSeoMeta({ title: () => `Magic · ${t('collection.tabWishlist')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="mtg">
    <CollectionWishlist game="mtg" />
  </CollectionShell>
</template>
