<script setup lang="ts">
// The member's Magic collection, copy line by copy line: filters, sorting,
// bulk actions (components/collection).
definePageMeta({ universe: 'mtg' })
const { t } = useLocale()
useSeoMeta({ title: () => `Magic · ${t('collection.tabInventory')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="mtg">
    <CollectionWorkspace game="mtg" />
  </CollectionShell>
</template>
