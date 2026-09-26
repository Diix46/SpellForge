<script setup lang="ts">
// The member's One Piece collection: every copy (components/collection).
definePageMeta({ universe: 'optcg' })
const { t } = useLocale()
useSeoMeta({ title: () => `One Piece · ${t('collection.title')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="optcg">
    <CollectionWorkspace game="optcg" />
  </CollectionShell>
</template>
