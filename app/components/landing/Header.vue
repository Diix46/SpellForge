<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { libraryPath } from '#shared/game'

// The landing's own bar: transparent over the hero, a dark glass once the page
// scrolls. A visitor who already has decks (in this browser or in an account)
// gets a way back to them instead of the sign-in button; the server cannot
// know about browser decks, so that part renders in the browser only.
const { t, locale, setLocale } = useLocale()
const { loggedIn } = useAuth()
const { decks } = useDeckStore()
const { show: openAuth } = useAuthOverlay()

const returning = computed(() => loggedIn.value || decks.value.length > 0)
const scrolled = ref(false)
const onScroll = () => (scrolled.value = window.scrollY > 40)
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <header class="bar" :class="{ scrolled }">
    <NuxtLink to="/" class="brand" aria-label="Prism">
      <AppLogo />
    </NuxtLink>
    <nav class="links" :aria-label="t('home.nav.menu')">
      <NuxtLink :to="libraryPath('optcg')" class="link link--op">
        One Piece
      </NuxtLink>
      <NuxtLink :to="libraryPath('mtg')" class="link link--mtg">
        Magic
      </NuxtLink>
      <NuxtLink to="/discover" class="link">
        {{ t('nav.discover') }}
      </NuxtLink>
    </nav>
    <div class="right">
      <div class="lang" role="group" aria-label="Langue / Language">
        <button type="button" :aria-pressed="locale === 'fr'" @click="setLocale('fr')">
          FR
        </button>
        <button type="button" :aria-pressed="locale === 'en'" @click="setLocale('en')">
          EN
        </button>
      </div>
      <ClientOnly>
        <NuxtLink v-if="returning" to="/decks" class="action action--decks">
          <UIcon name="i-lucide-layout-grid" class="h-4 w-4" />
          {{ t('home.nav.decks') }}
        </NuxtLink>
        <button v-else type="button" class="action" @click="openAuth('login')">
          {{ t('auth.login') }}
        </button>
        <template #fallback>
          <button type="button" class="action" @click="openAuth('login')">
            {{ t('auth.login') }}
          </button>
        </template>
      </ClientOnly>
    </div>
  </header>
</template>

<style scoped>
.bar {
  position: fixed;
  z-index: 50;
  inset: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: calc(12px + env(safe-area-inset-top, 0px)) clamp(14px, 3vw, 32px) 12px;
  transition:
    background 0.3s ease,
    box-shadow 0.3s ease;
}
.bar.scrolled {
  background: rgba(12, 10, 16, 0.82);
  box-shadow: 0 1px 0 rgba(201, 162, 78, 0.2);
  backdrop-filter: blur(12px);
}
.brand {
  --color-text-high: #f3ecda;
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(16, 13, 20, 0.82);
}
.brand:focus-visible,
.link:focus-visible,
.action:focus-visible,
.lang button:focus-visible {
  outline: 2px solid #f1d994;
  outline-offset: 2px;
}
.links {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(16, 13, 20, 0.82);
}
.link {
  padding: 6px 14px;
  border-radius: 999px;
  color: #efe6d0;
  font-size: 13.5px;
  text-decoration: none;
  transition: background 0.2s ease;
}
.link:hover {
  background: rgba(243, 236, 218, 0.1);
}
.link--op {
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.link--op:hover {
  background: #c9312a;
  color: #fff8ec;
}
.link--mtg {
  font-family: var(--mtg-face);
  font-weight: 700;
}
.link--mtg:hover {
  background: #c9a24e;
  color: #100c06;
}
.right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lang {
  display: flex;
  padding: 2px;
  border-radius: 8px;
  background: rgba(16, 13, 20, 0.82);
}
.lang button {
  padding: 4px 9px;
  border-radius: 6px;
  color: #b9ac8e;
  font-size: 12px;
}
.lang button[aria-pressed='true'] {
  background: #c9a24e;
  color: #100c06;
}
.action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(201, 162, 78, 0.5);
  border-radius: 8px;
  background: rgba(16, 13, 20, 0.82);
  color: #f3ecda;
  font-size: 13.5px;
  text-decoration: none;
}
.action:hover {
  border-color: #c9a24e;
}
.action--decks {
  border-color: transparent;
  background: linear-gradient(90deg, #c9312a, #9c8043);
  color: #fff8ec;
  font-weight: 600;
}
@media (max-width: 700px) {
  .links {
    display: none;
  }
}
</style>
