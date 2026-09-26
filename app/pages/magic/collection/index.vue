<script setup lang="ts">
// The member's Magic collection as binders: one per set, the sets started first.
definePageMeta({ universe: 'mtg' })
const { t } = useLocale()
useSeoMeta({ title: () => `Magic · ${t('collection.title')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="mtg">
    <CollectionSets game="mtg" />
  </CollectionShell>
</template>
