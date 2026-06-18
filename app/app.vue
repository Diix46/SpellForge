<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCommandPalette } from '~/composables/useCommandPalette'

// Mana Prism favicon as an inline SVG data URI (matches AppLogo). Neutral bg now.
const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">`
  + `<defs>`
  + `<linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%237DEEFF"/><stop offset="1" stop-color="%2306C7E6"/></linearGradient>`
  + `<linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%23E4E4E7"/><stop offset="1" stop-color="%238E8E96"/></linearGradient>`
  + `</defs>`
  + `<rect width="40" height="40" rx="9" fill="%230A0A0B"/>`
  + `<path d="M20 6 L20 34 L9 20 Z" fill="url(%23c)"/>`
  + `<path d="M20 6 L31 20 L20 34 Z" fill="url(%23m)"/>`
  + `<path d="M20 6 L20 34" stroke="%23FFFFFF" stroke-width="1" opacity=".4"/>`
  + `</svg>`,
)}`

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: '#0A0A0B' },
  ],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: FAVICON },
  ],
  htmlAttrs: { lang: 'fr' },
})

useSeoMeta({
  title: 'Spellforge — Deck manager & proxy printer',
  titleTemplate: (titleChunk?: string) =>
    titleChunk && !titleChunk.startsWith('Spellforge') ? `${titleChunk} · Spellforge` : 'Spellforge — Deck manager & proxy printer',
  description: 'Spellforge — gérez vos decks Magic: The Gathering et imprimez des proxies impeccables en français ou anglais sur A4/A3.',
})

const route = useRoute()
const { locale, setLocale, t } = useLocale()
const { loggedIn, user, logout } = useAuth()
const { show: openCmdK } = useCommandPalette()

const showAuth = ref(false)
const mobileNav = ref(false)

const userMenu = computed(() => [[
  { label: user.value?.displayName ?? t('auth.account'), type: 'label' as const },
  { label: t('auth.logout'), icon: 'i-lucide-log-out', onSelect: () => logout() },
]])

const initials = computed(() => {
  const n = user.value?.displayName?.trim()
  if (!n)
    return '·'
  return n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
})

// Primary nav — real destinations only (these get the active state).
// "Importer" is an ACTION (opens the import modal), not a destination, so it's
// rendered separately below and never shows an active fill.
const nav = computed(() => [
  { to: '/', label: t('nav.myDecks'), icon: 'i-lucide-layout-grid' },
])

// A nav link is active only when it's the current route (exact). The dashboard
// link stays active on '/' even with a transient ?import/?new modal query.
function isActive(to: string) {
  if (to === '/')
    return route.path === '/'
  return route.path === to
}

function openImport() {
  mobileNav.value = false
  navigateTo('/?import=1')
}
</script>

<template>
  <UApp>
    <FxAppBackground />

    <NuxtLoadingIndicator :height="2" color="rgb(var(--accent-rgb))" />

    <div class="app-shell" :style="{ zIndex: 'var(--z-content)' }">
      <!-- ============ SIDEBAR ============ -->
      <aside class="side" :class="{ open: mobileNav }">
        <NuxtLink to="/" class="side-brand" @click="mobileNav = false">
          <AppLogo />
        </NuxtLink>

        <button type="button" class="side-search" @click="openCmdK(); mobileNav = false">
          <UIcon name="i-lucide-search" class="h-[15px] w-[15px]" />
          <span>{{ t('nav.search') }}</span>
          <span class="kk"><kbd>⌘</kbd><kbd>K</kbd></span>
        </button>

        <nav class="side-nav">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="side-link"
            :class="{ active: isActive(item.to) }"
            @click="mobileNav = false"
          >
            <UIcon :name="item.icon" class="ic" />
            <span>{{ item.label }}</span>
          </NuxtLink>

          <button type="button" class="side-link" @click="openImport">
            <UIcon name="i-lucide-download" class="ic" />
            <span>{{ t('nav.import') }}</span>
          </button>
        </nav>

        <div class="side-foot">
          <div class="lang">
            <button :class="{ on: locale === 'fr' }" aria-label="Français" @click="setLocale('fr')">
              FR
            </button>
            <button :class="{ on: locale === 'en' }" aria-label="English" @click="setLocale('en')">
              EN
            </button>
          </div>
          <UDropdownMenu v-if="loggedIn" :items="userMenu">
            <button type="button" class="side-user">
              <span class="avatar">{{ initials }}</span>
              <span class="who">{{ user?.displayName }}<small>{{ t('auth.syncedDecks') }}</small></span>
            </button>
          </UDropdownMenu>
          <button v-else type="button" class="side-user" @click="showAuth = true">
            <span class="avatar guest"><UIcon name="i-lucide-log-in" class="h-4 w-4" /></span>
            <span class="who">{{ t('auth.login') }}<small>{{ t('auth.cloudNote') }}</small></span>
          </button>
        </div>
      </aside>

      <!-- scrim for mobile drawer -->
      <div v-if="mobileNav" class="side-scrim" @click="mobileNav = false" />

      <!-- ============ MAIN ============ -->
      <div class="main">
        <header class="topbar">
          <button type="button" class="burger" :aria-label="t('nav.search')" @click="mobileNav = !mobileNav">
            <UIcon name="i-lucide-menu" class="h-5 w-5" />
          </button>
          <span class="crumb">{{ t('nav.decks') }}</span>

          <div class="topbar-right">
            <button type="button" class="top-search" :aria-label="t('nav.search')" @click="openCmdK()">
              <UIcon name="i-lucide-search" class="h-[15px] w-[15px]" />
              <span class="kk"><kbd>⌘</kbd><kbd>K</kbd></span>
            </button>
            <div id="topbar-actions" class="topbar-actions" />
          </div>
        </header>

        <main class="content">
          <NuxtPage />
        </main>

        <footer class="foot">
          <div class="foot-inner">
            <div class="foot-brand">
              <AppLogo :wordmark="false" :size="20" />
              <span>{{ t('footer.tagline') }}</span>
            </div>
            <p>
              {{ t('footer.dataVia') }}
              <a href="https://scryfall.com" target="_blank">Scryfall</a>
              • {{ t('footer.importsVia') }}
              <a href="https://edhrec.com" target="_blank">EDHREC</a>
            </p>
          </div>
        </footer>
      </div>
    </div>

    <AuthModal v-model:open="showAuth" />
    <CommandPalette />
  </UApp>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}

/* ---------- Sidebar ---------- */
.side {
  width: 248px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border-hairline);
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: 0;
  height: 100vh;
  background: var(--color-bg-base-2);
}
.side-brand {
  display: block;
  padding: 8px 8px 14px;
}
.side-search {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 4px 12px;
  padding: 8px 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 13px;
  background: var(--color-surface-1);
  transition:
    border-color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}
.side-search:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
}
.side-search .kk {
  margin-left: auto;
  display: flex;
  gap: 3px;
}
.side-search kbd,
.top-search kbd {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--color-text-mid);
  background: var(--color-surface-3);
  border: 1px solid var(--color-border-subtle);
  border-radius: 4px;
  padding: 1px 4px;
  min-width: 16px;
  text-align: center;
}
.side-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.side-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-disabled);
  padding: 14px 10px 6px;
  font-weight: 500;
}
.side-link {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 450;
  text-align: left;
  text-decoration: none;
  background: transparent;
  cursor: pointer;
  position: relative;
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}
/* Keyboard focus: a subtle inset accent ring instead of the heavy global
   double-ring (which read as a stray outline on the active item). */
.side-link:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--accent-border);
}
.side-link .ic {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  opacity: 0.85;
}
.side-link:hover {
  color: var(--color-text-high);
  background: var(--color-surface-1);
}
.side-link.active {
  color: var(--color-text-high);
  background: var(--color-surface-2);
}
.side-link.active::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  background: var(--accent);
  border-radius: 0 3px 3px 0;
}
.side-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
}
.lang {
  display: flex;
  align-self: flex-start;
  margin-left: 4px;
  background: var(--color-surface-1);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-full);
  padding: 2px;
}
.lang button {
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  background: none;
  border: 0;
  padding: 3px 9px;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}
.lang button.on {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}
.side-user {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-hairline);
  background: var(--color-surface-1);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}
.side-user:hover {
  border-color: var(--color-border-subtle);
  background: var(--color-surface-2);
}
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-on-neon);
  background: var(--gradient-accent);
}
.avatar.guest {
  background: var(--color-surface-3);
  color: var(--color-text-mid);
}
.who {
  min-width: 0;
  font-size: 13px;
  color: var(--color-text-high);
  font-weight: 450;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.who small {
  display: block;
  color: var(--color-text-disabled);
  font-size: 11px;
  font-weight: 400;
}

/* ---------- Main ---------- */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.topbar {
  height: 56px;
  border-bottom: 1px solid var(--color-border-hairline);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 14px;
  position: sticky;
  top: 0;
  z-index: var(--z-header);
  background: color-mix(in srgb, var(--color-bg-base) 72%, transparent);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}
.crumb {
  font-size: 13px;
  color: var(--color-text-muted);
  font-weight: 450;
}
.burger {
  display: none;
  color: var(--color-text-mid);
  background: none;
  border: 0;
  cursor: pointer;
  padding: 4px;
}
.topbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.top-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color var(--dur) var(--ease-out);
}
.top-search:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text-mid);
}
.top-search .kk {
  display: flex;
  gap: 3px;
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.content {
  flex: 1;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 30px 28px 56px;
}

/* ---------- Footer ---------- */
.foot {
  border-top: 1px solid var(--color-border-hairline);
}
.foot-inner {
  max-width: 1180px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px 28px;
  font-size: 13px;
  color: var(--color-text-muted);
}
.foot-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.foot a {
  color: var(--color-text-mid);
  text-decoration: none;
  text-underline-offset: 2px;
}
.foot a:hover {
  color: var(--color-text-high);
  text-decoration: underline;
}

/* ---------- Mobile drawer ---------- */
.side-scrim {
  display: none;
}
@media (min-width: 768px) {
  .foot-inner {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
@media (max-width: 860px) {
  .side {
    position: fixed;
    left: 0;
    top: 0;
    z-index: var(--z-overlay);
    transform: translateX(-100%);
    transition: transform var(--dur-slow) var(--ease-out);
    box-shadow: var(--shadow-elev-3);
  }
  .side.open {
    transform: none;
  }
  .side-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-overlay) - 1);
    background: rgba(6, 6, 8, 0.5);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
  }
  .burger {
    display: grid;
    place-items: center;
  }
  .top-search span.kk {
    display: none;
  }
  .content {
    padding: 24px 18px 48px;
  }
}
</style>
