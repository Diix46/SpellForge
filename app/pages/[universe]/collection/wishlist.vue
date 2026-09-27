<script setup lang="ts">
import { computed } from 'vue'
import { gameFromSlug, GAMES } from '#shared/game'

// The cards the member is after in a game, and what they cost now.
definePageMeta({ validate: route => !!gameFromSlug(route.params.universe) })
const route = useRoute()
const { t } = useLocale()
const game = computed(() => gameFromSlug(route.params.universe)!)
useSeoMeta({ title: () => `${GAMES[game.value].label} · ${t('collection.tabWishlist')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell :key="game" :game="game">
    <CollectionWishlist :game="game" />
  </CollectionShell>
</template>
