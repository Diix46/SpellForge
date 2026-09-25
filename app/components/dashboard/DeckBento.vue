<script setup lang="ts">
import type { DeckFingerprint } from '~/composables/useDeckFingerprints'
import type { Deck } from '~/composables/useDeckStore'
import { useLocale } from '~/composables/useLocale'

// Bento hero: the featured (most-recent) deck + two quick-start tiles. Pure
// presentation; the page supplies the featured deck and its fingerprint and
// listens for open/new/import. Extracted from index.vue.

defineProps<{
  featured: Deck
  fingerprint: DeckFingerprint
}>()

const emit = defineEmits<{
  open: [id: string]
  new: []
  import: []
}>()

const { t } = useLocale()
</script>

<template>
  <div class="bento">
    <button
      type="button"
      class="feature"
      :style="fingerprint.accent"
      @click="emit('open', featured.id)"
    >
      <!-- Magic: the commander's art, fading in from the right. -->
      <img v-if="fingerprint.art" :src="fingerprint.art" alt="" class="feature-art">
      <span class="feature-tag">
        <span class="dot" />{{ t('dash.recent') }} · {{ featured.game === 'optcg' ? 'One Piece' : 'Magic' }}
      </span>
      <div class="feature-body">
        <img v-if="fingerprint.leader" :src="fingerprint.leader.thumb" alt="" class="feature-leader">
        <div class="min-w-0">
          <h3 class="feature-name">
            {{ featured.name }}
          </h3>
          <div class="feature-meta">
            <span><b>{{ fingerprint.count }}</b> / {{ fingerprint.target }} {{ t('dash.cards') }}</span>
            <span v-if="fingerprint.label"><b>{{ fingerprint.label }}</b></span>
          </div>
          <div v-if="fingerprint.mana.length" class="feature-pips">
            <ManaSymbol v-for="m in fingerprint.mana" :key="m" :sym="m" :size="20" />
          </div>
          <div v-else class="feature-pips">
            <span
              v-for="(c, i) in fingerprint.dots"
              :key="i"
              class="pip"
              :style="{ background: c }"
            />
          </div>
        </div>
      </div>
      <span class="feature-cta">
        {{ t('dash.continue') }}<UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
      </span>
    </button>

    <div class="bento-side">
      <button type="button" class="mini" @click="emit('new')">
        <div class="mini-ic">
          <UIcon name="i-lucide-plus" class="h-[18px] w-[18px]" />
        </div>
        <div>
          <div class="mini-t">
            {{ t('dash.empty.create') }}
          </div>
          <div class="mini-d">
            {{ t('dash.quickNew') }}
          </div>
        </div>
      </button>
      <button type="button" class="mini" @click="emit('import')">
        <div class="mini-ic">
          <UIcon name="i-lucide-download" class="h-[18px] w-[18px]" />
        </div>
        <div>
          <div class="mini-t">
            {{ t('dash.empty.import') }}
          </div>
          <div class="mini-d">
            {{ t('dash.quickImport') }}
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.bento {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
  margin-bottom: 28px;
}
.feature {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 210px;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  padding: 22px;
  background: radial-gradient(420px 220px at 90% 0%, var(--accent-soft), transparent 62%), var(--color-surface-1);
  transition:
    border-color var(--dur) var(--ease-out),
    transform var(--dur-slow) var(--ease-spring);
}
.feature:hover {
  border-color: var(--accent-border);
  transform: translateY(-3px);
}
.feature::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px);
  background-size: 38px 38px;
  -webkit-mask-image: radial-gradient(120% 90% at 50% 0%, #000, transparent 72%);
  mask-image: radial-gradient(120% 90% at 50% 0%, #000, transparent 72%);
  pointer-events: none;
}
.feature > * {
  position: relative;
}
.feature > .feature-art {
  position: absolute;
  top: 0;
  right: 0;
  width: 62%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 30%;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 55%);
  mask-image: linear-gradient(90deg, transparent, #000 55%);
  opacity: 0.9;
  pointer-events: none;
  transition: transform var(--dur-slow) var(--ease-out);
}
.feature:hover > .feature-art {
  transform: scale(1.03);
}
.feature-tag {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent-text);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  padding: 4px 10px;
  border-radius: var(--radius-full);
}
.feature-tag .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}
.feature-body {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}
.feature-leader {
  width: 76px;
  border-radius: 4px;
  rotate: -3deg;
  box-shadow: var(--shadow-elev-2);
}
.feature-name {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--color-text-high);
  margin: 14px 0 6px;
}
.feature-meta {
  display: flex;
  gap: 14px;
  color: var(--color-text-muted);
  font-size: 13px;
}
.feature-meta b {
  color: var(--color-text-mid);
  font-weight: 500;
  font-family: var(--font-mono);
}
.feature-pips {
  display: flex;
  gap: 5px;
  margin-top: 14px;
}
.feature-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--accent-text);
}
.pip {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.14);
}

.bento-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.mini {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 13px;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--color-border-hairline);
  background: var(--color-surface-1);
  border-radius: var(--radius-md);
  padding: 16px 18px;
  transition:
    border-color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}
.mini:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
}
.mini-ic {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--color-surface-3);
  color: var(--color-text-mid);
}
.mini:hover .mini-ic {
  color: var(--accent-text);
}
.mini-t {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-high);
}
.mini-d {
  font-size: 12px;
  color: var(--color-text-disabled);
  margin-top: 2px;
}

@media (max-width: 920px) {
  .bento {
    grid-template-columns: 1fr;
  }
}
</style>
