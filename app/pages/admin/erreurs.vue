<script setup lang="ts">
import { computed, ref } from 'vue'

// The error journal (server, browsers, nightly refresh), for the admins.
interface LoggedError { at: string, source: 'server' | 'client' | 'refresh', message: string, where?: string, status?: number, stack?: string }

useSeoMeta({ title: 'Journal des erreurs', robots: 'noindex' })
const { data, error, refresh, status } = useFetch<{ errors: LoggedError[] }>('/api/admin/errors', { server: false })
const source = ref<'all' | LoggedError['source']>('all')
const list = computed(() => (data.value?.errors ?? []).filter(e => source.value === 'all' || e.source === source.value))
const open = ref<number | null>(null)
const when = (at: string) => new Date(at).toLocaleString('fr-FR')
</script>

<template>
  <div class="errors fade-up">
    <header class="head">
      <h1>Journal des erreurs</h1>
      <div class="tools">
        <USelect v-model="source" :items="[{ label: 'Tout', value: 'all' }, { label: 'Serveur', value: 'server' }, { label: 'Navigateurs', value: 'client' }, { label: 'Imports de nuit', value: 'refresh' }]" class="w-44" />
        <UButton color="neutral" variant="subtle" icon="i-lucide-refresh-cw" :loading="status === 'pending'" @click="refresh()">
          Actualiser
        </UButton>
      </div>
    </header>
    <p v-if="error" class="empty">
      Réservé à l'admin (NUXT_ADMIN_EMAILS).
    </p>
    <p v-else-if="!list.length && status !== 'pending'" class="empty">
      Rien à signaler.
    </p>
    <ul v-else class="list">
      <li v-for="(e, i) in list" :key="`${e.at}-${i}`" class="row" :class="`row--${e.source}`">
        <button type="button" class="line" @click="open = open === i ? null : i">
          <span class="src">{{ e.source }}</span>
          <span class="at">{{ when(e.at) }}</span>
          <span class="msg">{{ e.message }}</span>
          <span class="where">{{ e.status ? `${e.status} · ` : '' }}{{ e.where }}</span>
        </button>
        <pre v-if="open === i && e.stack" class="stack">{{ e.stack }}</pre>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.errors {
  display: grid;
  gap: var(--page-gap);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.head h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 600;
  color: var(--color-text-high);
}
.tools {
  display: flex;
  gap: 8px;
}
.empty {
  padding: 40px;
  text-align: center;
  color: var(--color-text-muted);
}
.list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.line {
  display: grid;
  grid-template-columns: 70px 150px 1fr auto;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-surface-1);
  text-align: left;
  font-size: 13px;
  cursor: pointer;
}
.src {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
}
.row--server .src {
  color: #e0443a;
}
.row--client .src {
  color: #d09a16;
}
.row--refresh .src {
  color: #6b8fd6;
}
.at,
.where {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.msg {
  overflow: hidden;
  color: var(--color-text-high);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.stack {
  margin: 4px 0 8px;
  padding: 10px;
  overflow-x: auto;
  border-radius: 8px;
  background: var(--color-surface-2);
  font-size: 11.5px;
}
</style>
