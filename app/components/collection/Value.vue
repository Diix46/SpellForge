<script setup lang="ts">
import type { GameId } from '#shared/game'
import type { HistoryPeriod, Mover } from '~/composables/useCollectionHistory'
import { computed } from 'vue'
import { unitValue } from '#shared/collection'

// What the collection is worth and how that moves: the value now and over
// the period, the chart, the cards that rose and fell most, and where the
// value sits, set by set.
const props = defineProps<{ game: GameId }>()

const { t, locale } = useLocale()
const collection = useCollection(props.game)
const history = useCollectionHistory(props.game)

const loc = computed(() => (locale.value === 'fr' ? 'fr-FR' : 'en-US'))
const money = (n: number, sign = false) => `${sign && n > 0 ? '+' : ''}${n.toLocaleString(loc.value, { style: 'currency', currency: 'EUR' })}`
const pct = (n: number) => `${n > 0 ? '+' : ''}${(n * 100).toLocaleString(loc.value, { maximumFractionDigits: 1 })} %`

const summary = computed(() => collection.summary.value)
const gain = computed(() => (summary.value.paid > 0 ? summary.value.value - summary.value.paid : null))

const periods: { value: HistoryPeriod, label: string }[] = [
  { value: '30', label: 'collection.value.p30' },
  { value: '90', label: 'collection.value.p90' },
  { value: '365', label: 'collection.value.p365' },
  { value: 'all', label: 'collection.value.pAll' },
]

/** The sets holding the most value, their share of the whole. */
const bySet = computed(() => {
  const m = new Map<string, { code: string, name: string, icon: string | null, value: number, copies: number }>()
  for (const c of collection.copies.value) {
    if (!c.card)
      continue
    const unit = unitValue(c.card, c.finish) ?? 0
    const s = m.get(c.card.set) ?? { code: c.card.set, name: c.card.setName ?? c.card.set.toUpperCase(), icon: c.card.setIcon, value: 0, copies: 0 }
    s.value += unit * c.quantity
    s.copies += c.quantity
    m.set(c.card.set, s)
  }
  const list = [...m.values()].filter(s => s.value > 0).sort((a, b) => b.value - a.value)
  const top = list[0]?.value ?? 1
  return list.slice(0, 10).map(s => ({ ...s, width: s.value / top, share: summary.value.value ? s.value / summary.value.value : 0 }))
})

const moverName = (m: Mover) => m.printedName ?? m.name
</script>

