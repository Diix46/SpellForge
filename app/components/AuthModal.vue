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
    :ui="{
      overlay: 'bg-ink-950/75 backdrop-blur-[8px]',
      content: 'auth-modal w-[calc(100vw-2rem)] sm:max-w-[26rem]',
      header: 'sr-only',
      body: 'p-0 sm:p-0',
    }"
  >
    <template #body>
      <!-- Animated accent neon border wraps the whole panel -->
      <div class="auth-ring relative overflow-hidden rounded-[var(--radius-2xl)]">
        <button
          type="button"
          class="auth-close"
          :aria-label="t('auth.close')"
          @click="open = false"
        >
          <UIcon name="i-lucide-x" class="h-4 w-4" />
        </button>

        <!-- atmospheric header: prism + drifting mana motes + grid texture -->
        <div class="auth-head relative overflow-hidden px-6 pb-5 pt-7">
          <div class="grid-texture pointer-events-none absolute inset-0 opacity-60" />
          <span class="mote mote-1" />
          <span class="mote mote-2" />
          <span class="mote mote-3" />

          <div class="relative flex flex-col items-center text-center">
            <AppLogo :wordmark="false" :size="44" class="bob" />
            <h2 class="mt-3 font-display text-2xl font-extrabold tracking-tight text-(--color-text-high)">
              {{ mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle') }}
            </h2>
            <p class="mt-1 font-mono text-[11px] uppercase tracking-[2px] text-(--color-text-muted)">
              {{ mode === 'login' ? t('auth.subLogin') : t('auth.subRegister') }}
            </p>
          </div>
        </div>

        <div class="relative px-6 pb-7">
          <!-- segmented mode toggle with sliding neon indicator -->
          <div
            class="seg relative mb-5 grid grid-cols-2 gap-1 rounded-[var(--radius-lg)] border border-(--color-border-subtle) bg-(--color-surface-1)/80 p-1"
            role="tablist"
          >
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

          <form class="space-y-3" @submit.prevent="submit">
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

            <button
              type="submit"
              class="cta neon-ring"
              :disabled="loading"
            >
              <UIcon
                :name="loading ? 'i-lucide-loader-circle' : (mode === 'register' ? 'i-lucide-sparkles' : 'i-lucide-log-in')"
                class="h-4 w-4"
                :class="loading && 'animate-spin'"
              />
              <span>{{ mode === 'login' ? t('auth.login') : t('auth.register') }}</span>
            </button>
          </form>

          <p class="mt-4 text-center font-mono text-[10px] uppercase tracking-[1.5px] text-(--color-text-disabled)">
            {{ t('auth.cloudNote') }}
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
/* The modal inherits the app accent (neutral platinum by default; the dynamic
   mana accent if ever scoped). All glows/focus below derive from --accent-*. */
.auth-ring {
  background:
    radial-gradient(120% 80% at 50% -10%, rgba(var(--accent-rgb), 0.1), transparent 60%), var(--color-surface-1);
}

/* Close button: subtle by default, cyan on hover, top-right over the header. */
.auth-close {
  position: absolute;
  right: 0.75rem;
  top: 0.75rem;
  z-index: 2;
  display: grid;
  height: 2rem;
  width: 2rem;
  place-items: center;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.04);
  transition:
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}
.auth-close:hover {
  color: var(--accent-text);
  background: rgba(var(--accent-rgb), 0.12);
  box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.4);
}

/* Header band: a touch lighter, with a hairline gradient seam at the bottom. */
.auth-head {
  background: linear-gradient(180deg, rgba(var(--accent-rgb), 0.06), transparent 90%);
  border-bottom: 1px solid var(--color-border-subtle);
}
.auth-head::after {
  content: '';
  position: absolute;
  inset: auto 0 -1px 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(var(--accent-rgb), 0.7),
    rgba(var(--accent-rgb-2), 0.5),
    transparent
  );
}

