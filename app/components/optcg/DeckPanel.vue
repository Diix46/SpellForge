<script setup lang="ts">
import type { DeckEntry } from '#shared/decklist'
import type { OptcgDeckLine, OptcgDeckStats } from '#shared/optcg/deck'
import type { OptcgIssue, OptcgValidation } from '#shared/optcg/rules'
import type { OptcgCard } from '#shared/optcg/types'
import { computed, ref } from 'vue'
import { DECK_SIZE, MAX_COPIES } from '#shared/optcg/rules'
import { OPTCG_COLOR_HEX } from '~/utils/optcgColors'

// The deck side of the One Piece builder: the Leader slot, the fifty cards
// grouped by cost or by category, what the rules still object to, and the
// numbers a player checks (curve, counters, triggers).
const props = defineProps<{
  lines: OptcgDeckLine[]
  leader: OptcgDeckLine | null
  validation: OptcgValidation
  stats: OptcgDeckStats
  resolving: boolean
  unknown: OptcgDeckLine[]
  unreadable: string[]
  lang: 'fr' | 'en'
  /** A shared deck: quantities are shown, never edited. */
  readonly?: boolean
}>()

const emit = defineEmits<{
  setQuantity: [entry: DeckEntry, quantity: number]
  remove: [entry: DeckEntry]
  open: [line: OptcgDeckLine]
}>()

const { t } = useLocale()
const groupBy = ref<'cost' | 'category'>('cost')

const body = computed(() => props.lines.filter(l => l !== props.leader))

interface Group { key: string, label: string, lines: OptcgDeckLine[], count: number }
const groups = computed<Group[]>(() => {
  const map = new Map<string, Group>()
  const order: string[] = []
  const sorted = [...body.value].sort((a, b) => (a.card?.cost ?? 99) - (b.card?.cost ?? 99) || a.entry.name.localeCompare(b.entry.name))
  for (const line of sorted) {
    const c = line.card
    let key: string
    let label: string
    if (groupBy.value === 'cost') {
      key = c?.cost == null ? 'none' : String(c.cost)
      label = c?.cost == null ? t('optcg.deck.noCost') : `${t('optcg.deck.costGroup')} ${c.cost}`
    }
    else {
      key = c?.category ?? 'unknown'
      label = c ? t(`optcg.category.${c.category}`) : '…'
    }
    if (!map.has(key)) {
      map.set(key, { key, label, lines: [], count: 0 })
      order.push(key)
    }
    const g = map.get(key)!
    g.lines.push(line)
    g.count += line.entry.quantity
  }
  if (groupBy.value === 'category') {
    const rank = ['Character', 'Event', 'Stage', 'unknown']
    order.sort((a, b) => rank.indexOf(a) - rank.indexOf(b))
  }
  return order.map(k => map.get(k)!)
})

const countLabel = computed(() => `${props.stats.count} / ${DECK_SIZE}`)
const full = computed(() => props.stats.count === DECK_SIZE)
const over = computed(() => props.stats.count > DECK_SIZE)
const curveMax = computed(() => Math.max(1, ...props.stats.curve))

/** One readable sentence per issue; the size issue is already the counter. */
const issues = computed(() => props.validation.issues
  .filter(i => i.code !== 'deckSize' || props.stats.count > 0)
  .map(i => describe(i)))

function nameOf(number: string): string {
  const line = props.lines.find(l => l.entry.name === number)
  return line?.card ? `${line.card.name} (${number})` : number
}

