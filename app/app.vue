<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { libraryPath } from '#shared/game'
import { useCommandPalette } from '~/composables/useCommandPalette'
import { parseLocale } from '~/composables/useLocale'

// The Prism favicon as an inline SVG data URI (matches AppLogo): the red and
// gold facets on a dark tile, readable on light and dark tab bars alike.
const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">`
  + `<defs>`
  + `<linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EF6B5D"/><stop offset="1" stop-color="#B42A23"/></linearGradient>`
  + `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1D994"/><stop offset="1" stop-color="#B8903F"/></linearGradient>`
  + `</defs>`
  + `<rect width="40" height="40" rx="9" fill="#100D14"/>`
  + `<path d="M20 6 L20 34 L9 20 Z" fill="url(#r)"/>`
  + `<path d="M20 6 L31 20 L20 34 Z" fill="url(#g)"/>`
  + `<path d="M20 6 L20 34" stroke="#FFF8EC" stroke-width="1" opacity=".55"/>`
  + `</svg>`,
)}`

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  ],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: FAVICON },
  ],
})

const route = useRoute()
const { universe } = useUniverse()
const { locale, setLocale, t } = useLocale()

// A link can ask for a language (?lang=en): the hreflang alternates of the
// public pages point there. The choice is kept, so it is written even when the
// server already rendered the page in that language.
watch(() => route.query.lang, (lang) => {
  const l = parseLocale(lang)
  if (l)
    setLocale(l)
}, { immediate: true })

// Pages give their own title; the brand closes it. The home title is the
// brand line itself.
useSeoMeta({
  title: () => t('brand.title'),
  titleTemplate: (titleChunk?: string) =>
    titleChunk && titleChunk !== t('brand.title') ? `${titleChunk} · Prism` : t('brand.title'),
  description: () => t('brand.description'),
  ogSiteName: 'Prism',
})
const { loggedIn, user, logout } = useAuth()
const { show: openCmdK } = useCommandPalette()

// Light/dark — `preference` is what the user picked (system | light | dark);
// `value` is the resolved mode. The toggle flips between explicit light/dark.
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
// Browser chrome (mobile address bar) follows the active theme. The document
// language follows the site locale (reactive — switches with the FR/EN toggle).
// The universe re-themes the whole document (assets/css/universes.css).
const THEME_COLOR = { optcg: '#efdfc0', mtg: '#07060b' } as const
useHead({
  htmlAttrs: {
    'lang': () => locale.value,
    'data-universe': () => universe.value ?? undefined,
  },
  meta: [{
    name: 'theme-color',
    content: () => (universe.value ? THEME_COLOR[universe.value] : isDark.value ? '#0a0a0b' : '#fafafa'),
  }],
})

// Auth modal is driven by shared overlay state so the (chrome-less) landing page
// can open it too. `showAuth` is the v-model the AuthModal binds to.
const { open: showAuth, show: openAuth } = useAuthOverlay()
const mobileNav = ref(false)

// The app chrome (top bar + footer) is hidden only for the chrome-less, full-bleed
// marketing landing — a first-time guest on "/", or anyone visiting /landing on
// purpose to revisit/demo it — both bring their own minimal header. Everyone
// else — a guest already managing local decks, or a member — gets the real app
// chrome, including on the deck editor and shared-deck pages.
const { decks: guestDecks } = useDeckStore()
const isMarketingLanding = computed(() =>
  route.path === '/landing' || (!loggedIn.value && route.path === '/' && guestDecks.value.length === 0),
)
const showChrome = computed(() => !isMarketingLanding.value)

// A page can request a viewport-locked shell (no page scroll; the page fills the
// area below the top bar and manages its own internal scroll). The deck page
// uses this so the whole workspace + footer fit on one screen.
const appFullscreen = useState('app-fullscreen', () => false)

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
  { to: '/discover', label: t('nav.discover'), icon: 'i-lucide-compass' },
])

// The two worlds, always one click away. Inside a universe its library is
// the active entry; its decks live under it too.
const worlds = computed(() => [
  { game: 'optcg' as const, to: libraryPath('optcg'), label: 'One Piece' },
  { game: 'mtg' as const, to: libraryPath('mtg'), label: 'Magic' },
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
    <FxOnePieceSea v-if="universe === 'optcg'" />
    <FxMagicSanctum v-else-if="universe === 'mtg'" />
    <FxAppBackground v-else />

    <NuxtLoadingIndicator :height="2" color="rgb(var(--accent-rgb))" />

    <div class="app-shell" :class="{ 'app-shell--fullscreen': appFullscreen, 'app-shell--bare': !showChrome }" :style="{ zIndex: 'var(--z-content)' }">
      <a href="#content" class="sr-only">Aller au contenu</a>
      <!-- ============ HEADER (single top bar) — members only ============ -->
      <header v-if="showChrome" class="topbar">
        <div class="topbar-inner">
          <!-- Left: brand + primary nav -->
          <NuxtLink to="/" class="brand" @click="mobileNav = false">
            <AppLogo />
          </NuxtLink>

          <nav class="nav">
            <NuxtLink
              v-for="item in nav"
              :key="item.to"
              :to="item.to"
              class="nav-link"
              :class="{ active: isActive(item.to) }"
              @click="mobileNav = false"
            >
              <UIcon :name="item.icon" class="ic" />
              <span>{{ item.label }}</span>
            </NuxtLink>
            <button type="button" class="nav-link" @click="openImport">
              <UIcon name="i-lucide-download" class="ic" />
              <span>{{ t('nav.import') }}</span>
            </button>
          </nav>

          <!-- the two worlds -->
          <nav class="worlds" :aria-label="t('nav.worlds')">
            <NuxtLink
              v-for="w in worlds"
              :key="w.game"
              :to="w.to"
              class="world"
              :class="[`world--${w.game}`, { on: universe === w.game }]"
              :aria-current="universe === w.game ? 'page' : undefined"
            >
              {{ w.label }}
            </NuxtLink>
          </nav>

          <!-- page-specific actions injected here by the active page -->
          <div id="topbar-actions" class="topbar-actions" />

          <!-- Right: global controls (search · lang · theme · account) -->
          <div class="topbar-right">
            <button type="button" class="top-search" :aria-label="t('nav.search')" @click="openCmdK()">
              <UIcon name="i-lucide-search" class="h-[15px] w-[15px]" />
              <span class="ph">{{ t('nav.search') }}</span>
              <span class="kk"><kbd>⌘</kbd><kbd>K</kbd></span>
            </button>

            <div class="lang">
              <button :class="{ on: locale === 'fr' }" aria-label="Français" @click="setLocale('fr')">
                FR
              </button>
              <button :class="{ on: locale === 'en' }" aria-label="English" @click="setLocale('en')">
                EN
              </button>
            </div>

            <!-- A universe sets its own light: One Piece by day, Magic by night. -->
            <ClientOnly v-if="!universe">
              <button
                type="button"
                class="icon-btn"
                :aria-label="isDark ? t('theme.toLight') : t('theme.toDark')"
                @click="toggleTheme"
              >
                <UIcon :name="isDark ? 'i-lucide-moon' : 'i-lucide-sun'" class="h-[18px] w-[18px]" />
              </button>
              <template #fallback>
                <span class="icon-btn" />
              </template>
            </ClientOnly>

            <UDropdownMenu v-if="loggedIn" :items="userMenu">
              <button type="button" class="acct" :aria-label="t('auth.account')">
                <span class="avatar">{{ initials }}</span>
                <span class="who">{{ user?.displayName }}</span>
              </button>
            </UDropdownMenu>
            <button v-else type="button" class="acct guest" @click="openAuth('login')">
              <UIcon name="i-lucide-log-in" class="h-4 w-4" />
              <span class="who">{{ t('auth.login') }}</span>
            </button>

            <!-- mobile: toggle the nav row -->
            <button type="button" class="burger" :aria-label="t('nav.decks')" @click="mobileNav = !mobileNav">
              <UIcon :name="mobileNav ? 'i-lucide-x' : 'i-lucide-menu'" class="h-5 w-5" />
            </button>
          </div>
        </div>

        <!-- mobile nav row (collapses below the bar) -->
        <nav v-if="mobileNav" class="nav-mobile">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="nav-link"
            :class="{ active: isActive(item.to) }"
            @click="mobileNav = false"
          >
            <UIcon :name="item.icon" class="ic" />
            <span>{{ item.label }}</span>
          </NuxtLink>
          <button type="button" class="nav-link" @click="openImport">
            <UIcon name="i-lucide-download" class="ic" />
            <span>{{ t('nav.import') }}</span>
          </button>
        </nav>
      </header>

      <!-- ============ MAIN ============ -->
      <main id="content" class="content">
        <NuxtPage />
      </main>

      <footer v-if="showChrome" class="foot">
        <div class="foot-inner">
          <div class="foot-brand">
            <AppLogo :wordmark="false" :size="20" />
            <span>{{ universe === 'optcg' ? t('footer.taglineOp') : t('footer.tagline') }}</span>
          </div>
          <p v-if="universe !== 'optcg'">
            {{ t('footer.dataVia') }}
            <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>
            • {{ t('footer.importsVia') }}
            <a href="https://edhrec.com" target="_blank" rel="noopener">EDHREC</a>
            • {{ t('footer.wotc') }}
          </p>
          <p v-if="universe !== 'mtg'">
            {{ t('footer.bandai') }}
          </p>
        </div>
      </footer>
    </div>

    <AuthModal v-model:open="showAuth" />
    <CommandPalette />
  </UApp>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
/* Chrome-less mode (landing for guests): the page IS the whole viewport — no top
   bar / footer, the content area carries everything full-bleed. Override the
   members' content frame (max-width 1720 + padding + auto margins) so the landing
   truly spans edge to edge on any screen width. */
.app-shell--bare .content {
  flex: 1;
  min-height: 100dvh;
  max-width: none;
  margin: 0;
  padding: 0;
}
/* Viewport-locked mode (deck page): the whole shell is exactly one screen — the
   page fills the space below the top bar and scrolls internally, the footer
   stays pinned at the bottom, and there's no page scroll. */
.app-shell--fullscreen {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}
.app-shell--fullscreen .content {
  min-height: 0;
  overflow: hidden;
  padding-bottom: 16px;
}
.app-shell--fullscreen .foot {
  flex-shrink: 0;
}
.app-shell--fullscreen .foot-inner {
  padding-top: 12px;
  padding-bottom: 12px;
}
/* On small screens the deck workspace stacks and needs natural page flow — don't
   trap it in a locked viewport. */
@media (max-width: 1023px) {
  .app-shell--fullscreen {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }
  .app-shell--fullscreen .content {
    overflow: visible;
  }
}

/* ---------- Header (single top bar) ---------- */
.topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-header);
  border-bottom: 1px solid var(--color-border-hairline);
  background: color-mix(in srgb, var(--color-bg-base) 78%, transparent);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}
.topbar-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 20px;
  max-width: 1880px;
  margin: 0 auto;
}
.brand {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 4px;
  border-radius: var(--radius-sm);
}

/* the two worlds: each pill wears its own universe, even outside it */
.worlds {
  display: flex;
  gap: 4px;
  margin-left: 8px;
  padding: 3px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-sm);
}
.world {
  padding: 4px 11px;
  border-radius: calc(var(--radius-sm) - 1px);
  font-size: 12.5px;
  color: var(--color-text-muted);
  text-decoration: none;
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
.world:hover {
  color: var(--color-text-high);
  transform: translateY(-1px);
}
.world--optcg {
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.world--mtg {
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.world--optcg.on {
  color: #fff8ec;
  background: #c9312a;
}
.world--mtg.on {
  color: #100c06;
  background: #d4af5f;
}
@media (max-width: 720px) {
  .worlds {
    margin-left: 4px;
  }
  .world {
    padding: 4px 8px;
  }
}

/* primary nav (destinations) */
.nav {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 450;
  text-decoration: none;
  background: transparent;
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}
.nav-link:hover {
  color: var(--color-text-high);
  background: var(--color-surface-1);
}
.nav-link.active {
  color: var(--color-text-high);
  background: var(--color-surface-2);
}
.nav-link:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--accent-border);
}
.nav-link .ic {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.85;
}

/* page-specific action slot, sits between nav and global controls */
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 4px;
}

/* right cluster: search · lang · theme · account */
.topbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.top-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  color: var(--color-text-muted);
  font-size: 13px;
  cursor: pointer;
  transition:
    border-color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}
.top-search:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
  color: var(--color-text-mid);
}
.top-search .ph {
  min-width: 84px;
  text-align: left;
}
.top-search .kk {
  display: flex;
  gap: 3px;
}
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

.lang {
  display: flex;
  background: var(--color-surface-1);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-full);
  padding: 2px;
  flex-shrink: 0;
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

.icon-btn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface-1);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.icon-btn:hover {
  color: var(--color-text-high);
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
}

.acct {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 11px 4px 4px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-full);
  background: var(--color-surface-1);
  color: var(--color-text-mid);
  font-size: 12.5px;
  font-weight: 450;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    border-color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}
.acct.guest {
  padding: 7px 13px;
  color: var(--color-text-mid);
}
.acct:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
  color: var(--color-text-high);
}
.acct .avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-on-neon);
  background: var(--gradient-accent);
}
.acct .who {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.burger {
  display: none;
  color: var(--color-text-mid);
  background: none;
  border: 0;
  cursor: pointer;
  padding: 4px;
}
.nav-mobile {
  display: none;
}

/* ---------- Main ---------- */
.content {
  flex: 1;
  width: 100%;
  max-width: 1720px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

/* ---------- Footer ---------- */
.foot {
  border-top: 1px solid var(--color-border-hairline);
}
.foot-inner {
  max-width: 1720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px 16px;
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

@media (min-width: 768px) {
  .foot-inner {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

/* ---------- Mobile ---------- */
@media (max-width: 820px) {
  .nav {
    display: none;
  }
  .top-search .ph,
  .top-search .kk {
    display: none;
  }
  .top-search {
    padding: 8px;
  }
  .acct .who {
    display: none;
  }
  .acct {
    padding: 4px;
  }
  .acct.guest {
    padding: 8px;
  }
  .burger {
    display: grid;
    place-items: center;
  }
  .nav-mobile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px 12px;
    border-top: 1px solid var(--color-border-hairline);
  }
  .content {
    padding: 22px 16px 48px;
  }
}
</style>
