<script setup lang="ts">
// The same small mark in the five games: this card is shown in its original
// language, its translation isn't out yet.
const { t } = useLocale()
</script>

<template>
  <abbr class="vo-badge" :title="t('card.vo.hint')">{{ t('card.vo') }}</abbr>
</template>

<style scoped>
.vo-badge {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  height: 16px;
  padding: 0 5px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  background: var(--color-surface-2);
  color: var(--color-text-mid);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
  text-decoration: none;
  vertical-align: middle;
  cursor: help;
}
</style>
