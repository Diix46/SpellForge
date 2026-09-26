import { nextTick } from 'vue'
import { MANA_GLYPH, MANA_PIP } from '#shared/mtg/mana-glyphs'

/**
 * The Magic builder's gestures, a spell's not a manga's: the card you add is
 * cast — its mana cost laid out and paid pip by pip, the spell resolving in
 * its colours — then dealt onto its line in the deck, which lights up while
 * the counter ticks. Pure DOM (Web Animations), short-lived elements,
 * nothing under reduced motion.
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

// The colours a resolving spell glows with (the pips' own are too pale for light).
const AURA: Record<string, string> = {
  w: '#f1d46b',
  u: '#3f86d8',
  b: '#7b5a8c',
  r: '#e2502e',
  g: '#3a9a58',
  c: '#a9b3bd',
}
const GENERIC_PIP = '#b3aca3'
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
// Cards on their way to the deck, and a "hundred cards" waiting for them to land.
let inFlight = 0
let completeWhenLanded: (() => void) | null = null

/** One pip of a mana cost ("2", "r", "r/g", "u/p"…): its glyph and its colour. */
function pipOf(token: string) {
  // A hybrid or Phyrexian pip shows its first half.
  const first = token.toLowerCase().split('/')[0] ?? ''
  return {
    glyph: MANA_GLYPH[first] ?? first.toUpperCase(),
    figure: !MANA_GLYPH[first],
    background: MANA_PIP[first] ?? GENERIC_PIP,
  }
}

export function useMtgFx() {
  /**
   * Casting the card: its mana cost is laid out above it and paid pip by pip
   * (each pip lights, then flows into the card), then the spell resolves in
   * the card's colours. Resolves when the aura peaks, for the card to go on
   * to the deck.
   */
  async function cast(from: HTMLElement | null, manaCost: string | null | undefined, colors: readonly string[]) {
    if (reduced() || !from)
      return
    const r = from.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const tokens = (manaCost?.match(/\{([^}]+)\}/g) ?? []).map(t => t.slice(1, -1)).slice(0, 8)
    const SIZE = 22
    const GAP = 5
    const row = tokens.length * SIZE + Math.max(0, tokens.length - 1) * GAP
    const STAGGER = 75

    const pips = tokens.map((token, i) => {
      const p = pipOf(token)
      const el = document.createElement('span')
      el.className = p.figure ? 'mtgfx-pip mtgfx-pip--figure' : 'mtgfx-pip'
      el.setAttribute('aria-hidden', 'true')
      el.textContent = p.glyph
      el.style.background = p.background
      el.style.left = `${cx - row / 2 + i * (SIZE + GAP) + SIZE / 2}px`
      el.style.top = `${r.top + r.height * 0.3}px`
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 2500)
      // Laid out one by one, as a player taps a land for each.
      el.animate([
        { transform: 'translate(-50%, -50%) translateY(10px) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.18)', opacity: 1, offset: 0.6 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      ], { duration: 240, delay: i * STAGGER, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)', fill: 'forwards' })
      return el
    })
    if (pips.length)
      await wait(pips.length * STAGGER + 240 + 90)

    // Paid: the pips flow into the card.
    pips.forEach((el, i) => {
      const x = cx - Number.parseFloat(el.style.left)
      const y = cy - Number.parseFloat(el.style.top)
      const a = el.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(0.35)`, opacity: 0 },
      ], { duration: 280, delay: i * 35, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' })
      a.onfinish = () => el.remove()
    })
    if (pips.length)
      await wait(280 + (pips.length - 1) * 35)

    // Resolves: an aura in the card's colours swells behind it.
    const hues = (colors.length ? colors : ['c']).map(c => AURA[c.toLowerCase()] ?? AURA.c!)
    const aura = document.createElement('span')
    aura.className = 'mtgfx-aura'
    aura.setAttribute('aria-hidden', 'true')
    aura.style.left = `${r.left}px`
    aura.style.top = `${r.top}px`
    aura.style.width = `${r.width}px`
    aura.style.height = `${r.height}px`
    aura.style.background = hues.length > 1 ? `conic-gradient(${[...hues, hues[0]].join(', ')})` : hues[0]!
    document.body.appendChild(aura)
    const glow = aura.animate([
      { transform: 'scale(0.92)', opacity: 0 },
      { transform: 'scale(1.1)', opacity: 0.5, offset: 0.35 },
      { transform: 'scale(1.22)', opacity: 0 },
    ], { duration: 620, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' })
    glow.onfinish = () => aura.remove()
    setTimeout(() => aura.remove(), 1500)
    replay(from, 'mtgfx-resolve', 700)
    await wait(220)
  }

  /** The line lights up and the counter ticks: a card just joined the deck. */
  function landed(name: string) {
    if (reduced())
      return
    replay(rowOf(name), 'mtgfx-landed')
    replay(counter(), 'mtgfx-tick', 500)
    if (!inFlight && completeWhenLanded) {
      const done = completeWhenLanded
      completeWhenLanded = null
      done()
    }
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
    // Once, when the flight ends (or never ran: a hidden tab has no frames).
    let over = false
    const finish = () => {
      if (over)
        return
      over = true
      card.remove()
      inFlight--
      landed(name)
    }
    const DURATION = 540
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
      if (t < 1 && !over) {
        requestAnimationFrame(step)
        return
      }
      finish()
    }
    inFlight++
    requestAnimationFrame(step)
    setTimeout(finish, DURATION + 800)
  }

  /** The hundredth card: once it has landed, the counter rings and the table says so. */
  function complete(label: string) {
    if (reduced())
      return
    const ring = () => {
      const el = counter()
      replay(el, 'mtgfx-complete', 1600)
      // Above the counter, not over its figures.
      const r = el?.getBoundingClientRect()
      useUniverseFx().burst(r ? { x: r.left + r.width / 2, y: r.top - 16 } : null, label, 'mtg')
    }
    completeWhenLanded = ring
  }

  /** A commander chosen: its card glints once. */
  function crowned() {
    if (reduced())
      return
    void nextTick(() => replay(document.querySelector<HTMLElement>('[data-deck-commander]'), 'mtgfx-crowned', 1400))
  }

  return { cast, deal, landed, complete, crowned }
}
