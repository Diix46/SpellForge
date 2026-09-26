<script setup lang="ts">
// The member's Magic collection (components/collection).
definePageMeta({ universe: 'mtg' })
const { t } = useLocale()
useSeoMeta({ title: () => `Magic · ${t('collection.title')}`, robots: 'noindex' })
</script>

<template>
  <CollectionWorkspace game="mtg" />
</template>
