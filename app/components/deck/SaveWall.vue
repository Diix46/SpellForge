<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed } from 'vue'

// The sign-up moment of the free trial. The deck stays visible behind it and
// nothing is taken hostage: it is already saved in this browser, and the
// account only makes it reachable elsewhere, shareable and publishable.
// "Continue without an account" is offered, and works.
const props = defineProps<{
  deckName: string
  /** One line about the deck: "50 cards · Leader OP01-001". */
  summary: string
  universe: GameId
}>()
const open = defineModel<boolean>('open', { required: true })

const { t } = useLocale()
const { show: openAuth } = useAuthOverlay()

const title = computed(() => (props.universe === 'optcg' ? t('wall.titleOp') : t('wall.titleMtg')))

function register() {
  open.value = false
  openAuth('register')
}
function login() {
  open.value = false
  openAuth('login')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="t('wall.body')"
    :ui="{ content: 'sm:max-w-md wall' }"
  >
    <template #body>
      <div class="wall-body">
        <div class="deck-ticket">
          <div class="min-w-0">
            <p class="ticket-name u-display">
              {{ deckName }}
            </p>
            <p class="ticket-sub">
              {{ summary }}
            </p>
          </div>
          <span class="ticket-local">
            <UIcon name="i-lucide-check" class="h-3.5 w-3.5" />
            {{ t('wall.local') }}
          </span>
        </div>

        <ul class="perks">
          <li>
            <UIcon name="i-lucide-smartphone" class="h-4 w-4" />
            {{ t('wall.perkEverywhere') }}
          </li>
          <li>
            <UIcon name="i-lucide-link" class="h-4 w-4" />
            {{ t('wall.perkShare') }}
          </li>
          <li>
            <UIcon name="i-lucide-layers" class="h-4 w-4" />
            {{ t('wall.perkWorlds') }}
          </li>
        </ul>

        <div class="grid gap-2">
          <UButton color="primary" size="lg" block icon="i-lucide-user-plus" @click="register">
            {{ t('wall.create') }}
          </UButton>
          <UButton color="neutral" variant="ghost" block @click="open = false">
            {{ t('wall.continue') }}
          </UButton>
        </div>
        <p class="fine">
          {{ t('wall.fine') }}
          <button type="button" class="link" @click="login">
            {{ t('wall.haveAccount') }}
          </button>
        </p>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.wall-body {
  display: grid;
  gap: 16px;
}
.deck-ticket {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  rotate: var(--u-tilt, 0deg);
}
.ticket-name {
  margin: 0;
  font-size: 18px;
  line-height: 1.1;
  color: var(--color-text-high);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ticket-sub {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--color-text-muted);
}
.ticket-local {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #2f8a4f;
}
.perks {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13.5px;
  color: var(--color-text-mid);
}
.perks li {
  display: flex;
  align-items: center;
  gap: 10px;
}
.perks :deep(svg),
.perks .iconify {
  flex-shrink: 0;
  color: var(--accent-text);
}
.fine {
  margin: 0;
  font-size: 12px;
  text-align: center;
  color: var(--color-text-muted);
}
.link {
  margin-left: 4px;
  color: var(--accent-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
