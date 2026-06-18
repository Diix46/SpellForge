<script setup lang="ts">
import { reactive, ref } from 'vue'
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
    :ui="{ overlay: 'bg-ink-950/70 backdrop-blur-[6px]', content: 'glass neon-edge rounded-[var(--radius-2xl)] sm:max-w-md' }"
  >
    <template #body>
      <form class="space-y-3" @submit.prevent="submit">
        <UInput
          v-if="mode === 'register'"
          v-model="form.displayName"
          name="displayName"
          :placeholder="t('auth.displayName')"
          icon="i-lucide-user"
          class="w-full"
        />
        <UInput
          v-model="form.email"
          type="email"
          name="email"
          autocomplete="email"
          :placeholder="t('auth.email')"
          icon="i-lucide-mail"
          class="w-full"
        />
        <UInput
          v-model="form.password"
          type="password"
          name="password"
          :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
          :placeholder="t('auth.password')"
          icon="i-lucide-lock"
          class="w-full"
        />

        <p v-if="error" class="rounded-[var(--radius-md)] border border-(--color-error)/40 bg-(--color-error)/10 px-3 py-2 text-sm text-(--color-error)">
          {{ error }}
        </p>

        <UButton
          type="submit"
          block
          color="primary"
          :loading="loading"
          :icon="mode === 'register' ? 'i-lucide-user-plus' : 'i-lucide-log-in'"
        >
          {{ mode === 'login' ? t('auth.login') : t('auth.register') }}
        </UButton>

        <button
          type="button"
          class="w-full text-center font-mono text-xs text-(--color-text-muted) transition-colors hover:text-(--accent-text)"
          @click="mode = mode === 'login' ? 'register' : 'login'"
        >
          {{ mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin') }}
        </button>
      </form>
    </template>
  </UModal>
</template>
