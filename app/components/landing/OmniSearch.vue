<script setup lang="ts">
import type { LandingSearch } from '#shared/landing'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { GAME_LIST, libraryPath } from '#shared/game'

// One field for every game: the results come back world by world, a row
// each, in its colour. A first query is rendered with the page so the section
// is never empty.
const { t, locale } = useLocale()

const SUGGESTIONS = ['Dragon', 'Luffy', 'Sol Ring', 'Pikachu', 'Magicien Sombre', 'Jinx']
const text = ref('Dragon')
const query = ref(text.value)

let debounce: ReturnType<typeof setTimeout> | null = null
watch(text, (v) => {
  if (debounce)
    clearTimeout(debounce)
  debounce = setTimeout(() => (query.value = v.trim()), 220)
})
onBeforeUnmount(() => debounce && clearTimeout(debounce))

const { data, status } = useFetch<LandingSearch>('/api/landing/search', {
  query: computed(() => ({ q: query.value, lang: locale.value })),
  default: () => ({}),
})
const busy = computed(() => status.value === 'pending')
const searched = computed(() => query.value.length >= 2)
// Every world in display order; one without a hit says so in a line.
const rows = computed(() => GAME_LIST.map(g => ({ def: g, hits: data.value?.[g.id] ?? [] })))

function pick(s: string) {
  text.value = s
  query.value = s
}
</script>