function describe(i: OptcgIssue): string {
  switch (i.code) {
    case 'noLeader': return t('optcg.valid.noLeader')
    case 'notALeader': return `${t('optcg.valid.notALeader')} ${nameOf(i.number)}`
    case 'leaderInDeck': return `${t('optcg.valid.leaderInDeck')} ${nameOf(i.number)}`
    case 'deckSize': return `${t('optcg.valid.deckSize')} ${i.count}`
    case 'tooManyCopies': return `${t('optcg.valid.tooManyCopies')} ${nameOf(i.number)} (${i.count})`
    case 'offColor': return `${t('optcg.valid.offColor')} ${nameOf(i.number)}`
    case 'banned': return `${t('optcg.valid.banned')} ${nameOf(i.number)}`
    case 'rotated': return `${t('optcg.valid.rotated')} ${nameOf(i.number)}`
    case 'bannedPair': return `${t('optcg.valid.bannedPair')} ${nameOf(i.numbers[0])} + ${nameOf(i.numbers[1])}`
  }
}

function copiesLeft(line: OptcgDeckLine): number {
  const total = props.lines.reduce((n, l) => n + (l.entry.name === line.entry.name ? l.entry.quantity : 0), 0)
  return MAX_COPIES - total
}
function cardTitle(card: OptcgCard | null, entry: DeckEntry): string {
  return card ? card.name : entry.name
}
</script>

