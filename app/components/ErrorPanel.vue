<script setup lang="ts">
// The one way the app says "nothing here": the error page, a card that doesn't
// exist, a shared deck whose link is dead. An icon (or the status code), what
// happened, and the way back in the `actions` slot.
withDefaults(defineProps<{
  title: string
  body?: string
  icon?: string
  /** The HTTP status, shown large on the error page. */
  code?: number
  /** A page whose whole subject is the error names it as its heading. */
  heading?: 'h1' | 'h2' | 'p'
}>(), { icon: 'i-lucide-search-x', heading: 'p' })
</script>

<template>
  <section class="error-panel" role="status">
    <p v-if="code" class="code">
      {{ code }}
    </p>
    <UIcon v-else :name="icon" class="icon" />
    <component :is="heading" class="title">
      {{ title }}
    </component>
    <p v-if="body" class="body">
      {{ body }}
    </p>
    <div v-if="$slots.actions" class="actions">
      <slot name="actions" />
    </div>
    <slot />
  </section>
</template>

<style scoped>
.error-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-5) 0;
  text-align: center;
}
.icon {
  width: 40px;
  height: 40px;
  color: var(--color-text-muted);
}
.code {
  margin: 0;
  font-family: 'Anton', Impact, sans-serif;
  font-size: clamp(88px, 14vw, 144px);
  line-height: 0.9;
  background: linear-gradient(90deg, #ef5a4c, #6f9fe0, #f0c43a, #9a6ad8, #2fb3c4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.title {
  margin: 0;
  color: var(--color-text-high);
  font-size: var(--title-section);
  font-weight: 700;
}
.body {
  max-width: 46ch;
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.55;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-1);
  margin-top: var(--space-1);
}
</style>
