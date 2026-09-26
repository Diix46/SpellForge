<script setup lang="ts">
// The member's One Piece collection (components/collection).
definePageMeta({ universe: 'optcg' })
const { t } = useLocale()
useSeoMeta({ title: () => `One Piece · ${t('collection.title')}`, robots: 'noindex' })
</script>

<template>
  <CollectionWorkspace game="optcg" />
</template>
