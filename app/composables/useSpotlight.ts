import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Cursor-reactive spotlight / holo position. Feeds --mx / --my CSS vars (as %)
 * so a `.spotlight` or `.holo-sheen` element (see main.css) tracks the cursor.
 * rAF-throttled. No-op under prefers-reduced-motion.
 */
export function useSpotlight() {
  const el = ref<HTMLElement | null>(null)
  let frame = 0
  const reduce = import.meta.client && matchMedia('(prefers-reduced-motion: reduce)').matches

  const onMove = (e: PointerEvent) => {
    if (reduce || !el.value)
      return
    const r = el.value.getBoundingClientRect()
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      el.value!.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
      el.value!.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
    })
  }

  onMounted(() => el.value?.addEventListener('pointermove', onMove))
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    el.value?.removeEventListener('pointermove', onMove)
  })

  return { el }
}
