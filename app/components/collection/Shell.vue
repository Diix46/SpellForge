<script setup lang="ts">
import type { GameId } from '#shared/game'
import { onMounted, watch } from 'vue'

// Around every collection page: the title, the tabs (copies, sets), the add
// button and its dialog; guests are asked to sign in instead.
const props = defineProps<{ game: GameId }>()

const { t } = useLocale()
const { loggedIn } = useAuth()
const members = useMembersOnly()
const collection = useCollection(props.game)
const { state: add, openAdd } = useCollectionAdd()

onMounted(() => {
  if (loggedIn.value)
    void collection.load()
})
watch(loggedIn, (v) => {
  if (v)
    void collection.load(true)
})

const tabs = [
  { to: collectionPath(props.game), label: 'collection.tabCopies', icon: 'i-lucide-layers', exact: true },
  { to: collectionPath(props.game, '/sets'), label: 'collection.tabSets', icon: 'i-lucide-library-big', exact: false },
]
</script>

<template>
  <div class="collection fade-up">
    <header class="head">
      <div class="min-w-0">
        <h1 class="title">
          {{ t('collection.title') }}
        </h1>
        <p class="sub">
          {{ t(`collection.subtitle.${game}`) }}
        </p>
      </div>
      <UButton v-if="loggedIn" icon="i-lucide-plus" size="lg" @click="openAdd()">
        {{ t('collection.add') }}
      </UButton>
    </header>

    <section v-if="!loggedIn" class="panel center">
      <UIcon name="i-lucide-gem" class="h-9 w-9 text-(--accent-text)" />
      <p>{{ t('members.collection') }}</p>
      <UButton icon="i-lucide-log-in" @click="members.require('collection')">
        {{ t('members.login') }}
      </UButton>
    </section>

    <template v-else>
      <nav class="tabs" :aria-label="t('collection.title')">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="tab"
          :active-class="tab.exact ? '' : 'is-active'"
          :exact-active-class="tab.exact ? 'is-active' : ''"
        >
          <UIcon :name="tab.icon" class="h-4 w-4" />
          {{ t(tab.label) }}
        </NuxtLink>
      </nav>
      <slot />
      <CollectionAddDialog v-model:open="add.open" :game="game" :initial-query="add.query" :initial-printing="add.printing" />
    </template>
  </div>
</template>

<style scoped>
.collection {
  display: grid;
  gap: 20px;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.title {
  margin: 0 0 6px;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--color-text-high);
}
.sub {
  margin: 0;
  max-width: 62ch;
  font-size: 14px;
  color: var(--color-text-muted);
}
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--color-border-subtle);
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: -1px;
  padding: 10px 14px;
  border-bottom: 2px solid transparent;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-muted);
  transition:
    color 0.15s,
    border-color 0.15s;
}
.tab:hover {
  color: var(--color-text-high);
}
.tab.is-active {
  border-bottom-color: var(--ui-primary);
  color: var(--color-text-high);
}
.panel {
  padding: 36px 24px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: var(--color-surface-1);
}
.center {
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
  color: var(--color-text-mid);
}
</style>
