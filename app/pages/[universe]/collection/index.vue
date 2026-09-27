<script setup lang="ts">
import { computed } from 'vue'
import { gameFromSlug, GAMES } from '#shared/game'

// A game's collection as binders: one per set, the sets started first
// (components/collection). /magic/collection, /one-piece/collection…
definePageMeta({ validate: route => !!gameFromSlug(route.params.universe) })
const route = useRoute()
const { t } = useLocale()
const game = computed(() => gameFromSlug(route.params.universe)!)
useSeoMeta({ title: () => `${GAMES[game.value].label} · ${t('collection.title')}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell :key="game" :game="game">
    <CollectionSets :game="game" />
  </CollectionShell>
</template>
