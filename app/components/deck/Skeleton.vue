<script setup lang="ts">
// A shared deck while it loads: the page's shape, the title and a grid of
// cards, so nothing jumps when the list arrives.
const { t } = useLocale()
</script>

<template>
  <div class="deck-skeleton" role="status" :aria-label="t('share.loading')">
    <div class="skeleton line kicker" />
    <div class="skeleton line title" />
    <div class="grid">
      <div v-for="i in 12" :key="i" class="skeleton card" />
    </div>
  </div>
</template>

<style scoped>
.deck-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 70svh;
}
.line {
  border-radius: 6px;
}
.kicker {
  width: 180px;
  height: 14px;
}
.title {
  width: min(420px, 70%);
  height: 40px;
  margin-bottom: var(--space-2);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-1);
}
.card {
  aspect-ratio: 63 / 88;
  border-radius: 10px;
}
</style>
