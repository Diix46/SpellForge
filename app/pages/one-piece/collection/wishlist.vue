<script setup lang="ts">
// The cards the member is after in One Piece, and what they cost now.
definePageMeta({ universe: 'optcg' })
const { t } = useLocale()
useSeoMeta({ title: () => `One Piece · ${t('collection.tabWishlist')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="optcg">
    <CollectionWishlist game="optcg" />
  </CollectionShell>
</template>