<template>
  <section id="search" class="search">
    <header class="head">
      <p class="kicker">
        {{ t('home.search.kicker') }}
      </p>
      <h2 class="title">
        {{ t('home.search.title') }}
      </h2>
      <p class="sub">
        {{ t('home.search.sub') }}
      </p>
      <form class="field" role="search" @submit.prevent="query = text.trim()">
        <UIcon name="i-lucide-search" class="field-icon" />
        <input
          id="landing-search"
          v-model="text"
          type="search"
          name="q"
          autocomplete="off"
          :aria-label="t('home.search.label')"
          :placeholder="t('home.search.placeholder')"
        >
        <UIcon v-if="busy" name="i-lucide-loader-circle" class="field-busy animate-spin" />
      </form>
      <p class="try">
        <span>{{ t('home.search.try') }}</span>
        <button v-for="s in SUGGESTIONS" :key="s" type="button" @click="pick(s)">
          {{ s }}
        </button>
      </p>
    </header>

    <div class="results" :class="{ busy }">
      <section v-for="row in rows" :key="row.def.id" class="row" :style="{ '--swatch': row.def.swatch }" :aria-label="row.def.label">
        <header class="row-head">
          <UIcon :name="row.def.icon" class="h-4 w-4" />
          <span>{{ row.def.label }}</span>
          <NuxtLink v-if="row.hits.length" :to="`${libraryPath(row.def.id)}?q=${encodeURIComponent(query)}`" class="row-all">
            {{ t('home.search.all') }}
          </NuxtLink>
        </header>
        <ul v-if="row.hits.length" class="hits">
          <li v-for="(hit, i) in row.hits" :key="hit.id" :style="{ '--i': i }">
            <NuxtLink :to="hit.path" class="hit">
              <img v-if="hit.image" :src="hit.image" :alt="hit.name" loading="lazy">
              <span class="hit-name">{{ hit.name }}</span>
              <span class="hit-meta">{{ hit.meta }}</span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else-if="searched && !busy" class="none">
          {{ t('home.search.none') }}
        </p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.search {
  position: relative;
  background: var(--l-bg-2);
}
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: var(--l-section) var(--l-gutter) var(--l-head-gap);
  text-align: center;
}
.kicker {
  margin: 0;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--l-chip);
  color: var(--l-chip-ink);
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.title {
  margin: 0;
  font-family: 'Anton', Impact, sans-serif;
  font-size: clamp(40px, 6vw, 88px);
  font-weight: 400;
  line-height: 0.95;
  text-transform: uppercase;
  /* The five worlds' colours, as the prism in the hero spreads them. */
  background: linear-gradient(90deg, #c9312a, #d09a16, #6b3fa0, #1f8a9a, #2d4f7c);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.sub {
  max-width: 520px;
  margin: 0;
  padding: 10px 18px;
  border-radius: 8px;
  background: var(--l-panel);
  color: var(--l-ink);
  font-size: 15px;
  line-height: 1.5;
  text-wrap: balance;
}
.field {
  position: relative;
  display: flex;
  align-items: center;
  width: min(620px, 100%);
  margin-top: 12px;
  border: 2px solid transparent;
  border-radius: 14px;
  background:
    linear-gradient(var(--l-panel), var(--l-panel)) padding-box,
    linear-gradient(90deg, #c9312a, #e3b22b, #6b3fa0, #1f8a9a, #2d4f7c) border-box;
  box-shadow: 0 24px 50px -24px rgba(0, 0, 0, 0.7);
}
.field input {
  flex: 1;
  min-width: 0;
  padding: 18px 48px 18px 52px;
  border: 0;
  background: transparent;
  color: var(--l-ink);
  font-size: 19px;
  outline: none;
}
.field input::placeholder {
  color: var(--l-muted);
}
.field input:focus-visible {
  /* The field shows the focus, around its rainbow edge. */
  outline: none;
  box-shadow: none;
}
.field:focus-within {
  box-shadow:
    0 0 0 3px var(--l-bg),
    0 0 0 5px color-mix(in srgb, var(--l-ink) 55%, transparent),
    0 24px 50px -24px rgba(0, 0, 0, 0.7);
}
.field-icon {
  position: absolute;
  left: 18px;
  width: 20px;
  height: 20px;
  color: #a4231d;
}
.field-busy {
  position: absolute;
  right: 18px;
  width: 18px;
  height: 18px;
  color: var(--l-muted);
}
.try {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
}
.try span {
  padding: 4px 8px;
  color: var(--l-mid);
}
.try button {
  padding: 4px 11px;
  border: 1px solid var(--l-line);
  border-radius: 999px;
  background: var(--l-panel);
  color: var(--l-ink);
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
}
.try button:hover {
  border-color: var(--l-ink);
}
.try button:focus-visible {
  outline: 2px solid var(--l-ink);
  outline-offset: 2px;
}

.results {
  display: grid;
  gap: 26px;
  max-width: calc(var(--l-width) + var(--l-gutter) * 2);
  margin: 0 auto;
  padding: 10px var(--l-gutter) var(--l-section);
  transition: opacity 0.2s ease;
}
.results.busy {
  opacity: 0.6;
}
.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 2px solid color-mix(in srgb, var(--swatch) 55%, transparent);
  font-size: 14px;
  font-weight: 700;
  color: var(--l-ink);
}
.row-head .iconify {
  color: var(--swatch);
}
.row-all {
  margin-left: auto;
  font-size: 12.5px;
  font-weight: 400;
  color: var(--l-mid);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.hits {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.hits li {
  min-width: 0;
  animation: pop 0.45s cubic-bezier(0.3, 1.4, 0.5, 1) both;
  animation-delay: calc(var(--i) * 45ms);
}
@keyframes pop {
  from {
    opacity: 0.2;
    transform: translateY(10px) scale(0.97);
  }
}
.hit {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--l-ink);
  text-decoration: none;
}
.hit img {
  display: block;
  width: 100%;
  aspect-ratio: 63 / 88;
  object-fit: cover;
  border-radius: 4.5% / 3.2%;
  background: var(--l-empty);
  box-shadow:
    0 0 0 1px var(--l-line),
    0 16px 30px -18px rgba(0, 0, 0, 0.8);
  transition:
    transform 0.35s cubic-bezier(0.3, 1.5, 0.5, 1),
    box-shadow 0.35s ease;
}
.hit-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.hit-meta {
  overflow: hidden;
  font-size: 11.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--l-muted);
}
.hit:focus-visible {
  outline: 2px solid var(--swatch);
  outline-offset: 4px;
}
.none {
  margin: 0;
  font-size: 13.5px;
  color: var(--l-muted);
}
@media (max-width: 900px) {
  .hits {
    grid-template-columns: repeat(6, 42%);
    overflow-x: auto;
    padding-bottom: 6px;
    scroll-snap-type: x mandatory;
  }
  .hits li {
    scroll-snap-align: start;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hits li {
    animation: none;
  }
  .hit img {
    transition: none;
  }
}
</style>
