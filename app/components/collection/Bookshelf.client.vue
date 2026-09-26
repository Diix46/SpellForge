<script setup lang="ts">
import type { SetProgress } from '#shared/collection'
import type { GameId } from '#shared/game'
import type { Bookcase, ShelfBinder } from '~/utils/bookshelf/layout'
import type { Library } from '~/utils/bookshelf/library'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { SET_KINDS, setKind } from '#shared/collection'
import { layoutLibrary } from '~/utils/bookshelf/layout'

// The collection as a 3D library (utils/bookshelf): the binders started on
// shelves labelled by family, a shelf of new releases to start one, bookcases
// side by side. Hover (or a first tap) slides a binder out; a click (or a
// second tap) takes it off the shelf and opens it. The page around holds
// what is plain HTML: the tooltip, the arrows between bookcases, the dots.
const props = defineProps<{ game: GameId, sets: SetProgress[], fresh: SetProgress[] }>()

const { t } = useLocale()
const router = useRouter()
const host = ref<HTMLDivElement | null>(null)
const lib = shallowRef<Library | null>(null)
const layout = shallowRef<Bookcase[]>([])
const caseIndex = ref(0)
const tip = ref<{ binder: ShelfBinder, x: number, y: number } | null>(null)
const status = ref<'loading' | 'ready' | 'failed'>('loading')

/** The icons and arts, loaded once, handed to the spines as they arrive. */
const images = new Map<string, { icon: HTMLImageElement | null, art: HTMLImageElement | null }>()
function load(url: string, done: (img: HTMLImageElement) => void) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  img.onload = () => done(img)
  img.src = url
}
function imagesOf(b: ShelfBinder) {
  const code = b.set.code
  let entry = images.get(code)
  if (!entry) {
    entry = { icon: null, art: null }
    images.set(code, entry)
    const e = entry
    if (b.set.icon) {
      load(b.set.icon, (img) => {
        e.icon = img
        lib.value?.repaint(code, e.icon, e.art)
      })
    }
    if (b.set.art) {
      load(b.set.art, (img) => {
        e.art = img
        lib.value?.repaint(code, e.icon, e.art)
      })
    }
  }
  return entry
}

const labels = computed(() => layout.value.map(c => [...new Set(c.rows.map(r => r.label))].join(' · ')))

// ---- Finding a binder: the camera flies to it, it lights up ----
const query = ref('')
const searching = ref(false)
const every = computed(() => layout.value.flatMap(c => c.rows.flatMap(r => r.binders)))
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const matches = computed(() => {
  const q = fold(query.value.trim())
  if (!q)
    return []
  return every.value.filter(b => fold(b.set.name).includes(q) || b.set.code.toLowerCase().startsWith(q)).slice(0, 6)
})
const active = ref(-1)
watch(matches, () => (active.value = matches.value.length ? 0 : -1))
function find(b: ShelfBinder) {
  if (lib.value?.focus(b.set.code)) {
    query.value = b.set.name
    searching.value = false
  }
}
function onSearchKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = matches.value.length
    if (n)
      active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    // A binder already found: Enter opens it.
    const chosen = lib.value?.selected
    if (!searching.value && chosen) {
      lib.value?.open(chosen.set.code)
      return
    }
    const b = matches.value[Math.max(0, active.value)]
    if (b)
      find(b)
  }
  else if (e.key === 'Escape') {
    searching.value = false
  }
}
const pct = (s: SetProgress) => (s.total ? Math.floor((s.owned / s.total) * 100) : 0)