<template>
  <div class="value">
    <section class="kpis">
      <div class="kpi kpi--main">
        <p class="label">
          {{ t('collection.value') }}
        </p>
        <p class="big">
          {{ money(summary.value) }}
        </p>
        <p class="hint">
          {{ t('collection.valueHint') }}
        </p>
      </div>
      <div class="kpi">
        <p class="label">
          {{ t('collection.value.change') }}
        </p>
        <template v-if="history.change.value">
          <p class="mid" :class="history.change.value.delta >= 0 ? 'up' : 'down'">
            {{ money(history.change.value.delta, true) }}
          </p>
          <p class="hint">
            <span v-if="history.change.value.pct != null" :class="history.change.value.delta >= 0 ? 'up' : 'down'">{{ pct(history.change.value.pct) }}</span>
            {{ t('collection.value.since').replace('{day}', new Date(`${history.change.value.since}T00:00:00Z`).toLocaleDateString(loc, { day: 'numeric', month: 'long', timeZone: 'UTC' })) }}
          </p>
        </template>
        <p v-else class="hint">
          {{ t('collection.value.noChangeYet') }}
        </p>
      </div>
      <div class="kpi">
        <p class="label">
          {{ t('collection.gain') }}
        </p>
        <template v-if="gain != null">
          <p class="mid" :class="gain >= 0 ? 'up' : 'down'">
            {{ money(gain, true) }}
          </p>
          <p class="hint">
            {{ t('collection.paid') }} {{ money(summary.paid) }}
          </p>
        </template>
        <p v-else class="hint">
          {{ t('collection.value.noPaid') }}
        </p>
      </div>
    </section>

    <section class="panel">
      <header class="panel-head">
        <h2>{{ t('collection.value.chart') }}</h2>
        <div class="seg" role="group">
          <button v-for="p in periods" :key="p.value" type="button" :aria-pressed="history.period.value === p.value" @click="history.period.value = p.value">
            {{ t(p.label) }}
          </button>
        </div>
      </header>
      <div v-if="history.status.value === 'pending' && !history.points.value.length" class="state" role="status">
        <UIcon name="i-lucide-loader-circle" class="h-6 w-6 animate-spin" />
      </div>
      <p v-else-if="history.error.value" class="state">
        {{ t('collection.error') }}
      </p>
      <template v-else>
        <CollectionValueChart :points="history.points.value" />
        <p v-if="history.points.value.length < 2" class="note">
          <UIcon name="i-lucide-moon-star" class="h-4 w-4" />
          {{ t('collection.value.firstReading') }}
        </p>
      </template>
    </section>

    <div class="two">
      <section v-for="side in (['gainers', 'losers'] as const)" :key="side" class="panel">
        <header class="panel-head">
          <h2>
            <UIcon :name="side === 'gainers' ? 'i-lucide-trending-up' : 'i-lucide-trending-down'" class="h-4 w-4" :class="side === 'gainers' ? 'up' : 'down'" />
            {{ t(`collection.value.${side}`) }}
          </h2>
        </header>
        <p v-if="!history.movers.value[side].length" class="empty">
          {{ t('collection.value.noMovers') }}
        </p>
        <ul v-else class="movers">
          <li v-for="m in history.movers.value[side]" :key="m.id">
            <img :src="m.thumb" alt="" loading="lazy">
            <div class="min-w-0 flex-1">
              <p class="m-name">
                {{ moverName(m) }}
              </p>
              <p class="m-meta">
                {{ m.set.toUpperCase() }} #{{ m.number }}<template v-if="m.finish !== 'nonfoil'">
                  · {{ t(`collection.finish.${m.finish}`) }}
                </template> · ×{{ m.quantity }}
              </p>
            </div>
            <div class="m-price">
              <b :class="m.delta >= 0 ? 'up' : 'down'">{{ money(m.delta, true) }}</b>
              <span>{{ money(m.then) }} → {{ money(m.now) }}</span>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <section class="panel">
      <header class="panel-head">
        <h2>{{ t('collection.value.bySet') }}</h2>
      </header>
      <p v-if="!bySet.length" class="empty">
        {{ t('collection.value.noSetValue') }}
      </p>
      <ul v-else class="sets">
        <li v-for="s in bySet" :key="s.code">
          <span class="s-name">
            <CollectionSetSymbol :icon="s.icon" :size="16" />
            <span class="truncate">{{ s.name }}</span>
          </span>
          <span class="bar"><span :style="{ transform: `scaleX(${s.width})` }" /></span>
          <span class="s-value">{{ money(s.value) }}</span>
          <span class="s-share">{{ Math.round(s.share * 100) }} %</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.value {
  display: grid;
  gap: 16px;
}
.kpis {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr;
  gap: 12px;
}
.kpi {
  padding: 18px 20px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: var(--color-surface-1);
}
.kpi--main {
  background: radial-gradient(360px 140px at 100% 0%, var(--accent-soft), transparent 70%), var(--color-surface-1);
  box-shadow: var(--shadow-elev-1);
}
.label {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.big {
  margin: 6px 0 4px;
  font-family: var(--font-mono);
  font-size: 34px;
  font-weight: 600;
  line-height: 1.05;
  color: var(--color-text-high);
}
.mid {
  margin: 8px 0 4px;
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 600;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}
.up {
  color: #23945a;
}
.down {
  color: var(--color-error, #c0392b);
}
.panel {
  padding: 16px 18px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: var(--color-surface-1);
}
.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.panel-head h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-high);
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-sm);
}
.seg button {
  padding: 4px 10px;
  border-radius: calc(var(--radius-sm) - 2px);
  font-size: 12px;
  color: var(--color-text-muted);
}
.seg button[aria-pressed='true'] {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}
.state {
  display: grid;
  place-items: center;
  height: 240px;
  color: var(--color-text-muted);
}
.note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.empty {
  margin: 0;
  padding: 18px 0;
  font-size: 13px;
  text-align: center;
  color: var(--color-text-muted);
}
.movers {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.movers li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
}
.movers img {
  width: 30px;
  height: 42px;
  border-radius: 3px;
  object-fit: cover;
}
.m-name {
  overflow: hidden;
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-high);
}
.m-meta {
  margin: 1px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}
.m-price {
  display: grid;
  justify-items: end;
  font-family: var(--font-mono);
}
.m-price b {
  font-size: 13px;
}
.m-price span {
  font-size: 11px;
  color: var(--color-text-muted);
}
.sets {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sets li {
  display: grid;
  grid-template-columns: minmax(120px, 220px) 1fr 90px 44px;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}
.s-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--color-text-high);
}
.bar {
  position: relative;
  overflow: hidden;
  height: 8px;
  border-radius: 999px;
  background: var(--color-surface-3);
}
.bar span {
  position: absolute;
  inset: 0;
  transform-origin: left;
  border-radius: inherit;
  background: linear-gradient(90deg, rgb(var(--accent-rgb)), rgb(var(--accent-rgb-2, var(--accent-rgb))));
  transition: transform 0.5s var(--ease-out, ease-out);
}
.s-value {
  font-family: var(--font-mono);
  text-align: right;
  color: var(--color-text-high);
}
.s-share {
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: right;
  color: var(--color-text-muted);
}
@media (max-width: 900px) {
  .kpis,
  .two {
    grid-template-columns: 1fr;
  }
  .sets li {
    grid-template-columns: minmax(0, 1fr) 70px 90px;
  }
  .s-share {
    display: none;
  }
}
</style>