<template>
  <section class="panel">
    <!-- Leader -->
    <div class="leader" :class="{ empty: !leader?.card }">
      <template v-if="leader?.card">
        <button type="button" class="leader-art" :aria-label="leader.card.name" @click="emit('open', leader)">
          <img :src="leader.card.image" :alt="leader.card.name">
        </button>
        <div class="leader-info">
          <p class="kicker">
            {{ t('optcg.deck.leader') }}
          </p>
          <h3 class="leader-name u-display">
            {{ leader.card.name }}
          </h3>
          <p class="leader-meta">
            <span
              v-for="c in leader.card.colors"
              :key="c"
              class="color"
              :style="{ background: OPTCG_COLOR_HEX[c] }"
            >{{ t(`optcg.color.${c}`) }}</span>
            <span v-if="leader.card.life != null">{{ t('optcg.life') }} {{ leader.card.life }}</span>
            <span v-if="leader.card.power != null">{{ t('optcg.power') }} {{ leader.card.power }}</span>
          </p>
          <p class="don">
            {{ t('optcg.deck.don') }}
          </p>
        </div>
      </template>
      <template v-else>
        <div class="leader-placeholder" aria-hidden="true">
          <UIcon name="i-lucide-crown" class="h-7 w-7" />
        </div>
        <div class="leader-info">
          <h3 class="leader-name u-display">
            {{ readonly ? t('share.leaderless') : t('optcg.deck.chooseLeader') }}
          </h3>
          <p v-if="!readonly" class="hint">
            {{ t('optcg.deck.chooseLeaderHint') }}
          </p>
        </div>
      </template>
    </div>

    <!-- Count + validation -->
    <div class="status">
      <span class="count u-display" :class="{ full, over }">{{ countLabel }}</span>
      <UIcon v-if="resolving" name="i-lucide-loader-circle" class="h-4 w-4 animate-spin text-(--color-text-muted)" />
      <span v-if="validation.legal" class="legal">
        <UIcon name="i-lucide-badge-check" class="h-4 w-4" />
        {{ t('optcg.valid.legal') }}
      </span>
      <div class="group-switch" role="group">
        <button type="button" :aria-pressed="groupBy === 'cost'" @click="groupBy = 'cost'">
          {{ t('optcg.deck.byCost') }}
        </button>
        <button type="button" :aria-pressed="groupBy === 'category'" @click="groupBy = 'category'">
          {{ t('optcg.deck.byType') }}
        </button>
      </div>
    </div>
    <ul v-if="issues.length" class="issues">
      <li v-for="(issue, i) in issues" :key="i">
        {{ issue }}
      </li>
    </ul>
    <p v-if="unknown.length" class="issues-line">
      {{ t('optcg.deck.unknown') }} {{ unknown.map(l => l.entry.name).join(', ') }}
    </p>
    <p v-if="unreadable.length" class="issues-line">
      {{ t('optcg.deck.unreadable') }} {{ unreadable.join(', ') }}
    </p>

    <!-- Lines -->
    <div class="lines">
      <p v-if="!body.length" class="empty-body">
        {{ t('optcg.deck.empty') }}
      </p>
      <section v-for="g in groups" :key="g.key" class="group">
        <h4 class="group-title">
          <span>{{ g.label }}</span>
          <span class="font-mono">{{ g.count }}</span>
        </h4>
        <ul>
          <li v-for="line in g.lines" :key="`${line.entry.name}|${line.entry.art ?? ''}`" class="line">
            <button type="button" class="line-main" @click="emit('open', line)">
              <img v-if="line.card" :src="line.card.image" alt="" class="thumb" loading="lazy">
              <span v-else class="thumb thumb--empty" />
              <span class="line-name">{{ cardTitle(line.card, line.entry) }}</span>
              <span class="line-num">{{ line.entry.art ?? line.entry.name }}</span>
            </button>
            <span v-if="readonly" class="qty qty--ro">×{{ line.entry.quantity }}</span>
            <span v-else class="stepper">
              <button type="button" :aria-label="`- ${cardTitle(line.card, line.entry)}`" @click="emit('setQuantity', line.entry, line.entry.quantity - 1)">
                <UIcon name="i-lucide-minus" class="h-3.5 w-3.5" />
              </button>
              <span class="qty">{{ line.entry.quantity }}</span>
              <button
                type="button"
                :disabled="copiesLeft(line) <= 0"
                :aria-label="`+ ${cardTitle(line.card, line.entry)}`"
                @click="emit('setQuantity', line.entry, line.entry.quantity + 1)"
              >
                <UIcon name="i-lucide-plus" class="h-3.5 w-3.5" />
              </button>
            </span>
          </li>
        </ul>
      </section>
    </div>

    <!-- Numbers -->
    <footer v-if="stats.count" class="numbers">
      <div class="curve" :aria-label="t('optcg.stats.curve')">
        <div v-for="(n, cost) in stats.curve" :key="cost" class="bar-col">
          <span class="bar" :style="{ height: `${(n / curveMax) * 100}%` }" :title="`${n}`" />
          <span class="bar-label">{{ cost === 10 ? '10+' : cost }}</span>
        </div>
      </div>
      <dl class="figures">
        <div>
          <dt>{{ t('optcg.stats.average') }}</dt>
          <dd>{{ stats.averageCost ?? '-' }}</dd>
        </div>
        <div>
          <dt>{{ t('optcg.stats.counters') }}</dt>
          <dd>+2000 ×{{ stats.counters.c2000 }} · +1000 ×{{ stats.counters.c1000 }}</dd>
        </div>
        <div>
          <dt>{{ t('optcg.stats.triggers') }}</dt>
          <dd>{{ stats.triggers }}</dd>
        </div>
        <div>
          <dt>{{ t('optcg.stats.characters') }} / {{ t('optcg.stats.events') }} / {{ t('optcg.stats.stages') }}</dt>
          <dd>{{ stats.byCategory.Character }} / {{ stats.byCategory.Event }} / {{ stats.byCategory.Stage }}</dd>
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
.leader-art:hover {
  rotate: 0deg;
}
.leader-art img {
  display: block;
  width: 100%;
  border: 2px solid #231708;
  border-radius: 3px;
  box-shadow: 3px 3px 0 #231708;
}
.leader-placeholder {
  display: grid;
  place-items: center;
  width: 88px;
  aspect-ratio: 600 / 838;
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
.don {
  margin: 2px 0 0;
  font-family: var(--font-sfx, var(--font-display));
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--color-text-mid);
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
  aspect-ratio: 600 / 838;
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
  transition: height var(--dur-slow) var(--ease-spring);
}
.bar-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--color-text-muted);
}
.figures {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  margin: 0;
}
.figures dt {
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.figures dd {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-high);
  font-variant-numeric: tabular-nums;
}
</style>
