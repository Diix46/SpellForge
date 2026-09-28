<script setup lang="ts">
import type { OwnedCount } from '#shared/collection'
import type { DeckEntry } from '#shared/decklist'
import type { TcgIssue, TcgLine, TcgValidation } from '#shared/tcg/deck'
import type { TcgGameId } from '#shared/tcg/types'
import { computed } from 'vue'
import { copiesOf, limitOf, zoneOf } from '#shared/tcg/deck'
import { TCG_RULES } from '#shared/tcg/rules'
import { tcgDeckStats } from '#shared/tcg/stats'
import { TCG_UI, tcgCover, tcgLabel } from '~/utils/games/tcg'

// The deck side of a generic-engine builder: its cover card, the count of
// each zone against its size, what the rules still object to, the lines
// grouped by zone and category, and the make-up by category and type.
const props = defineProps<{
  game: TcgGameId
  lines: TcgLine[]
  validation: TcgValidation
  resolving: boolean
  unknown: TcgLine[]
  unreadable: string[]
  lang: 'fr' | 'en'
  /** A shared deck: quantities shown, never edited. */
  readonly?: boolean
  ownedOf?: (line: TcgLine) => OwnedCount | null
}>()

const emit = defineEmits<{
  setQuantity: [entry: DeckEntry, quantity: number]
  open: [line: TcgLine]
}>()

/** The format the deck is checked against. */
const format = defineModel<string>('format', { default: '' })

const { t, formatPrice } = useLocale()
const rules = computed(() => TCG_RULES[props.game])
const ui = computed(() => TCG_UI[props.game])
const label = (kind: string, v: string | null | undefined) => tcgLabel(t, props.game, kind, v)
const cover = computed(() => tcgCover(props.game, props.lines))
const total = computed(() => props.lines.reduce((n, l) => n + l.entry.quantity, 0))

interface Group { key: string, label: string, lines: TcgLine[], count: number }
interface Zone { id: string, label: string, count: number, min: number, max: number, groups: Group[] }

const zones = computed<Zone[]>(() => rules.value.zones.map((z) => {
  const own = props.lines.filter(l => zoneOf(l.entry, rules.value) === z.id)
  const byCat = new Map<string, Group>()
  for (const line of own) {
    const key = line.card?.category ?? '?'
    const g = byCat.get(key) ?? { key, label: line.card ? label('category', key) : '…', lines: [], count: 0 }
    g.lines.push(line)
    g.count += line.entry.quantity
    byCat.set(key, g)
  }
  const rank = (k: string) => {
    const i = ui.value.categories.indexOf(k)
    return i < 0 ? 99 : i
  }
  const groups = [...byCat.values()].sort((a, b) => rank(a.key) - rank(b.key))
  // Within a category: by subtype, then by name.
  for (const g of groups) {
    const subs = ui.value.subtypes[g.key] ?? []
    const sr = (s: string | null | undefined) => {
      const i = subs.indexOf(s ?? '')
      return i < 0 ? 99 : i
    }
    g.lines.sort((a, b) => sr(a.card?.subtype) - sr(b.card?.subtype) || (a.card?.name ?? a.entry.name).localeCompare(b.card?.name ?? b.entry.name))
  }
  return { id: z.id, label: t(`tcg.zone.${z.id}`), count: own.reduce((n, l) => n + l.entry.quantity, 0), min: z.min, max: z.max, groups }
}).filter((z, i) => i === 0 || z.count > 0 || z.min > 0))

/** One readable sentence per issue; a size issue shows only once cards are in. */
const issues = computed(() => props.validation.issues
  .filter(i => i.code !== 'zoneSize' || total.value > 0)
  .map(describe))

function describe(i: TcgIssue): { text: string, level: TcgIssue['level'] } {
  const text = t(`tcg.issue.${i.code}`)
    .replace('{cards}', (i.cards ?? []).join(', '))
    .replace('{count}', String(i.count ?? ''))
    .replace('{max}', String(i.max ?? ''))
    .replace('{zone}', i.zone ? t(`tcg.zone.${i.zone}`) : '')
  return { text, level: i.level }
}

function canMore(line: TcgLine): boolean {
  return !line.card || copiesOf(props.lines, line.card.key) < limitOf(rules.value, line.card)
}

// The deck in numbers (shared/tcg/stats): its curve, its make-up, its price.
const stats = computed(() => tcgDeckStats(props.game, props.lines))
const curveMax = computed(() => Math.max(1, ...stats.value.curve))

