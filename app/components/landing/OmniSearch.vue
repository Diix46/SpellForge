<script setup lang="ts">
import type { LandingSearch } from '#shared/landing'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

// One field for both games. The field sits on the seam; One Piece results
// land on the paper side, Magic results on the obsidian side. A first query is
// rendered with the page so the section is never empty.
const { t, locale } = useLocale()

const SUGGESTIONS = ['Luffy', 'Sol Ring', 'Zoro', 'Atraxa', 'Shanks', 'Dragon']
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
  default: () => ({ optcg: [], mtg: [] }),
})
const busy = computed(() => status.value === 'pending')
const optcg = computed(() => data.value?.optcg ?? [])
const mtg = computed(() => data.value?.mtg ?? [])
const searched = computed(() => query.value.length >= 2)

function pick(s: string) {
  text.value = s
  query.value = s
}
</script>

<template>
  <section class="search">
    <header class="head">
      <p class="kicker">
        {{ t('home.search.kicker') }}
      </p>
      <h2 class="title">
        <span class="ink ink--op" aria-hidden="true">{{ t('home.search.title') }}</span>
        <span class="ink ink--mtg">{{ t('home.search.title') }}</span>
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
      <ul class="col col--op" aria-label="One Piece">
        <li v-for="(hit, i) in optcg" :key="hit.id" :style="{ '--i': i }">
          <NuxtLink :to="hit.path" class="hit">
            <img v-if="hit.image" :src="hit.image" :alt="hit.name" loading="lazy" width="600" height="838">
            <span class="hit-name">{{ hit.name }}</span>
            <span class="hit-meta">{{ hit.meta }}</span>
          </NuxtLink>
        </li>
        <li v-if="searched && !optcg.length && !busy" class="none">
          {{ t('home.search.none') }}
        </li>
      </ul>
      <ul class="col col--mtg" aria-label="Magic">
        <li v-for="(hit, i) in mtg" :key="hit.id" :style="{ '--i': i }">
          <NuxtLink :to="hit.path" class="hit">
            <img v-if="hit.image" :src="hit.image" :alt="hit.name" loading="lazy" width="488" height="680">
            <span class="hit-name">{{ hit.name }}</span>
            <span class="hit-meta">{{ hit.meta }}</span>
          </NuxtLink>
        </li>
        <li v-if="searched && !mtg.length && !busy" class="none">
          {{ t('home.search.none') }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.search {
  position: relative;
  background: linear-gradient(90deg, #f3e6c9 50%, #0b0910 50%);
}
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 96px 20px 40px;
  text-align: center;
}
.kicker {
  margin: 0;
  padding: 3px 10px;
  border-radius: 999px;
  background: #100d14;
  color: #f1d994;
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.title {
  display: grid;
  width: 100%;
  margin: 0;
  font-family: 'Anton', Impact, sans-serif;
  font-size: clamp(40px, 6vw, 88px);
  font-weight: 400;
  line-height: 0.95;
  text-transform: uppercase;
}
.ink {
  grid-area: 1 / 1;
}
.ink--op {
  clip-path: inset(-20% 50% -20% 0);
  color: #231708;
  text-shadow: 0.04em 0.04em 0 #c9312a;
}
.ink--mtg {
  clip-path: inset(-20% 0 -20% 50%);
  background: linear-gradient(180deg, #fff3cf, #c9a24e);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.sub {
  max-width: 520px;
  margin: 0;
  padding: 10px 18px;
  border-radius: 8px;
  background: rgba(16, 13, 20, 0.88);
  color: #efe6d0;
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
    linear-gradient(#fffaf0, #fffaf0) padding-box,
    linear-gradient(90deg, #c9312a, #c9a24e) border-box;
  box-shadow: 0 24px 50px -24px rgba(0, 0, 0, 0.7);
}
.field input {
  flex: 1;
  min-width: 0;
  padding: 18px 48px 18px 52px;
  border: 0;
  background: transparent;
  color: #231708;
  font-size: 19px;
  outline: none;
}
.field input::placeholder {
  color: #9b8567;
}
.field:focus-within {
  box-shadow:
    0 0 0 4px rgba(201, 162, 78, 0.35),
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
  color: #8a6a3a;
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
  border-radius: 6px;
  background: rgba(16, 13, 20, 0.88);
  color: #b9ac8e;
}
.try button {
  padding: 4px 11px;
  border: 1px solid rgba(201, 162, 78, 0.45);
  border-radius: 999px;
  background: rgba(16, 13, 20, 0.88);
  color: #f3ecda;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
}
.try button:hover {
  border-color: #f1d994;
  transform: translateY(-1px);
}
.try button:focus-visible {
  outline: 2px solid #f1d994;
  outline-offset: 2px;
}

.results {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 10px 0 100px;
  transition: opacity 0.2s ease;
}
.results.busy {
  opacity: 0.6;
}
.col {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px 16px;
  align-content: start;
  width: 100%;
  max-width: 560px;
  margin: 0;
  padding: 10px clamp(16px, 4vw, 56px);
  list-style: none;
}
/* each column hugs the seam */
.col--op {
  justify-self: end;
}
.col--mtg {
  justify-self: start;
}
.col li {
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
  text-decoration: none;
}
.hit img {
  display: block;
  width: 100%;
  height: auto;
  transition:
    transform 0.35s cubic-bezier(0.3, 1.5, 0.5, 1),
    box-shadow 0.35s ease;
}
.hit-name {
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.hit-meta {
  overflow: hidden;
  font-size: 11.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.hit:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 4px;
}
.col--op .hit {
  color: #231708;
}
.col--op .hit img {
  padding: 5px;
  border: 1px solid rgba(58, 38, 22, 0.35);
  background: #fbf3e3;
  box-shadow: 0 12px 22px -14px rgba(58, 38, 22, 0.7);
}
.col--op li:nth-child(odd) .hit img {
  rotate: -1.4deg;
}
.col--op li:nth-child(even) .hit img {
  rotate: 1.2deg;
}
.col--op .hit:hover img {
  transform: translateY(-4px) rotate(0.8deg) scale(1.02);
}
.col--op .hit-meta {
  font-family: var(--font-mono);
  color: #6b5236;
}
.col--mtg .hit {
  color: #f3ecda;
}
.col--mtg .hit img {
  border-radius: 4.5% / 3.2%;
  box-shadow:
    0 0 0 1px rgba(201, 162, 78, 0.3),
    0 18px 34px -18px rgba(0, 0, 0, 0.9);
}
.col--mtg .hit:hover img {
  transform: translateY(-4px);
  box-shadow:
    0 0 0 1px rgba(201, 162, 78, 0.7),
    0 22px 40px -16px rgba(201, 162, 78, 0.4);
}
.col--mtg .hit-name {
  font-family: var(--mtg-face);
}
.col--mtg .hit-meta {
  font-family: var(--mtg-face);
  font-size: 13px;
  color: #a3afac;
}
.results {
  justify-items: stretch;
}
.none {
  grid-column: 1 / -1;
  padding: 28px 0;
  font-size: 14px;
  text-align: center;
  animation: none !important;
}
.col--op .none {
  color: #6b5236;
}
.col--mtg .none {
  color: #b3a68a;
}
@media (max-width: 900px) {
  .search {
    background:
      linear-gradient(90deg, #f3e6c9 50%, #0b0910 50%) top / 100% 480px no-repeat,
      #0b0910;
  }
  .results {
    grid-template-columns: 1fr;
    padding-bottom: 0;
  }
  .col {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding-block: 24px;
  }
  .col--op,
  .col--mtg {
    justify-self: stretch;
    max-width: none;
  }
  .col--op {
    background: #f3e6c9;
  }
  .col--mtg {
    background: #0b0910;
  }
}
@media (prefers-reduced-motion: reduce) {
  .col li {
    animation: none;
  }
  .hit img {
    transition: none;
  }
}
</style>