/* Drifting mana motes in the header for atmosphere. */
.mote {
  position: absolute;
  border-radius: var(--radius-full);
  background: rgba(var(--accent-rgb), 0.55);
  filter: blur(1px);
  box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.6);
  pointer-events: none;
}
.mote-1 {
  width: 4px;
  height: 4px;
  left: 14%;
  top: 60%;
  animation: drift 7s ease-in-out infinite;
}
.mote-2 {
  width: 3px;
  height: 3px;
  right: 18%;
  top: 30%;
  animation: drift 9s ease-in-out infinite reverse;
}
.mote-3 {
  width: 2px;
  height: 2px;
  right: 32%;
  top: 70%;
  animation: drift 6s ease-in-out infinite 1s;
}
@keyframes drift {
  0%,
  100% {
    transform: translate(0, 0);
    opacity: 0.5;
  }
  50% {
    transform: translate(6px, -12px);
    opacity: 1;
  }
}

/* Segmented toggle. */
.seg-thumb {
  position: absolute;
  inset: 4px 50% 4px 4px;
  border-radius: calc(var(--radius-lg) - 4px);
  background: rgba(var(--accent-rgb), 0.16);
  box-shadow:
    inset 0 0 0 1px rgba(var(--accent-rgb), 0.45),
    0 0 16px -4px rgba(var(--accent-rgb), 0.7);
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.seg-thumb--right {
  transform: translateX(calc(100% + 2px));
}
.seg-btn {
  position: relative;
  z-index: 1;
  border-radius: calc(var(--radius-lg) - 4px);
  padding: 0.5rem 0.5rem;
  font-family: var(--font-display);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.3px;
  transition: color 0.25s ease;
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

/* Themed dark-glass field. */
.field {
  position: relative;
  display: flex;
  align-items: center;
}
.field-icon {
  position: absolute;
  left: 0.85rem;
  height: 1rem;
  width: 1rem;
  color: var(--color-text-muted);
  transition: color 0.2s ease;
  pointer-events: none;
}
.field-input {
  width: 100%;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface-2);
  padding: 0.7rem 0.9rem 0.7rem 2.5rem;
  font-size: 0.9rem;
  color: var(--color-text-high);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}
.field-input::placeholder {
  color: var(--color-text-muted);
}
.field-input:hover {
  border-color: var(--color-border-strong);
}
.field-input:focus {
  outline: none;
  border-color: rgba(var(--accent-rgb), 0.6);
  background: var(--color-surface-3);
  box-shadow:
    0 0 0 3px rgba(var(--accent-rgb), 0.15),
    0 0 18px -6px rgba(var(--accent-rgb), 0.8);
}
.field:focus-within .field-icon {
  color: var(--accent-text);
}
.field-eye {
  position: absolute;
  right: 0.6rem;
  display: grid;
  height: 1.75rem;
  width: 1.75rem;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition:
    color 0.2s ease,
    background 0.2s ease;
}
.field-eye:hover {
  color: var(--color-text-high);
  background: rgba(255, 255, 255, 0.06);
}

/* Hero CTA: gradient fill + animated neon ring, dark legible label. */
.cta {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: var(--radius-md);
  padding: 0.75rem 1rem;
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0.4px;
  color: var(--color-text-on-neon);
  background: var(--gradient-accent);
  box-shadow: 0 0 22px -8px rgba(var(--accent-rgb), 0.8);
  transition:
    transform 0.15s ease,
    box-shadow 0.2s ease,
    filter 0.2s ease;
}
.cta:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: 0 0 30px -4px rgba(var(--accent-rgb), 0.95);
}
.cta:active:not(:disabled) {
  transform: translateY(1px);
}
.cta:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* Field enter/leave (mode switch + error). */
.field-enter-active,
.field-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease,
    max-height 0.3s ease;
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
  .mote,
  .bob,
  .neon-ring::before {
    animation: none !important;
  }
  .seg-thumb {
    transition: none;
  }
}
</style>