/** Copies per type, for the pips under the list. */
const typeCounts = computed(() => {
  const m = new Map<string, number>()
  for (const l of props.lines) {
    for (const ty of l.card?.types ?? [])
      m.set(ty, (m.get(ty) ?? 0) + l.entry.quantity)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
})
</script>

<template>
  <section class="panel">
    <div class="leader" :class="{ empty: !cover }">
      <button v-if="cover" type="button" class="leader-art" :aria-label="cover.card!.name" @click="emit('open', cover)">
        <img :src="cover.card!.thumb" :alt="cover.card!.name">
      </button>
      <div v-else class="leader-placeholder" aria-hidden="true">
        <UIcon name="i-lucide-layers" class="h-7 w-7" />
      </div>
      <div class="leader-info">
        <p class="kicker">
          {{ t('tcg.deck.format') }}
        </p>
        <div v-if="!readonly" class="group-switch formats" role="group">
          <button v-for="f in rules.formats" :key="f" type="button" :aria-pressed="format === f" @click="format = f">
            {{ t(`tcg.format.${f}`) }}
          </button>
        </div>
        <p v-else class="leader-meta">
          {{ t(`tcg.format.${format || rules.formats[0]}`) }}
        </p>
        <p v-if="typeCounts.length" class="type-counts">
          <span v-for="[ty, n] in typeCounts" :key="ty" class="type-count">
            <TcgTypeIcon :game="game" :type="ty" :size="16" />{{ n }}
          </span>
        </p>
      </div>
    </div>

    <div class="status">
      <span v-for="z in zones" :key="z.id" class="count u-display" :class="{ full: z.count >= z.min && z.count <= z.max, over: z.count > z.max }">
        <small v-if="zones.length > 1">{{ z.label }}</small>
        {{ z.count }} / {{ z.max >= 99 ? `${z.min}+` : z.min === z.max ? z.max : `${z.min}-${z.max}` }}
      </span>
      <UIcon v-if="resolving" name="i-lucide-loader-circle" class="h-4 w-4 animate-spin text-(--color-text-muted)" />
      <span v-if="validation.legal && total" class="legal">
        <UIcon name="i-lucide-badge-check" class="h-4 w-4" />
        {{ t('tcg.deck.legal') }}
      </span>
    </div>
    <ul v-if="issues.length" class="issues">
      <li v-for="(issue, i) in issues" :key="i" :class="{ warn: issue.level === 'warning' }">
        {{ issue.text }}
      </li>
    </ul>
    <p v-if="unknown.length" class="issues-line">
      {{ t('tcg.deck.unknown') }} : {{ unknown.map(l => l.entry.name).join(', ') }}
    </p>
    <p v-if="unreadable.length" class="issues-line">
      {{ t('tcg.deck.unreadable') }} : {{ unreadable.join(', ') }}
    </p>

    <div class="lines">
      <p v-if="!lines.length" class="empty-body">
        {{ t('tcg.deck.empty') }}
      </p>
      <template v-for="z in zones" :key="z.id">
        <h3 v-if="zones.length > 1" class="zone-title u-display">
          {{ z.label }}
        </h3>
        <section v-for="g in z.groups" :key="`${z.id}-${g.key}`" class="group">
          <h4 class="group-title">
            <span>{{ g.label }}</span>
            <span class="font-mono">{{ g.count }}</span>
          </h4>
          <ul>
            <li v-for="line in g.lines" :key="`${line.entry.name}|${line.entry.zone ?? ''}`" class="line">
              <button type="button" class="line-main" @click="emit('open', line)">
                <TcgThumb :src="line.card?.thumb" class="thumb" />
                <span class="line-name">{{ line.card?.name ?? line.entry.name }}</span>
                <span class="line-num">{{ line.card ? `${line.card.set} ${line.card.number}` : '' }}</span>
                <CollectionOwnedMark v-if="ownedOf?.(line)" :count="ownedOf(line)!" />
              </button>
              <span v-if="readonly" class="qty qty--ro">×{{ line.entry.quantity }}</span>
              <span v-else class="stepper">
                <button type="button" :aria-label="`- ${line.card?.name ?? line.entry.name}`" @click="emit('setQuantity', line.entry, line.entry.quantity - 1)">
                  <UIcon name="i-lucide-minus" class="h-3.5 w-3.5" />
                </button>
                <span class="qty">{{ line.entry.quantity }}</span>
                <button type="button" :disabled="!canMore(line)" :aria-label="`+ ${line.card?.name ?? line.entry.name}`" @click="emit('setQuantity', line.entry, line.entry.quantity + 1)">
                  <UIcon name="i-lucide-plus" class="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <!-- Numbers, as One Piece's and Magic's builders show theirs. -->
    <footer v-if="stats.count" class="numbers">
      <div v-if="stats.curve.length" class="curve" :aria-label="t('optcg.stats.curve')">
        <div v-for="(n, cost) in stats.curve" :key="cost" class="bar-col">
          <span class="bar" :style="{ height: `${(n / curveMax) * 100}%` }" :title="`${n}`" />
          <span class="bar-label">{{ cost === 10 ? '10+' : cost }}</span>
        </div>
      </div>
      <dl class="figures">
        <div v-if="stats.averageCost != null">
          <dt>{{ t('optcg.stats.average') }}</dt>
          <dd>{{ stats.averageCost }}</dd>
        </div>
        <div v-for="[cat, n] in stats.byCategory" :key="cat">
          <dt>{{ label('category', cat) }}</dt>
          <dd>{{ n }}</dd>
        </div>
        <div v-if="stats.price > 0">
          <dt>{{ t('tcg.stats.price') }}</dt>
          <dd>{{ formatPrice(stats.price, 0) }}<small v-if="stats.unpriced"> · {{ t('tcg.stats.unpriced').replace('{n}', String(stats.unpriced)) }}</small></dd>
        </div>
      </dl>
    </footer>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 16px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--glass-bg);
  box-shadow: var(--shadow-elev-1);
}
.leader {
  display: flex;
  gap: 14px;
  padding: 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background:
    var(--u-texture, none),
    linear-gradient(180deg, color-mix(in srgb, rgb(var(--accent-rgb)) 10%, transparent), transparent);
  background-blend-mode: multiply, normal;
}
.leader.empty {
  border-style: dashed;
}
.leader-art {
  flex: 0 0 auto;
  width: 88px;
  rotate: -2deg;
  transition: rotate var(--dur) var(--ease-spring);
}
.leader-art img {
  display: block;
  width: 100%;
  border: 2px solid var(--color-text-high);
  border-radius: 3px;
  box-shadow: 3px 3px 0 var(--color-text-high);
}
.leader-placeholder {
  display: grid;
  place-items: center;
  width: 88px;
  aspect-ratio: 63 / 88;
  border: 2px dashed var(--color-border-strong);
  border-radius: 3px;
  color: var(--color-text-muted);
}
.leader-info {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
}
.kicker {
  margin: 0;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent-text);
}
.leader-name {
  margin: 0;
  font-size: 22px;
  line-height: 1.05;
  color: var(--color-text-high);
}
.leader-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}
.color {
  padding: 0 6px;
  border-radius: 2px;
  color: #fff8ec;
  font-weight: 600;
}
.formats {
  margin-left: 0;
  justify-self: start;
}
.type-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin: 4px 0 0;
}
.type-count {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-mid);
}
.zone-title {
  margin: 14px 0 6px;
  font-size: 15px;
  color: var(--color-text-high);
}
.zone-title:first-child {
  margin-top: 0;
}
.count small {
  margin-right: 4px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.issues li.warn {
  color: var(--color-text-muted);
}
.hint {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.count {
  font-size: 26px;
  line-height: 1;
  color: var(--color-text-high);
  font-variant-numeric: tabular-nums;
}
.count.full {
  color: #2f8a4f;
}
.count.over {
  color: var(--accent-text);
}
.legal {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: #2f8a4f;
}
.group-switch {
  display: flex;
  margin-left: auto;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.group-switch button {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.group-switch button[aria-pressed='true'] {
  background: var(--color-text-high);
  color: var(--color-bg-base);
}
.issues {
  display: grid;
  gap: 3px;
  margin: 0;
  padding: 8px 10px 8px 26px;
  border-left: 3px solid rgb(var(--accent-rgb));
  background: color-mix(in srgb, rgb(var(--accent-rgb)) 8%, transparent);
  font-size: 12.5px;
  color: var(--color-text-mid);
  list-style: disc;
}
.issues-line {
  margin: 0;
  font-size: 12px;
  color: var(--accent-text);
}
.lines {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.empty-body {
  padding: 30px 10px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted);
}
.group + .group {
  margin-top: 12px;
}
.group-title {
  display: flex;
  justify-content: space-between;
  margin: 0 0 4px;
  padding-bottom: 3px;
  border-bottom: 1px solid var(--color-border-hairline);
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}
.line-main {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  text-align: left;
}
.line-main:hover .line-name {
  color: var(--accent-text);
}
.thumb {
  flex: 0 0 auto;
  width: 26px;
  aspect-ratio: 63 / 88;
  border-radius: 2px;
  object-fit: cover;
  background: var(--color-surface-3);
}
.line-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13.5px;
  color: var(--color-text-high);
  transition: color var(--dur-fast) ease;
}
.line-num {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--color-text-muted);
}
.stepper {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
}
.stepper button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: var(--color-text-mid);
}
.stepper button:hover:not(:disabled) {
  color: var(--accent-text);
}
.stepper button:disabled {
  opacity: 0.3;
}
.qty--ro {
  padding-right: 4px;
  color: var(--color-text-mid);
}
.qty {
  min-width: 18px;
  font-family: var(--font-display);
  font-size: 14px;
  text-align: center;
  color: var(--color-text-high);
}
.numbers {
  display: grid;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-hairline);
}
.curve {
  display: grid;
  grid-template-columns: repeat(11, 1fr);
  gap: 4px;
  height: 64px;
}
.bar-col {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
}
.bar {
  width: 100%;
  min-height: 2px;
  border-radius: 2px 2px 0 0;
  background: rgb(var(--accent-rgb));
}
.bar-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
}
.figures {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
}
.figures dt {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.figures dd {
  margin: 1px 0 0;
  color: var(--color-text-high);
  font-variant-numeric: tabular-nums;
}
.figures small {
  color: var(--color-text-muted);
}
</style>
