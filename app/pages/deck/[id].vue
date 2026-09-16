<script setup lang="ts">
import { watch } from 'vue'
import { deckPath } from '#shared/game'

// Decks moved under their universe (/magic/deck/:id, /one-piece/deck/:id).
// This keeps old links and bookmarks working: it waits for the deck store —
// a signed-in user's decks arrive asynchronously — then replaces the URL.
definePageMeta({ pageTransition: false })

const route = useRoute()
const { getDeck, ready } = useDeckStore()

watch(ready, (isReady) => {
  if (!isReady)
    return
  const id = String(route.params.id)
  const deck = getDeck(id)
  navigateTo(deck ? deckPath(deck) : '/decks', { replace: true })
}, { immediate: true })
</script>

<template>
  <div class="grid min-h-[40vh] place-items-center text-sm text-(--color-text-muted)">
    <UIcon name="i-lucide-loader-circle" class="h-5 w-5 animate-spin" />
  </div>
</template>
