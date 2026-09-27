<script setup lang="ts">
import { computed } from 'vue'
import { can, gameFromSlug, GAMES } from '#shared/game'

// What a game's collection is worth and how that moves (games with prices).
definePageMeta({ validate: route => can(gameFromSlug(route.params.universe), 'prices') })
const route = useRoute()
const { t } = useLocale()
const game = computed(() => gameFromSlug(route.params.universe)!)
useSeoMeta({ title: () => `${GAMES[game.value].label} · ${t('collection.tabValue')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell :key="game" :game="game">
    <CollectionValue :game="game" />
  </CollectionShell>
</template>
