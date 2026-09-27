<script setup lang="ts">
import { computed } from 'vue'
import { gameFromSlug, GAMES } from '#shared/game'

// A game's collection, copy line by copy line: filters, sorting, bulk actions.
definePageMeta({ validate: route => !!gameFromSlug(route.params.universe) })
const route = useRoute()
const { t } = useLocale()
const game = computed(() => gameFromSlug(route.params.universe)!)
useSeoMeta({ title: () => `${GAMES[game.value].label} · ${t('collection.tabInventory')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell :key="game" :game="game">
    <CollectionWorkspace :game="game" />
  </CollectionShell>
</template>
