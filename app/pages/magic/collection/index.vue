<script setup lang="ts">
// The member's Magic collection: every copy (components/collection).
definePageMeta({ universe: 'mtg' })
const { t } = useLocale()
useSeoMeta({ title: () => `Magic · ${t('collection.title')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="mtg">
    <CollectionWorkspace game="mtg" />
  </CollectionShell>
</template>
