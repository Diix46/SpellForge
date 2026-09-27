<script setup lang="ts">
import { collectionPath, gameFromSlug } from '#shared/game'

// The sets are the binder shelf, the collection's first page.
definePageMeta({ validate: route => !!gameFromSlug(route.params.universe) })
const route = useRoute()
await navigateTo(collectionPath(gameFromSlug(route.params.universe)!), { replace: true })
</script>

<template>
  <div />
</template>
