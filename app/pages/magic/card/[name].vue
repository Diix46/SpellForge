<script setup lang="ts">
import type { ResolvedRow } from '~/composables/scryfall/toResolved'
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed, ref } from 'vue'
import { deckPath } from '#shared/game'
import { toResolved } from '~/composables/scryfall/toResolved'
import { useCardmarket } from '~/composables/useCardmarket'
import { displayName, displayOracle, displayType, isCommanderType } from '~/composables/useMtg'
import { useOracleText } from '~/composables/useOracleText'
import { mtgRaw } from '~/composables/useScryfall'

// One Magic card, on its own page: rendered by the server so it can be found
// and shared. Addressed by its English name, in the site language's printing.
definePageMeta({ universe: 'mtg', colorMode: 'dark' })

const route = useRoute()
const { t, locale, isFr, rarityLabel } = useLocale()
const { createDeck } = useDeckStore()
const { searchUrl } = useCardmarket()

const name = computed(() => String(route.params.name))

// useRequestFetch: on the server, the request carries the viewer's cookies
// (the recomposed / official scans choice among them).
const requestFetch = useRequestFetch()
const { data, error } = await useAsyncData(
  () => `mtg-card-${name.value}-${locale.value}`,
  async (): Promise<ResolvedCard | null> => {
    try {
      const { cards } = await requestFetch<{ cards: ResolvedRow[] }>('/api/cards/resolve', {
        method: 'POST',
        body: { lang: locale.value, entries: [{ name: name.value }] },
      })
      const resolved = toResolved({ quantity: 1, name: name.value }, cards[0], locale.value)
      return resolved.card ? resolved : null
    }
    catch (err) {
      // An empty name is refused by the route: there is no such card.
      if (fetchStatus(err) === 400)
        return null
      throw err
    }
  },
  { watch: [locale] },
)
if (error.value)
  unavailable(error.value)

const resolved = computed(() => data.value ?? null)
const c = computed(() => mtgRaw(resolved.value?.card))

if (import.meta.server && !c.value)
  setResponseStatus(useRequestEvent()!, 404)

const showBack = ref(false)
const face = computed(() => (resolved.value?.backImageUrl && c.value?.card_faces ? c.value.card_faces[showBack.value ? 1 : 0] : null))
const image = computed(() => (showBack.value ? resolved.value?.backImageUrl : resolved.value?.imageUrl) ?? null)

const englishName = computed(() => displayName(c.value, false, face.value))
const localName = computed(() => displayName(c.value, true, face.value))
const title = computed(() => (isFr.value ? localName.value : englishName.value))
const subtitle = computed(() => (isFr.value && englishName.value.toLowerCase() !== localName.value.toLowerCase() ? englishName.value : ''))
const typeLine = computed(() => displayType(c.value, isFr.value, face.value))
const manaCost = computed(() => face.value?.mana_cost ?? c.value?.mana_cost ?? '')
const oracle = computed(() => displayOracle(c.value, isFr.value, face.value))
const { keywordTerms, oracleSegments } = useOracleText(c, oracle, isFr)

const setLine = computed(() => (c.value ? [c.value.set_name, `#${c.value.collector_number}`, rarityLabel(c.value.rarity)].filter(Boolean).join(' · ') : ''))
const price = computed(() => (resolved.value?.priceEur ? `${resolved.value.priceEur} €` : null))
const commanderLegal = computed(() => c.value?.legalities?.commander === 'legal')
const canLead = computed(() => isCommanderType(c.value?.type_line ?? ''))

const description = computed(() => {
  if (!c.value)
    return t('card.missing')
  const text = oracle.value.replace(/\{[^}]+\}/g, m => m.slice(1, -1)).replace(/\s+/g, ' ').trim()
  return `${title.value}, ${typeLine.value}. ${text}`.slice(0, 200)
})

usePublicSeo({
  title: () => (c.value ? `${title.value} · Magic` : t('card.missing')),
  description,
  image: () => c.value?.image_uris?.normal ?? c.value?.card_faces?.[0]?.image_uris?.normal,
  type: 'article',
  noindex: () => !c.value,
})

function startWith() {
  if (!c.value)
    return
  const deck = createDeck({ name: `${t('mtg.library.newDeckName')} ${title.value}`, game: 'mtg', raw: `1 ${c.value.name}` })
  navigateTo(deckPath(deck))
}
</script>

