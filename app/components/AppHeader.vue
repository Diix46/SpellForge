<script setup lang="ts">
import { computed, ref } from 'vue'
import { GAME_LIST, libraryPath } from '#shared/game'
import { useCommandPalette } from '~/composables/useCommandPalette'
import { forcedModeOf } from '~/utils/universeMode'

// The one top bar, on every page and on the error page: the brand, the
// primary nav and the libraries, the page's own actions (#topbar-actions),
// then search, language, theme, alerts and account; a menu on a phone.
const route = useRoute()
const { universe } = useUniverse()
const { locale, setLocale, t } = useLocale()
const { loggedIn, user, logout } = useAuth()
const { show: openCmdK } = useCommandPalette()
const { show: openAuth } = useAuthOverlay()

// Light/dark — the toggle flips between explicit light and dark; Yu-Gi-Oh
// and Riftbound are always at night (utils/universeMode).
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
const forcedMode = computed(() => forcedModeOf(universe.value))

const mobileNav = ref(false)

const userMenu = computed(() => [[
  { label: user.value?.displayName ?? t('auth.account'), type: 'label' as const },
  { label: t('account.menu'), icon: 'i-lucide-user-cog', to: '/account' },
  { label: t('auth.logout'), icon: 'i-lucide-log-out', onSelect: () => logout() },
]])

const initials = computed(() => {
  const n = user.value?.displayName?.trim()
  if (!n)
    return '·'
  return n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
})

// Primary nav — real destinations only (these get the active state).
const { preferred: favoriteGame } = useFavoriteGame()
const nav = computed(() => [
  { to: '/decks', label: t('nav.myDecks'), icon: 'i-lucide-layout-grid' },
  // The collection of the game on screen (the favourite one elsewhere).
  { to: collectionPath(universe.value ?? favoriteGame.value), label: t('nav.collection'), icon: 'i-lucide-gem' },
  { to: '/discover', label: t('nav.discover'), icon: 'i-lucide-compass' },
])

// The libraries, in the phone's menu (the bar has "Libraries ▾").
const libraries = GAME_LIST.map(g => ({ game: g.id, to: libraryPath(g.id), label: g.label }))

// A nav link is active on its own route and under it (a game's collection
// has its tabs and binders, "My decks" every deck page); the query of a
// transient ?import/?new modal does not count.
function isActive(to: string) {
  if (route.path === to)
    return true
  if (to.endsWith('/collection'))
    return route.path.startsWith(`${to}/`)
  if (to === '/decks')
    return /\/deck\//.test(route.path)
  return false
}
</script>

<template>
  <header class="topbar">
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
        <!-- every game's library, in a list -->
        <GameSwitcher />
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

        <div class="lang lang--bar">
          <button :class="{ on: locale === 'fr' }" aria-label="Français" @click="setLocale('fr')">
            FR
          </button>
          <button :class="{ on: locale === 'en' }" aria-label="English" @click="setLocale('en')">
            EN
          </button>
        </div>

        <ClientOnly>
          <button
            type="button"
            class="icon-btn theme-bar"
            :aria-label="isDark ? t('theme.toLight') : t('theme.toDark')"
            :disabled="!!forcedMode"
            :title="forcedMode ? t('theme.forced') : undefined"
            @click="toggleTheme"
          >
            <UIcon :name="isDark ? 'i-lucide-moon' : 'i-lucide-sun'" class="h-[18px] w-[18px]" />
          </button>
          <template #fallback>
            <span class="icon-btn" />
          </template>
        </ClientOnly>

        <!-- Price alerts: wished cards under their price. -->
        <ClientOnly>
          <DealsBell v-if="loggedIn" />
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
        <button type="button" class="burger" :aria-label="t('home.nav.menu')" :aria-expanded="mobileNav" @click="mobileNav = !mobileNav">
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
      <NuxtLink
        v-for="g in libraries"
        :key="g.to"
        :to="g.to"
        class="nav-link"
        :class="{ active: universe === g.game }"
        @click="mobileNav = false"
      >
        <UIcon name="i-lucide-library" class="ic" />
        <span>{{ g.label }}</span>
      </NuxtLink>
      <ClientOnly>
        <InstallApp />
      </ClientOnly>
      <!-- on a phone the bar has no room left for these -->
      <div class="nav-mobile-tools">
        <div class="lang">
          <button :class="{ on: locale === 'fr' }" aria-label="Français" @click="setLocale('fr')">
            FR
          </button>
          <button :class="{ on: locale === 'en' }" aria-label="English" @click="setLocale('en')">
            EN
          </button>
        </div>
        <button
          type="button"
          class="icon-btn"
          :aria-label="isDark ? t('theme.toLight') : t('theme.toDark')"
          :disabled="!!forcedMode"
          :title="forcedMode ? t('theme.forced') : undefined"
          @click="toggleTheme"
        >
          <UIcon :name="isDark ? 'i-lucide-moon' : 'i-lucide-sun'" class="h-[18px] w-[18px]" />
        </button>
      </div>
    </nav>
  </header>
</template>

<style scoped>
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
  padding: 0 var(--gutter);
  max-width: var(--shell-max);
  margin: 0 auto;
}
.brand {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 4px;
  border-radius: var(--radius-sm);
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
  height: var(--control-h);
  padding: 0 8px 0 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-full);
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
  align-items: center;
  height: var(--control-h);
  background: var(--color-surface-1);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-full);
  padding: 2px;
  flex-shrink: 0;
}
.lang button {
  height: 100%;
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

.acct {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--control-h);
  padding: 0 11px 0 3px;
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
  padding: 0 13px;
}
.acct:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
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
.nav-mobile,
.nav-mobile-tools {
  display: none;
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
  /* Round, like the other controls. */
  .top-search,
  .acct,
  .acct.guest {
    justify-content: center;
    width: var(--control-h);
    padding: 0;
  }
  .acct .who {
    display: none;
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
}
@media (max-width: 720px) {
  .lang--bar,
  .theme-bar {
    display: none;
  }
  .nav-mobile-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 11px 2px;
  }
}
@media (max-width: 480px) {
  .brand :deep(svg + span) {
    display: none;
  }
}
</style>
