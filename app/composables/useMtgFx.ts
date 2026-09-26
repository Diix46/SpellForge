import { nextTick } from 'vue'
import { MANA_GLYPH, MANA_PIP } from '#shared/mtg/mana-glyphs'

/**
 * The Magic builder's gestures, a card game's not a manga's: the card you add
 * is dealt from the search grid onto its line in the deck, its colours spray
 * from where it left as mana pips, the line lights up where it lands and the
 * counter ticks. Pure DOM (Web Animations), short-lived elements, nothing
 * under reduced motion.
 *
 * The deck list marks its lines `data-deck-row="<name, lower case>"` and its
 * counter `data-deck-count`; the effects find their target through them.
 */
const reduced = () => !import.meta.client || matchMedia('(prefers-reduced-motion: reduce)').matches

const rowOf = (name: string) => document.querySelector<HTMLElement>(`[data-deck-row="${CSS.escape(name.trim().toLowerCase())}"]`)
const counter = () => document.querySelector<HTMLElement>('[data-deck-count]')

function visible(el: HTMLElement | null): el is HTMLElement {
  if (!el)
    return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight
}

/** Replays a one-shot CSS animation class on an element. */
function replay(el: HTMLElement | null, cls: string, ms = 1200) {
  if (!el)
    return
  el.classList.remove(cls)
  void el.offsetWidth // restart the animation
  el.classList.add(cls)
  setTimeout(() => el.classList.remove(cls), ms)
}

export function useMtgFx() {
  /** Mana pips of the card's colours, thrown out from `from` and falling back. */
  function spray(from: HTMLElement | null, colors: readonly string[]) {
    if (reduced() || !from)
      return
    const r = from.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const pips = colors.length ? colors.map(c => c.toLowerCase()) : ['c']
    const n = 7
    for (let i = 0; i < n; i++) {
      const c = pips[i % pips.length]!
      const el = document.createElement('span')
      el.className = 'mtgfx-pip'
      el.setAttribute('aria-hidden', 'true')
      el.textContent = MANA_GLYPH[c] ?? ''
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      el.style.background = MANA_PIP[c] ?? '#b3aca3'
      document.body.appendChild(el)
      // Fanned upwards, a little random, then pulled down as they fade.
      const angle = (-90 + (i - (n - 1) / 2) * 24 + (Math.random() * 12 - 6)) * Math.PI / 180
      const dist = 38 + Math.random() * 26
      const dx = Math.cos(angle) * dist
      const dy = Math.sin(angle) * dist
      const spin = Math.random() * 120 - 60
      const a = el.animate([
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx * 1.25}px), calc(-50% + ${dy * 0.4 + 26}px)) scale(0.7) rotate(${spin}deg)`, opacity: 0 },
      ], { duration: 680 + Math.random() * 160, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' })
      a.onfinish = () => el.remove()
      setTimeout(() => el.remove(), 1500)
    }
  }

  /** The line lights up and the counter ticks: a card just joined the deck. */
  function landed(name: string) {
    if (reduced())
      return
    replay(rowOf(name), 'mtgfx-landed')
    replay(counter(), 'mtgfx-tick', 500)
  }

  /**
   * The card's image dealt from `from` onto its line in the deck (or onto the
   * counter when the line is out of sight), then `landed`. Call once the deck
   * holds the card.
   */
  async function deal(name: string, image: string | null, from: HTMLElement | null) {
    if (reduced())
      return
    await nextTick()
    const target = [rowOf(name), counter()].find(visible)
    if (!from || !image || !target) {
      landed(name)
      return
    }
    const a = from.getBoundingClientRect()
    const card = document.createElement('img')
    card.src = image
    card.alt = ''
    card.className = 'mtgfx-card'
    card.style.left = `${a.left}px`
    card.style.top = `${a.top}px`
    card.style.width = `${a.width}px`
    card.style.height = `${a.height}px`
    document.body.appendChild(card)

    // Aimed anew every frame: the line moves while the card flies (it joins
    // its type's column once resolved). Towards the line's thumbnail (36 px
    // tall, 20 px in) or the counter's middle, shrinking to its size, on an
    // arc with a flick of the wrist.
    const aim = () => {
      const el = [rowOf(name), counter()].find(visible) ?? target
      const b = el.getBoundingClientRect()
      const onRow = el !== counter()
      return {
        x: (onRow ? b.left + 20 : b.left + b.width / 2) - (a.left + a.width / 2),
        y: b.top + b.height / 2 - (a.top + a.height / 2),
        scale: Math.max(0.1, Math.min(1, (onRow ? 36 : b.height) / a.height)),
      }
    }
    const DURATION = 620
    const ease = (t: number) => 1 - (1 - t) ** 3
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      const k = ease(t)
      const to = aim()
      const lift = Math.sin(Math.PI * t) * 46
      const tilt = Math.sin(Math.PI * t) * -10
      card.style.transform = `translate(${to.x * k}px, ${to.y * k - lift}px) rotate(${tilt}deg) scale(${1 + (to.scale - 1) * k})`
      card.style.opacity = String(1 - 0.8 * t ** 3)
      if (t < 1) {
        requestAnimationFrame(step)
        return
      }
      card.remove()
      landed(name)
    }
    requestAnimationFrame(step)
    setTimeout(() => card.remove(), 2000)
  }

  /** The hundredth card: the counter rings and the table says so. */
  function complete(label: string) {
    if (reduced())
      return
    const el = counter()
    replay(el, 'mtgfx-complete', 1600)
    useUniverseFx().burst(el, label, 'mtg')
  }

  /** A commander chosen: its card glints once. */
  function crowned() {
    if (reduced())
      return
    void nextTick(() => replay(document.querySelector<HTMLElement>('[data-deck-commander]'), 'mtgfx-crowned', 1400))
  }

  return { spray, deal, landed, complete, crowned }
}
