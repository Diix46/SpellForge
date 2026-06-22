import { onBeforeUnmount, onMounted } from 'vue'

// Reveal-on-scroll: adds `.is-revealed` to any element carrying `data-reveal`
// once it scrolls into view (one-shot). Honors prefers-reduced-motion by
// revealing everything immediately. Client-only (SPA build). Scoped to a root
// element so a page can opt in without a global observer.

export function useScrollReveal(getRoot: () => HTMLElement | null | undefined) {
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    if (!import.meta.client)
      return
    const root = getRoot()
    if (!root)
      return

    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      els.forEach(el => el.classList.add('is-revealed'))
      return
    }

    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed')
          observer!.unobserve(entry.target)
        }
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' })

    els.forEach(el => observer!.observe(el))
  })

  onBeforeUnmount(() => observer?.disconnect())
}
