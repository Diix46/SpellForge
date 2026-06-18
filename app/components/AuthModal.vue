<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useLocale } from '~/composables/useLocale'

const open = defineModel<boolean>('open', { required: true })

const { t } = useLocale()
const { login, register } = useAuth()
const toast = useToast()

const mode = ref<'login' | 'register'>('login')
const form = reactive({ email: '', password: '', displayName: '' })
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)

// Reset transient state whenever the modal closes so it reopens clean.
watch(open, (isOpen) => {
  if (!isOpen) {
    error.value = ''
    form.password = ''
    showPassword.value = false
  }
})

function setMode(next: 'login' | 'register') {
  if (mode.value === next)
    return
  mode.value = next
  error.value = ''
}

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'register')
      await register(form.email, form.password, form.displayName)
    else
      await login(form.email, form.password)
    toast.add({ title: mode.value === 'register' ? t('auth.welcome') : t('auth.loggedIn'), color: 'success', icon: 'i-lucide-check' })
    open.value = false
    form.password = ''
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || e?.message || t('auth.error')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')"
    :description="mode === 'login' ? t('auth.subLogin') : t('auth.subRegister')"
    :ui="{
      overlay: 'bg-ink-950/75 backdrop-blur-[6px]',
      content: 'glass rounded-[var(--radius-2xl)] w-[calc(100vw-2rem)] sm:max-w-[24rem]',
      header: 'px-6 pt-5 pb-4 border-b border-(--color-border-hairline)',
      title: 'font-display text-base font-semibold',
      description: 'text-sm text-(--color-text-muted) mt-0.5',
      body: 'px-6 py-5',
    }"
  >
    <template #body>
      <!-- segmented mode toggle (sober, matches the deck-page tabs) -->
      <div class="seg" role="tablist">
        <span class="seg-thumb" :class="mode === 'register' && 'seg-thumb--right'" />
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'login'"
          class="seg-btn"
          :class="mode === 'login' ? 'seg-btn--on' : 'seg-btn--off'"
          @click="setMode('login')"
        >
          {{ t('auth.login') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'register'"
          class="seg-btn"
          :class="mode === 'register' ? 'seg-btn--on' : 'seg-btn--off'"
          @click="setMode('register')"
        >
          {{ t('auth.register') }}
        </button>
      </div>

      <form class="mt-4 space-y-3" @submit.prevent="submit">
        <Transition name="field">
          <div v-if="mode === 'register'" class="field">
            <UIcon name="i-lucide-user" class="field-icon" />
            <input
              v-model="form.displayName"
              name="displayName"
              type="text"
              autocomplete="off"
              :placeholder="t('auth.displayName')"
              class="field-input"
            >
          </div>
        </Transition>

        <div class="field">
          <UIcon name="i-lucide-mail" class="field-icon" />
          <input
            v-model="form.email"
            type="email"
            name="email"
            autocomplete="email"
            required
            :placeholder="t('auth.email')"
            class="field-input"
          >
        </div>

        <div class="field">
          <UIcon name="i-lucide-lock" class="field-icon" />
          <input
            v-model="form.password"
            :type="showPassword ? 'text' : 'password'"
            name="password"
            :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
            required
            :placeholder="t('auth.password')"
            class="field-input pr-10"
          >
          <button
            type="button"
            class="field-eye"
            :aria-label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
            @click="showPassword = !showPassword"
          >
            <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="h-4 w-4" />
          </button>
        </div>

        <Transition name="field">
          <p v-if="error" class="flex items-center gap-2 rounded-[var(--radius-md)] border border-(--color-error)/40 bg-(--color-error)/10 px-3 py-2 text-sm text-(--color-error)">
            <UIcon name="i-lucide-alert-triangle" class="h-4 w-4 shrink-0" />
            {{ error }}
          </p>
        </Transition>

        <UButton
          type="submit"
          block
          color="primary"
          size="lg"
          :loading="loading"
          :icon="mode === 'register' ? 'i-lucide-sparkles' : 'i-lucide-log-in'"
          class="mt-1 font-medium"
        >
          {{ mode === 'login' ? t('auth.login') : t('auth.register') }}
        </UButton>
      </form>

      <p class="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-(--color-text-muted)">
        <UIcon name="i-lucide-cloud" class="h-3.5 w-3.5" />
        {{ t('auth.cloudNote') }}
      </p>
    </template>
  </UModal>
</template>

<style scoped>
/* Segmented toggle — sober, accent-soft active pill (matches the rest). */
.seg {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
}
.seg-thumb {
  position: absolute;
  inset: 4px 50% 4px 4px;
  border-radius: calc(var(--radius-md) - 4px);
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--accent-border);
  transition: transform var(--dur) var(--ease-spring);
}
.seg-thumb--right {
  transform: translateX(calc(100% + 4px));
}
.seg-btn {
  position: relative;
  z-index: 1;
  border-radius: calc(var(--radius-md) - 4px);
  padding: 0.4rem 0.5rem;
  font-size: 0.8rem;
  font-weight: 500;
  transition: color var(--dur) var(--ease-out);
}
.seg-btn--on {
  color: var(--accent-text);
}
.seg-btn--off {
  color: var(--color-text-muted);
}
.seg-btn--off:hover {
  color: var(--color-text-high);
}

/* Dark-glass field (same idiom as the rest of the app). */
.field {
  position: relative;
  display: flex;
  align-items: center;
}
.field-icon {
  position: absolute;
  left: 0.8rem;
  height: 1rem;
  width: 1rem;
  color: var(--color-text-muted);
  transition: color var(--dur) var(--ease-out);
  pointer-events: none;
}
.field-input {
  width: 100%;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface-2);
  padding: 0.6rem 0.85rem 0.6rem 2.4rem;
  font-size: 0.9rem;
  color: var(--color-text-high);
  transition:
    border-color var(--dur) var(--ease-out),
    box-shadow var(--dur) var(--ease-out);
}
.field-input::placeholder {
  color: var(--color-text-muted);
}
.field-input:hover {
  border-color: var(--color-border-strong);
}
.field-input:focus {
  outline: none;
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.12);
}
.field:focus-within .field-icon {
  color: var(--accent-text);
}
.field-eye {
  position: absolute;
  right: 0.5rem;
  display: grid;
  height: 1.75rem;
  width: 1.75rem;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition:
    color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}
.field-eye:hover {
  color: var(--color-text-high);
  background: var(--color-surface-3);
}

/* Field reveal on mode switch / error. */
.field-enter-active,
.field-leave-active {
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out),
    max-height var(--dur-slow) var(--ease-out);
  overflow: hidden;
}
.field-enter-from,
.field-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  max-height: 0;
}
.field-enter-to,
.field-leave-from {
  opacity: 1;
  max-height: 4rem;
}

@media (prefers-reduced-motion: reduce) {
  .seg-thumb {
    transition: none;
  }
}
</style>
