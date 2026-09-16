<script setup lang="ts">
import type { Deck } from '~/composables/useDeckStore'
import { computed, ref } from 'vue'
import { sharedPath } from '#shared/game'

// Share settings for a saved deck, whatever its game: a private read-only
// link, and listing in the public Discover gallery (which needs the link).
// Both switches write through the deck store, the single source of truth.
const props = defineProps<{ deck: Deck | undefined }>()
const open = defineModel<boolean>('open', { required: true })

const { t } = useLocale()
const toast = useToast()
const { setShare, setPublic } = useDeckStore()

const togglingShare = ref(false)
const togglingPublic = ref(false)

const shareUrl = computed(() => {
  if (!props.deck?.shareId || !import.meta.client)
    return ''
  return `${window.location.origin}${sharedPath(props.deck.game, props.deck.shareId)}`
})

// Both store calls resolve to null/false for a guest deck too (no-op), so an
// enable that comes back empty never reached the server and is an error.
async function toggleShare(enabled: boolean) {
  if (!props.deck)
    return
  togglingShare.value = true
  try {
    const shareId = await setShare(props.deck.id, enabled)
    if (enabled && !shareId)
      throw new Error('no share id')
  }
  catch {
    toast.add({ title: t('share.error'), color: 'error', icon: 'i-lucide-x' })
  }
  finally {
    togglingShare.value = false
  }
}

async function togglePublic(enabled: boolean) {
  if (!props.deck)
    return
  togglingPublic.value = true
  try {
    const isPublic = await setPublic(props.deck.id, enabled)
    if (enabled && !isPublic)
      throw new Error('no public flag')
  }
  catch {
    toast.add({ title: t('share.error'), color: 'error', icon: 'i-lucide-x' })
  }
  finally {
    togglingPublic.value = false
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    toast.add({ title: t('share.copied'), description: shareUrl.value, color: 'success', icon: 'i-lucide-link' })
  }
  catch {
    toast.add({ title: t('share.copyError'), color: 'error', icon: 'i-lucide-x' })
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('share.button')"
    :ui="{ overlay: 'bg-ink-950/70 backdrop-blur-[6px]', content: 'glass rounded-[var(--radius-2xl)]' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-sm font-medium text-(--color-text-high)">
              {{ t('share.linkActive') }}
            </div>
            <p class="text-xs text-(--color-text-muted)">
              {{ t('share.linkActiveHint') }}
            </p>
          </div>
          <USwitch
            :model-value="!!deck?.shareId"
            :aria-label="t('share.linkActive')"
            :loading="togglingShare"
            :disabled="togglingShare"
            @update:model-value="toggleShare"
          />
        </div>

        <div v-if="deck?.shareId" class="flex items-center gap-2">
          <UInput :model-value="shareUrl" readonly class="w-full font-mono text-xs" />
          <UButton icon="i-lucide-clipboard-copy" color="neutral" variant="subtle" :aria-label="t('build.copy')" @click="copy" />
        </div>

        <div class="flex items-center justify-between gap-4" :class="{ 'opacity-50': !deck?.shareId }">
          <div>
            <div class="text-sm font-medium text-(--color-text-high)">
              {{ t('share.listPublic') }}
            </div>
            <p class="text-xs text-(--color-text-muted)">
              {{ t('share.listPublicHint') }}
            </p>
          </div>
          <USwitch
            :model-value="!!deck?.public"
            :aria-label="t('share.listPublic')"
            :disabled="!deck?.shareId || togglingPublic"
            :loading="togglingPublic"
            @update:model-value="togglePublic"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton color="neutral" variant="subtle" @click="open = false">
          {{ t('modal.close') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
