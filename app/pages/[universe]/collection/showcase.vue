<script setup lang="ts">
import { computed } from 'vue'
import { gameFromSlug, GAMES } from '#shared/game'

// A game's collection shown off: what it is worth, its finest cards, the
// showcase the member composes.
definePageMeta({ validate: route => !!gameFromSlug(route.params.universe) })
const route = useRoute()
const { t } = useLocale()
const game = computed(() => gameFromSlug(route.params.universe)!)
useSeoMeta({ title: () => `${GAMES[game.value].label} · ${t('collection.tabShowcase')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell :key="game" :game="game">
    <CollectionShowcase :game="game" />
  </CollectionShell>
</template>
