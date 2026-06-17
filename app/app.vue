<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// Mana Prism favicon as an inline SVG data URI (matches AppLogo).
const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">`
  + `<defs>`
  + `<linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%237DEEFF"/><stop offset="1" stop-color="%2306C7E6"/></linearGradient>`
  + `<linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%23C8D0E0"/><stop offset="1" stop-color="%238A93A6"/></linearGradient>`
  + `</defs>`
  + `<rect width="40" height="40" rx="9" fill="%2307080C"/>`
  + `<path d="M20 6 L20 34 L9 20 Z" fill="url(%23c)"/>`
  + `<path d="M20 6 L31 20 L20 34 Z" fill="url(%23m)"/>`
  + `<path d="M20 6 L20 34" stroke="%23FFFFFF" stroke-width="1" opacity=".4"/>`
  + `</svg>`,
)}`

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: '#07080C' },
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

const { locale, setLocale, t } = useLocale()

const scrolled = ref(false)
function onScroll() {
  scrolled.value = window.scrollY > 10
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <UApp>
    <FxAppBackground />

    <!-- Route loading bar (accent) -->
    <NuxtLoadingIndicator
      :height="2"
      color="rgb(var(--accent-rgb))"
    />

    <div
      class="relative flex min-h-screen flex-col"
      :style="{ zIndex: 'var(--z-content)' }"
    >
      <!-- HEADER -->
      <header
        class="glass-strong sticky top-0 transition-all duration-300"
        :style="{ zIndex: 'var(--z-header)' }"
        :class="scrolled ? 'border-b border-(--color-border-strong)' : 'border-b border-(--color-border-subtle)'"
      >
        <div class="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6 md:px-8">
          <NuxtLink
            to="/"
            class="transition-transform hover:scale-[1.02]"
          >
            <AppLogo />
          </NuxtLink>

          <div class="flex items-center gap-2">
            <UButton
              to="/"
              variant="ghost"
              color="neutral"
              class="hidden sm:inline-flex text-(--color-text-mid) hover:text-(--color-text-high)"
            >
              {{ t('nav.decks') }}
            </UButton>

            <!-- Language switcher -->
            <div class="flex items-center rounded-full border border-(--color-border-subtle) bg-(--color-surface-1) p-0.5 text-xs font-semibold">
              <button
                class="rounded-full px-2.5 py-1 transition-colors"
                :class="locale === 'fr' ? 'bg-(--color-surface-3) text-(--color-text-high)' : 'text-(--color-text-muted) hover:text-(--color-text-mid)'"
                aria-label="Français"
                @click="setLocale('fr')"
              >
                FR
              </button>
              <button
                class="rounded-full px-2.5 py-1 transition-colors"
                :class="locale === 'en' ? 'bg-(--color-surface-3) text-(--color-text-high)' : 'text-(--color-text-muted) hover:text-(--color-text-mid)'"
                aria-label="English"
                @click="setLocale('en')"
              >
                EN
              </button>
            </div>

            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="solid"
              class="font-medium tracking-wide"
              @click="$router.push('/?new=1')"
            >
              <span class="hidden sm:inline">{{ t('nav.newDeck') }}</span>
            </UButton>
          </div>
        </div>
      </header>

      <!-- MAIN -->
      <main class="mx-auto w-full max-w-[1400px] flex-1 px-6 py-10 md:px-8">
        <NuxtPage />
      </main>

      <!-- FOOTER -->
      <footer class="glass mt-12 border-t border-(--color-border-subtle)">
        <div class="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-4 px-6 py-6 text-sm text-(--color-text-muted) md:flex-row md:px-8">
          <div class="flex items-center gap-2.5 opacity-70">
            <AppLogo
              :wordmark="false"
              :size="22"
            />
            <span>{{ t('footer.tagline') }}</span>
          </div>
          <p>
            {{ t('footer.dataVia') }}
            <a
              href="https://scryfall.com"
              target="_blank"
              class="text-(--color-text-mid) underline-offset-2 hover:text-(--color-text-high) hover:underline"
            >Scryfall</a>
            • {{ t('footer.importsVia') }}
            <a
              href="https://edhrec.com"
              target="_blank"
              class="text-(--color-text-mid) underline-offset-2 hover:text-(--color-text-high) hover:underline"
            >EDHREC</a>
          </p>
        </div>
      </footer>
    </div>
  </UApp>
</template>
