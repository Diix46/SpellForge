<script setup lang="ts">
import type { Deck } from '~/composables/useDeckStore'
import { computed } from 'vue'
import { deckPath } from '#shared/game'

// "My decks" for a guest: the list lives in an account. The deck started in
// this browser stays reachable (it joins the account on sign-in), and the
// libraries are one click away.
const props = defineProps<{ decks: Deck[] }>()

const { t } = useLocale()
const { show } = useAuthOverlay()
const members = useMembersOnly()

const latest = computed(() => [...props.decks].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null)

function open(mode: 'login' | 'register') {
  members.reason.value = 'decks'
  show(mode)
}
</script>

<template>
  <section class="gate">
    <div class="gate-art" aria-hidden="true">
      <UIcon name="i-lucide-layers" class="h-8 w-8" />
    </div>
    <h1 class="gate-title">
      {{ t('members.gateTitle') }}
    </h1>
    <p class="gate-body">
      {{ t('members.gateBody') }}
    </p>
    <div class="gate-cta">
      <UButton icon="i-lucide-sparkles" color="primary" size="lg" @click="open('register')">
        {{ t('members.unlock') }}
      </UButton>
      <UButton icon="i-lucide-log-in" color="neutral" variant="subtle" size="lg" @click="open('login')">
        {{ t('members.login') }}
      </UButton>
    </div>
    <div class="gate-more">
      <NuxtLink v-if="latest" :to="deckPath(latest)" class="gate-link">
        <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
        {{ t('members.gateResume').replace('{name}', latest.name) }}
      </NuxtLink>
      <span class="gate-link-row">
        <UIcon name="i-lucide-library" class="h-4 w-4" />
        {{ t('members.gateLibraries') }} :
        <NuxtLink to="/magic" class="gate-link">Magic</NuxtLink>
        ·
        <NuxtLink to="/one-piece" class="gate-link">One Piece</NuxtLink>
      </span>
    </div>
  </section>
</template>

<style scoped>
.gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 520px;
  margin: 48px auto;
  padding: 36px 28px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: var(--color-surface-1);
  box-shadow: var(--shadow-elev-2);
  text-align: center;
}
.gate-art {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin-bottom: 18px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-text);
}
.gate-title {
  margin: 0 0 10px;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--color-text-high);
}
.gate-body {
  margin: 0 0 22px;
  color: var(--color-text-mid);
  line-height: 1.55;
}
.gate-cta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.gate-more {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--color-border-hairline);
  width: 100%;
  font-size: 14px;
  color: var(--color-text-muted);
}
.gate-link-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}
.gate-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent-text);
  font-weight: 500;
  text-decoration: none;
}
.gate-link:hover {
  text-decoration: underline;
}
</style>
