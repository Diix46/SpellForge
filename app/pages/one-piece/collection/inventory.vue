<script setup lang="ts">
// The member's One Piece collection, copy line by copy line: filters, sorting,
// bulk actions (components/collection).
definePageMeta({ universe: 'optcg' })
const { t } = useLocale()
useSeoMeta({ title: () => `One Piece · ${t('collection.tabInventory')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="optcg">
    <CollectionWorkspace game="optcg" />
  </CollectionShell>
</template>
