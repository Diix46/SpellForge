<script setup lang="ts">
import { computed } from 'vue'
import { gameFromSlug, GAMES } from '#shared/game'

// A set as a binder: what the member owns of it, what is missing. No page
// transition: the binder grows out of the library's 3D one.
definePageMeta({ pageTransition: false, validate: route => !!gameFromSlug(route.params.universe) })
useShowUniverseOnMount()
const route = useRoute()
const { t } = useLocale()
const game = computed(() => gameFromSlug(route.params.universe)!)
const code = computed(() => String(route.params.code))
useSeoMeta({ title: () => `${GAMES[game.value].label} · ${t('collection.tabBinder')} · ${code.value.toUpperCase()}`, robots: 'noindex' })
</script>

<template>
  <CollectionShell :key="game" :game="game">
    <CollectionBinder :key="code" :game="game" :code="code" />
  </CollectionShell>
</template>
