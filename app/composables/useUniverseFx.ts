/**
 * The universe's wink when a card is added: a manga "DON!!" that pops and
 * bounces by day, a gold word that rises and fades by night. Pure DOM, one
 * short-lived element per burst; nothing under reduced motion.
 */
export function useUniverseFx() {
  function burst(at: { x: number, y: number } | HTMLElement | null, text: string, universe: 'optcg' | 'mtg') {
    if (!import.meta.client || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return
    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    if (at instanceof HTMLElement) {
      const r = at.getBoundingClientRect()
      x = r.left + r.width / 2
      y = r.top + r.height / 3
    }
    else if (at) {
      x = at.x
      y = at.y
    }

    const el = document.createElement('div')
    el.className = `ufx ufx--${universe}`
    el.textContent = text
    el.setAttribute('aria-hidden', 'true')
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    // A slight random tilt so two bursts never look stamped.
    el.style.setProperty('--ufx-tilt', `${(Math.random() * 16 - 8).toFixed(1)}deg`)
    document.body.appendChild(el)
    el.addEventListener('animationend', () => el.remove(), { once: true })
    // Safety net if the animation never runs (hidden tab).
    setTimeout(() => el.remove(), 2000)
  }
  return { burst }
}
