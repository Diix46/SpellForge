<script setup lang="ts">
import type { TcgCard, TcgGameId } from '#shared/tcg/types'
import { computed, ref } from 'vue'
import { TCG_RULES } from '#shared/tcg/rules'
import { TCG_UI, tcgLabel } from '~/utils/games/tcg'

// A card up close: the scan (every printing one click away), its numbers,
// abilities and attacks, legality and price. Shared by the card sheet (a
// modal) and the card page; each brings its own actions through the slot.
const props = withDefaults(defineProps<{
  game: TcgGameId
  card: TcgCard
  prints: TcgCard[]
  lang: 'fr' | 'en'
  heading?: 'h1' | 'h2'
}>(), { heading: 'h2' })

/** The printing shown: an id, or null for the card's own. */
const shown = defineModel<string | null>('shown', { default: null })

const { t } = useLocale()
const label = (kind: string, v: string | null | undefined) => tcgLabel(t, props.game, kind, v)

const shownCard = computed<TcgCard>(() => props.prints.find(p => p.id === shown.value) ?? props.card)
const broken = ref<string | null>(null)
// A Battlefield lies on its side.
const aspect = computed(() => (shownCard.value.landscape ? 1 / TCG_UI[props.game].aspect : TCG_UI[props.game].aspect))
const c = computed(() => shownCard.value)
const money = (v: number | null) => (v == null ? null : `${v.toLocaleString(props.lang === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
const formats = computed(() => TCG_RULES[props.game].formats)
const kind = computed(() => [label('category', c.value.category), label('subtype', c.value.subtype)].filter(Boolean).join(' · '))
// Numbers the card prints besides Pokémon's (Yu-Gi-Oh: Level or Rank, ATK/DEF, Link,
// Scale; Riftbound: Energy, Might, Power).
const STAT_ORDER = ['energy', 'might', 'power', 'level', 'rank', 'link', 'atk', 'def', 'scale']
const statFacts = computed(() => STAT_ORDER.filter(k => c.value.stats[k] != null).map(k => ({ id: k, label: t(`${props.game}.${k}`), value: String(c.value.stats[k]) })))
const race = computed(() => [c.value.race, c.value.archetype && c.value.archetype !== c.value.race ? c.value.archetype : null].filter(Boolean).join(' · '))
</script>

<template>
  <div class="sheet-grid">
    <div class="sheet-art">
      <div class="frame" :style="{ aspectRatio: aspect }">
        <img v-if="c.image && broken !== c.image" :src="c.image" :alt="c.name" width="600" height="825" @error="broken = c.image">
        <span v-else class="blank u-display">{{ c.name }}</span>
      </div>
      <div v-if="prints.length > 1" class="arts">
        <p class="arts-title">
          {{ t('tcg.printings') }} ({{ prints.length }})
        </p>
        <div class="arts-row">
          <button
            v-for="p in prints"
            :key="p.id"
            type="button"
            class="art-thumb"
            :style="{ aspectRatio: aspect }"
            :aria-pressed="p.id === c.id"
            :title="`${p.setName ?? p.set} · ${p.number}`"
            :aria-label="`${p.setName ?? p.set} ${p.number}`"
            @click="shown = p.id"
          >
            <TcgThumb :src="p.thumb" />
          </button>
        </div>
      </div>
    </div>

    <div class="sheet-info">
      <header>
        <component :is="heading" class="sheet-name u-display">
          {{ c.name }}
          <span v-if="c.stats.hp" class="hp"><small>{{ t('pokemon.hp') }}</small>{{ c.stats.hp }}</span>
        </component>
        <p class="sheet-meta">
          <span v-if="c.types.length" class="types">
            <TcgTypeIcon v-for="ty in c.types" :key="ty" :game="game" :type="ty" />
          </span>
          <span>{{ kind }}</span>
          <span v-if="c.rarity && c.rarity !== 'None'">{{ label('rarity', c.rarity) }}</span>
        </p>
        <p class="sheet-meta">
          <span>{{ c.setName ?? c.set }}</span>
          <span class="font-mono">{{ c.set }} · {{ c.number }}</span>
          <span v-if="c.regulation" class="mark" :title="t('tcg.regulation')">{{ c.regulation }}</span>
        </p>
        <p v-if="c.evolveFrom" class="evolve">
          {{ t('pokemon.evolvesFrom') }} <b>{{ c.evolveFrom }}</b>
        </p>
        <p v-if="race" class="evolve">
          {{ race }}
        </p>
        <p v-if="c.banned || c.limit" class="limit" :class="{ banned: c.banned }">
          <UIcon name="i-lucide-octagon-alert" class="h-4 w-4" />
          {{ c.banned ? t('tcg.banned') : t(`tcg.limit.${c.limit}`) }}
        </p>
      </header>

      <dl v-if="statFacts.length" class="facts">
        <div v-for="f in statFacts" :key="f.id" class="fact">
          <dt>{{ f.label }}</dt>
          <dd>{{ f.value }}</dd>
        </div>
      </dl>

      <section v-if="c.abilities.length || c.attacks.length" class="moves">
        <div v-for="a in c.abilities" :key="`ab-${a.name}`" class="move">
          <p class="move-head">
            <span class="ability">{{ a.type ?? t('pokemon.ability') }}</span>
            <b>{{ a.name }}</b>
          </p>
          <p v-if="a.effect" class="move-text">
            {{ a.effect }}
          </p>
        </div>
        <div v-for="(a, i) in c.attacks" :key="`at-${i}`" class="move">
          <p class="move-head">
            <span class="cost">
              <TcgTypeIcon v-for="(e, j) in a.cost" :key="j" :game="game" :type="e" :size="16" />
            </span>
            <b>{{ a.name }}</b>
            <span v-if="a.damage" class="dmg">{{ a.damage }}</span>
          </p>
          <p v-if="a.effect" class="move-text">
            {{ a.effect }}
          </p>
        </div>
      </section>
      <p v-else-if="c.text" class="text">
        {{ c.text }}
      </p>
      <p v-if="c.flavour" class="flavour">
        {{ c.flavour }}
      </p>

      <dl v-if="c.weaknesses.length || c.resistances.length || c.stats.retreat != null" class="facts">
        <div v-if="c.weaknesses.length" class="fact">
          <dt>{{ t('pokemon.weakness') }}</dt>
          <dd><span v-for="w in c.weaknesses" :key="w.type" class="inline"><TcgTypeIcon :game="game" :type="w.type" :size="15" />{{ w.value }}</span></dd>
        </div>
        <div v-if="c.resistances.length" class="fact">
          <dt>{{ t('pokemon.resistance') }}</dt>
          <dd><span v-for="w in c.resistances" :key="w.type" class="inline"><TcgTypeIcon :game="game" :type="w.type" :size="15" />{{ w.value }}</span></dd>
        </div>
        <div v-if="c.stats.retreat != null" class="fact">
          <dt>{{ t('pokemon.retreat') }}</dt>
          <dd>
            <span class="inline"><TcgTypeIcon v-for="n in Number(c.stats.retreat)" :key="n" :game="game" type="Colorless" :size="15" /><template v-if="!c.stats.retreat">0</template></span>
          </dd>
        </div>
      </dl>

      <div class="legal">
        <span v-for="f in formats" :key="f" class="format" :class="{ ok: c.legal.includes(f) && !c.banned }">
          <UIcon :name="c.legal.includes(f) && !c.banned ? 'i-lucide-check' : 'i-lucide-x'" class="h-3.5 w-3.5" />
          {{ t(`tcg.format.${f}`) }}
        </span>
      </div>

      <dl v-if="c.price != null || c.priceFoil != null" class="facts prices">
        <div v-if="c.price != null" class="fact">
          <dt>{{ t('tcg.price') }}</dt>
          <dd>{{ money(c.price) }}</dd>
        </div>
        <div v-if="c.priceFoil != null" class="fact">
          <dt>{{ t('tcg.priceFoil') }}</dt>
          <dd>{{ money(c.priceFoil) }}</dd>
        </div>
      </dl>

      <p v-if="game === 'yugioh' && c.price != null" class="note">
        {{ t('tcg.priceFloor') }}
      </p>
      <p v-if="c.illustrator" class="note">
        {{ t('tcg.illustrator') }} {{ c.illustrator }}
      </p>
      <p v-if="c.lang !== lang" class="note">
        {{ t('tcg.otherLang') }}
      </p>

      <slot name="actions" :shown-card="c" />
    </div>
  </div>
</template>

<style scoped>
.sheet-grid {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 22px;
  padding: 18px;
}
.sheet-art {
  display: grid;
  /* One column that never grows with the strip of printings (it scrolls). */
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 12px;
  min-width: 0;
}
.frame {
  overflow: hidden;
  border-radius: 4.5% / 3.3%;
  background: var(--color-surface-3);
  box-shadow: var(--shadow-elev-3);
}
.frame img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: 100%;
  object-fit: cover;
}
.blank {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 20px;
  text-align: center;
  font-size: 22px;
  color: var(--color-text-muted);
}
.arts-title {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.arts-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.art-thumb {
  flex: none;
  width: 52px;
  overflow: hidden;
  border-radius: 4px;
  opacity: 0.7;
  outline: 2px solid transparent;
  transition:
    opacity var(--dur-fast),
    outline-color var(--dur-fast);
}
.art-thumb[aria-pressed='true'] {
  opacity: 1;
  outline-color: rgb(var(--accent-rgb));
}
.art-thumb > * {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sheet-info {
  display: grid;
  align-content: start;
  gap: 14px;
  min-width: 0;
}
.sheet-name {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  font-size: 28px;
  line-height: 1.1;
  color: var(--color-text-high);
}
.hp {
  flex: none;
  font-size: 22px;
  color: var(--accent-text);
}
.hp small {
  margin-right: 3px;
  font-size: 11px;
}
.sheet-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--color-text-mid);
}
.types,
.cost,
.inline {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.mark {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--color-border-strong);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
}
.evolve {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
.flavour {
  margin: 0;
  font-size: 13px;
  font-style: italic;
  line-height: 1.5;
  color: var(--color-text-muted);
}
.limit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  padding: 3px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, #d9a91c 18%, transparent);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-high);
}
.limit.banned {
  background: color-mix(in srgb, #c9312a 18%, transparent);
  color: #b0261f;
}
.moves {
  display: grid;
  gap: 10px;
}
.move {
  padding: 10px 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
}
.move-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  color: var(--color-text-high);
}
.ability {
  padding: 1px 7px;
  border-radius: 999px;
  background: #c8312a;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #fff;
}
.dmg {
  margin-left: auto;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}
.move-text,
.text {
  margin: 5px 0 0;
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-line;
  color: var(--color-text-mid);
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  margin: 0;
}
.fact dt {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.fact dd {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-high);
}
.legal {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.format {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 999px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.format.ok {
  border-color: color-mix(in srgb, #2f8a4f 45%, transparent);
  color: #2f8a4f;
}
.note {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}
@media (max-width: 640px) {
  /* minmax(0, …): the strip of printings scrolls, it never widens the page. */
  .sheet-grid {
    grid-template-columns: minmax(0, 1fr);
    padding: 14px;
  }
  .sheet-art {
    width: 100%;
    max-width: 300px;
    margin-inline: auto;
  }
}
</style>
