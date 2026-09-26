<script setup lang="ts">
// The member's One Piece collection as binders: one per set, the sets started first.
definePageMeta({ universe: 'optcg' })
const { t } = useLocale()
useSeoMeta({ title: () => `One Piece · ${t('collection.title')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell game="optcg">
    <CollectionSets game="optcg" />
  </CollectionShell>
</template>
