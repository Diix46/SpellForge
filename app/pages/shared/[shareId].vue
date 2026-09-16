<script setup lang="ts">
import type { GameId } from '#shared/game'
import { onMounted, ref } from 'vue'
import { sharedPath } from '#shared/game'

// Shared decks moved under their universe (/magic/shared/:id,
// /one-piece/shared/:id). Links handed out before that still land here: ask
// the deck's game, then replace the URL.
definePageMeta({ pageTransition: false })

const route = useRoute()
const { t } = useLocale()
const notFound = ref(false)

onMounted(async () => {
  const shareId = String(route.params.shareId)
  try {
    const { deck } = await $fetch<{ deck: { game: GameId } }>(`/api/shared/${encodeURIComponent(shareId)}`)
    await navigateTo(sharedPath(deck.game, shareId), { replace: true })
  }
  catch {
    notFound.value = true
  }
})
</script>

<template>
  <div class="grid min-h-[40vh] place-items-center text-center text-sm text-(--color-text-muted)">
    <div v-if="notFound" class="flex flex-col items-center gap-4">
      <UIcon name="i-lucide-unlink" class="h-10 w-10" />
      <p>{{ t('share.notFound') }}</p>
      <UButton to="/" color="primary" icon="i-lucide-home">
        {{ t('share.home') }}
      </UButton>
    </div>
    <UIcon v-else name="i-lucide-loader-circle" class="h-5 w-5 animate-spin" />
  </div>
</template>