<template>
  <div class="mtg-card fade-up">
    <nav class="crumbs">
      <NuxtLink to="/magic">
        <UIcon name="i-lucide-arrow-left" class="h-4 w-4" />
        {{ t('card.backToLibrary') }}
      </NuxtLink>
    </nav>

    <div v-if="!c || !resolved" class="missing">
      <UIcon name="i-lucide-search-x" class="h-10 w-10" />
      <p>{{ t('card.missing') }}</p>
    </div>

    <article v-else class="page">
      <div class="art">
        <img v-if="image" :src="image" :alt="englishName" width="488" height="680">
        <button v-if="resolved.backImageUrl" type="button" class="flip" @click="showBack = !showBack">
          <UIcon name="i-lucide-flip-horizontal-2" class="h-4 w-4" />
          {{ showBack ? t('card.flipFront') : t('card.flipBack') }}
        </button>
      </div>

      <div class="info">
        <header class="head">
          <div class="min-w-0">
            <h1 class="name">
              {{ title }}
            </h1>
            <p v-if="subtitle" class="sub">
              {{ subtitle }}
            </p>
          </div>
          <ManaCost v-if="manaCost" :cost="manaCost" :size="22" />
        </header>

        <p class="type">
          {{ typeLine }}
        </p>

        <div v-if="keywordTerms.length" class="keywords">
          <span v-for="kw in keywordTerms" :key="kw">{{ kw }}</span>
        </div>

        <p v-if="oracle" class="oracle">
          <template v-for="(seg, i) in oracleSegments" :key="i">
            <br v-if="seg.t === 'br'">
            <ManaSymbol v-else-if="seg.t === 'mana'" :sym="seg.v" :size="15" class="mx-px" />
            <span v-else-if="seg.t === 'kw'" class="kw">{{ seg.v }}</span>
            <template v-else>
              {{ seg.v }}
            </template>
          </template>
        </p>

        <dl class="facts">
          <div>
            <dt>{{ t('card.edition') }}</dt>
            <dd>{{ setLine }}</dd>
          </div>
          <div v-if="c.artist">
            <dt>{{ t('card.artist') }}</dt>
            <dd>{{ c.artist }}</dd>
          </div>
          <div>
            <dt>Commander</dt>
            <dd :class="commanderLegal ? 'legal' : 'illegal'">
              {{ commanderLegal ? t('card.legal') : t('card.notLegal') }}
            </dd>
          </div>
          <div>
            <dt>{{ t('card.price') }}</dt>
            <dd>{{ price ?? t('card.priceNa') }}</dd>
          </div>
        </dl>

        <footer class="actions">
          <UButton v-if="canLead && commanderLegal" color="primary" icon="i-lucide-crown" @click="startWith">
            {{ t('mtg.library.startWith') }}
          </UButton>
          <UButton color="neutral" variant="subtle" icon="i-lucide-search" :to="`/magic?q=${encodeURIComponent(c.name)}`">
            {{ t('card.inLibrary') }}
          </UButton>
          <UButton color="neutral" variant="ghost" icon="i-lucide-shopping-cart" :to="searchUrl(c.name)" target="_blank">
            Cardmarket
          </UButton>
        </footer>
      </div>
    </article>
  </div>
</template>

<style scoped>
.mtg-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 980px;
  margin: 0 auto;
}
.crumbs a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-muted);
}
.crumbs a:hover {
  color: var(--color-text-high);
}
.page {
  display: grid;
  gap: 28px;
  padding: 24px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface-1);
  box-shadow: var(--shadow-elev-2);
}
@media (min-width: 720px) {
  .page {
    grid-template-columns: minmax(240px, 320px) 1fr;
  }
}
.art img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 4.5% / 3.2%;
  box-shadow: 0 18px 40px -20px rgba(27, 31, 34, 0.45);
}
.flip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 12px;
  padding: 8px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 3px;
  color: #e2c47f;
  font-size: 13px;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.name {
  margin: 0;
  font-family: var(--mtg-face);
  font-size: clamp(26px, 3.4vw, 38px);
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-text-high);
  text-wrap: balance;
}
.sub {
  margin: 4px 0 0;
  font-family: var(--mtg-face);
  color: var(--color-text-muted);
}
.type {
  margin: 0;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border-hairline);
  font-family: var(--mtg-face);
  font-size: 18px;
  color: var(--color-text-mid);
}
.keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.keywords span {
  padding: 1px 9px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 999px;
  font-size: 12px;
  color: #e2c47f;
}
.oracle {
  margin: 0;
  font-family: var(--mtg-face);
  font-size: 18px;
  line-height: 1.55;
  color: #efe6d0;
}
.oracle .kw {
  font-weight: 600;
  color: #e2c47f;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px 20px;
  margin: 0;
}
.facts dt {
  font-family: var(--mtg-face);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #2d4f7c;
}
.facts dd {
  margin: 2px 0 0;
  color: #454d52;
  font-size: 14px;
}
.facts .legal {
  color: #8fd3a2;
}
.facts .illegal {
  color: #e88a7d;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 6px;
}
.missing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 0;
  color: var(--color-text-muted);
}
</style>
