<script setup lang="ts">
import { onMounted, ref } from 'vue'

// "Install the app", in the phone's menu: the browser's own prompt where it
// has one (Android, desktop Chrome), the way to do it by hand on an iPhone
// (Share, then "On the home screen"). Hidden once installed.
interface InstallPrompt extends Event { prompt: () => Promise<void>, userChoice: Promise<{ outcome: string }> }

const { t } = useLocale()
const prompt = ref<InstallPrompt | null>(null)
const ios = ref(false)
const installed = ref(true)
const showHelp = ref(false)

onMounted(() => {
  installed.value = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  ios.value = /iphone|ipad|ipod/i.test(navigator.userAgent)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    prompt.value = e as InstallPrompt
  })
  window.addEventListener('appinstalled', () => (installed.value = true))
})

async function install() {
  if (prompt.value) {
    await prompt.value.prompt()
    prompt.value = null
    return
  }
  showHelp.value = !showHelp.value
}
</script>

<template>
  <div v-if="!installed && (prompt || ios)" class="install">
    <button type="button" class="nav-link" @click="install">
      <UIcon name="i-lucide-smartphone" class="ic" />
      <span>{{ t('install.button') }}</span>
    </button>
    <p v-if="showHelp" class="help">
      {{ t('install.ios') }}
    </p>
  </div>
</template>

<style scoped>
.nav-link {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 11px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 13.5px;
  font-weight: 450;
  cursor: pointer;
}
.nav-link:hover {
  background: var(--color-surface-2);
  color: var(--color-text-high);
}
.nav-link .ic {
  width: 16px;
  height: 16px;
}
.help {
  margin: 4px 11px 8px;
  font-size: 13px;
  color: var(--color-text-muted);
}
</style>
