<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
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

// Tabs items (idiomatic UTabs toggle between login / register).
const tabItems = computed(() => [
  { label: t('auth.login'), value: 'login' as const },
  { label: t('auth.register'), value: 'register' as const },
])

watch(open, (isOpen) => {
  if (!isOpen) {
    error.value = ''
    form.password = ''
    showPassword.value = false
  }
})

watch(mode, () => {
  error.value = ''
})

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
    :ui="{ content: 'sm:max-w-sm' }"
  >
    <template #body>
      <UTabs
        v-model="mode"
        :items="tabItems"
        :content="false"
        size="sm"
        color="primary"
        class="mb-5 w-full"
      />

      <form class="space-y-3" @submit.prevent="submit">
        <UInput
          v-if="mode === 'register'"
          v-model="form.displayName"
          name="displayName"
          autocomplete="off"
          icon="i-lucide-user"
          size="lg"
          :placeholder="t('auth.displayName')"
          class="w-full"
        />

        <UInput
          v-model="form.email"
          type="email"
          name="email"
          autocomplete="email"
          required
          icon="i-lucide-mail"
          size="lg"
          :placeholder="t('auth.email')"
          class="w-full"
        />

        <UInput
          v-model="form.password"
          :type="showPassword ? 'text' : 'password'"
          name="password"
          :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
          required
          icon="i-lucide-lock"
          size="lg"
          :placeholder="t('auth.password')"
          :ui="{ trailing: 'pe-1' }"
          class="w-full"
        >
          <template #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :aria-label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
              @click="showPassword = !showPassword"
            />
          </template>
        </UInput>

        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          icon="i-lucide-alert-triangle"
          :description="error"
          :ui="{ description: 'text-sm' }"
        />

        <UButton
          type="submit"
          block
          color="primary"
          size="lg"
          :loading="loading"
          :icon="mode === 'register' ? 'i-lucide-sparkles' : 'i-lucide-log-in'"
        >
          {{ mode === 'login' ? t('auth.login') : t('auth.register') }}
        </UButton>
      </form>

      <p class="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <UIcon name="i-lucide-cloud" class="size-3.5" />
        {{ t('auth.cloudNote') }}
      </p>
    </template>
  </UModal>
</template>
