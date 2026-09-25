<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

// Name and e-mail. The e-mail signs the account in, so changing it asks for
// the current password.
const { t } = useLocale()
const { user, updateAccount } = useAuth()
const toast = useToast()

const form = reactive({ displayName: '', email: '', currentPassword: '' })
watch(user, (u) => {
  form.displayName = u?.displayName ?? ''
  form.email = u?.email ?? ''
}, { immediate: true })

const emailChanged = computed(() => form.email.trim().toLowerCase() !== (user.value?.email ?? ''))
const dirty = computed(() => emailChanged.value || form.displayName.trim() !== (user.value?.displayName ?? ''))
const loading = ref(false)
const error = ref('')

async function save() {
  error.value = ''
  loading.value = true
  try {
    await updateAccount({
      displayName: form.displayName,
      ...(emailChanged.value ? { email: form.email, currentPassword: form.currentPassword } : {}),
    })
    form.currentPassword = ''
    toast.add({ title: t('account.saved'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (e: any) {
    error.value = e?.data?.message || t('auth.error')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="save">
    <UFormField :label="t('account.displayName')">
      <UInput v-model="form.displayName" name="displayName" autocomplete="nickname" icon="i-lucide-user" maxlength="60" required class="w-full" />
    </UFormField>
    <UFormField :label="t('account.email')" :help="emailChanged ? t('account.emailHelp') : undefined">
      <UInput v-model="form.email" type="email" name="email" autocomplete="email" icon="i-lucide-mail" required class="w-full" />
    </UFormField>
    <UFormField v-if="emailChanged" :label="t('account.currentPassword')">
      <UInput v-model="form.currentPassword" type="password" name="currentPassword" autocomplete="current-password" icon="i-lucide-lock" required class="w-full" />
    </UFormField>
    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
    <UButton type="submit" :loading="loading" :disabled="!dirty" icon="i-lucide-save">
      {{ t('account.save') }}
    </UButton>
  </form>
</template>