onMounted(async () => {
  const el = host.value
  if (!el)
    return
  const coarse = matchMedia('(pointer: coarse)').matches
  const nav = navigator as Navigator & { deviceMemory?: number }
  const low = (coarse && el.clientWidth < 900) || (navigator.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
  const perShelf = el.clientWidth < 640 ? 7 : el.clientWidth < 1100 ? 10 : 12
  try {
    const [THREE, rounded, utils, room, lib3d, amb] = await Promise.all([
      import('three'),
      import('three/addons/geometries/RoundedBoxGeometry.js'),
      import('three/addons/utils/BufferGeometryUtils.js'),
      import('three/addons/environments/RoomEnvironment.js'),
      import('~/utils/bookshelf/library'),
      import('~/utils/bookshelf/ambiance'),
    ])
    layout.value = layoutLibrary(props.sets, props.fresh, {
      perShelf,
      // Three shelves: the binders stay large enough to read.
      rowsPerCase: 3,
      kindOf: s => setKind(props.game, s.type),
      kinds: SET_KINDS,
      labelOf: k => t(`collection.kind.${k}`),
      freshLabel: t('collection.shelf.fresh'),
    })
    const library = new lib3d.Library(THREE, el, {
      universe: props.game,
      quality: low ? 'low' : 'high',
      freshLabel: t('collection.shelf.new'),
      perShelf,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      kit: { RoundedBoxGeometry: rounded.RoundedBoxGeometry, mergeGeometries: utils.mergeGeometries, RoomEnvironment: room.RoomEnvironment },
      buildAmbiance: amb.buildAmbiance,
      hover: (binder, at) => (tip.value = binder && at ? { binder, ...at } : null),
      caseChange: i => (caseIndex.value = i),
      pick: binder => library.open(binder.set.code),
      opened: binder => void router.push(collectionPath(props.game, `/sets/${binder.set.code}`)),
    })
    library.build(layout.value, imagesOf)
    lib.value = library
    // Development: the scene's measures, for the browser tests.
    if (import.meta.dev)
      (el as HTMLElement & { __library?: Library }).__library = library
    status.value = 'ready'
  }
  catch (e) {
    console.error('[bookshelf]', e)
    status.value = 'failed'
  }
})
onBeforeUnmount(() => lib.value?.dispose())

// Progress moved (a card filed elsewhere): repaint those spines only.
watch(() => props.sets, (sets) => {
  const byCode = new Map(sets.map(s => [s.code, s]))
  for (const c of layout.value) {
    for (const r of c.rows) {
      for (const b of r.binders) {
        const next = byCode.get(b.set.code)
        if (next && next.owned !== b.set.owned) {
          b.set = next
          const img = images.get(b.set.code)
          lib.value?.repaint(b.set.code, img?.icon ?? null, img?.art ?? null)
        }
      }
    }
  }
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight')
    lib.value?.goTo(caseIndex.value + 1)
  else if (e.key === 'ArrowLeft')
    lib.value?.goTo(caseIndex.value - 1)
  else
    return
  e.preventDefault()
}
</script>

<template>
  <div class="library" :class="`library--${game}`" tabindex="0" :aria-label="t('collection.shelf.label')" @keydown="onKey">
    <div ref="host" class="stage" />
    <div v-if="status === 'ready'" class="finder" @keydown.stop>
      <UInput
        v-model="query"
        icon="i-lucide-search"
        size="sm"
        :placeholder="t('collection.shelf.find')"
        :aria-label="t('collection.shelf.find')"
        class="w-60"
        @focus="searching = true"
        @input="searching = true"
        @keydown="onSearchKey"
      />
      <ul v-if="searching && matches.length" class="finds" role="listbox">
        <li v-for="(b, i) in matches" :key="b.set.code">
          <button type="button" :aria-selected="i === active" @mousedown.prevent="find(b)">
            <img v-if="b.set.icon" :src="b.set.icon" alt="" class="sym">
            <span class="fname">{{ b.set.name }}</span>
            <span class="fcode">{{ b.fresh ? t('collection.shelf.new') : `${pct(b.set)}%` }}</span>
          </button>
        </li>
      </ul>
    </div>
    <div v-if="status === 'loading'" class="veil" role="status">
      <UIcon name="i-lucide-loader-circle" class="h-6 w-6 animate-spin" />
    </div>
    <p v-else-if="status === 'failed'" class="veil">
      {{ t('collection.shelf.unavailable') }}
    </p>
    <div v-if="tip" class="tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
      <b>{{ tip.binder.set.name }}</b>
      <span v-if="tip.binder.fresh">{{ t('collection.shelf.freshTip') }}</span>
      <span v-else>{{ tip.binder.set.owned }} / {{ tip.binder.set.total }} · {{ pct(tip.binder.set) }}%</span>
    </div>
    <template v-if="status === 'ready' && layout.length > 1">
      <button type="button" class="arrow arrow--prev" :disabled="caseIndex === 0" :aria-label="t('collection.shelf.prev')" @click="lib?.goTo(caseIndex - 1)">
        <UIcon name="i-lucide-chevron-left" class="h-6 w-6" />
      </button>
      <button type="button" class="arrow arrow--next" :disabled="caseIndex >= layout.length - 1" :aria-label="t('collection.shelf.next')" @click="lib?.goTo(caseIndex + 1)">
        <UIcon name="i-lucide-chevron-right" class="h-6 w-6" />
      </button>
      <p class="case-label">
        {{ labels[caseIndex] }}
      </p>
      <div class="dots" role="tablist">
        <button v-for="(label, i) in labels" :key="i" type="button" role="tab" :aria-selected="i === caseIndex" :title="label" @click="lib?.goTo(i)">
          <span />
        </button>
      </div>
    </template>
    <p v-if="status === 'ready'" class="hint">
      <UIcon name="i-lucide-mouse-pointer-click" class="h-3.5 w-3.5" /> {{ t('collection.shelf.hint') }}
    </p>
  </div>
</template>

<style scoped>
.library {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-xl);
  outline: none;
  box-shadow:
    inset 0 0 80px rgba(0, 0, 0, 0.55),
    var(--shadow-elev-2);
}
.library--mtg {
  background: radial-gradient(120% 90% at 50% 20%, #2c1f2a, #0d080b 75%);
}
.library--optcg {
  background: radial-gradient(120% 90% at 50% 20%, #6d4c33, #2a1c12 75%);
}
.library:focus-visible {
  box-shadow:
    0 0 0 3px var(--ui-primary),
    inset 0 0 80px rgba(0, 0, 0, 0.55);
}
.stage {
  height: clamp(380px, 62vh, 680px);
  touch-action: pan-y;
}
.stage :deep(canvas) {
  display: block;
}
.veil {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: rgba(255, 240, 220, 0.85);
}
.tip {
  position: absolute;
  z-index: 2;
  display: grid;
  gap: 2px;
  max-width: 260px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 220, 160, 0.25);
  border-radius: var(--radius-md);
  background: rgba(18, 12, 8, 0.9);
  font-size: 12px;
  color: #f4efe6;
  transform: translate(-50%, calc(-100% - 14px));
  pointer-events: none;
  backdrop-filter: blur(4px);
}
.tip b {
  font-size: 13px;
}
.tip span {
  font-family: var(--font-mono);
  opacity: 0.8;
}
.finder {
  position: absolute;
  z-index: 3;
  top: 12px;
  left: 12px;
}
.finder :deep(input) {
  background: rgba(20, 14, 10, 0.72);
  color: #f4efe6;
  backdrop-filter: blur(6px);
}
.finds {
  margin: 6px 0 0;
  padding: 4px;
  list-style: none;
  border: 1px solid rgba(255, 220, 160, 0.2);
  border-radius: var(--radius-md);
  background: rgba(18, 12, 8, 0.92);
  backdrop-filter: blur(6px);
}
.finds button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  text-align: left;
  font-size: 13px;
  color: #f4efe6;
}
.finds button[aria-selected='true'],
.finds button:hover {
  background: rgba(255, 220, 160, 0.14);
}
.sym {
  width: 16px;
  height: 16px;
  filter: invert(1);
  opacity: 0.85;
}
.fname {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.fcode {
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.7;
}
.case-label {
  position: absolute;
  z-index: 2;
  bottom: 36px;
  left: 50%;
  margin: 0;
  padding: 3px 12px;
  border-radius: 999px;
  background: rgba(20, 14, 10, 0.55);
  font-size: 12px;
  white-space: nowrap;
  color: rgba(255, 240, 220, 0.85);
  transform: translateX(-50%);
  pointer-events: none;
}
.arrow {
  position: absolute;
  z-index: 2;
  top: 50%;
  display: grid;
  place-items: center;
  width: 44px;
  height: 64px;
  border: 1px solid rgba(255, 230, 190, 0.2);
  border-radius: 12px;
  background: rgba(20, 14, 10, 0.55);
  color: #f4efe6;
  transform: translateY(-50%);
  backdrop-filter: blur(4px);
  transition:
    background 0.15s,
    opacity 0.15s;
}
.arrow:hover:not(:disabled) {
  background: rgba(20, 14, 10, 0.8);
}
.arrow:disabled {
  opacity: 0;
  pointer-events: none;
}
.arrow--prev {
  left: 12px;
}
.arrow--next {
  right: 12px;
}
.dots {
  position: absolute;
  z-index: 2;
  bottom: 12px;
  left: 50%;
  display: flex;
  gap: 4px;
  transform: translateX(-50%);
}
.dots button {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
}
.dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 240, 220, 0.35);
  transition:
    background 0.2s,
    transform 0.2s;
}
.dots button[aria-selected='true'] span {
  background: #f0d27a;
  transform: scale(1.3);
}
.hint {
  position: absolute;
  right: 14px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: rgba(255, 240, 220, 0.7);
  pointer-events: none;
}
@media (max-width: 640px) {
  .hint {
    display: none;
  }
  .arrow {
    width: 36px;
    height: 52px;
  }
}
</style>
