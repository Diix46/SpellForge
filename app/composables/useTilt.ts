import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Mouse-reactive 3D tilt. Feeds --rx / --ry CSS vars (degrees) so a `.tilt`
 * element (see main.css) rotates toward the cursor. rAF-throttled, no Vue
 * reactivity in the hot path. No-op under prefers-reduced-motion.
 */
export function useTilt(max = 8) {
  const el = ref<HTMLElement | null>(null)
  let frame = 0
  const reduce = import.meta.client && matchMedia('(prefers-reduced-motion: reduce)').matches

  const onMove = (e: PointerEvent) => {
    if (reduce || !el.value)
      return
    const r = el.value.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      el.value!.style.setProperty('--ry', `${px * max}deg`)
      el.value!.style.setProperty('--rx', `${-py * max}deg`)
    })
  }
  const onEnter = () => el.value?.style.setProperty('will-change', 'transform')
  const onLeave = () => {
    if (!el.value)
      return
    el.value.style.setProperty('--rx', '0deg')
    el.value.style.setProperty('--ry', '0deg')
    el.value.style.removeProperty('will-change')
  }

  onMounted(() => {
    el.value?.addEventListener('pointermove', onMove)
    el.value?.addEventListener('pointerenter', onEnter)
    el.value?.addEventListener('pointerleave', onLeave)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    el.value?.removeEventListener('pointermove', onMove)
    el.value?.removeEventListener('pointerenter', onEnter)
    el.value?.removeEventListener('pointerleave', onLeave)
  })

  return { el }
}
