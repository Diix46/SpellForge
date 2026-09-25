<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

// The current password, then the new one twice.
const { t } = useLocale()
const { user, changePassword } = useAuth()
const toast = useToast()

const form = reactive({ current: '', next: '', confirm: '' })
const mismatch = computed(() => !!form.confirm && form.next !== form.confirm)
const ready = computed(() => form.current && form.next.length >= 8 && form.next === form.confirm)
const loading = ref(false)
const error = ref('')

async function save() {
  error.value = ''
  loading.value = true
  try {
    await changePassword(form.current, form.next)
    form.current = form.next = form.confirm = ''
    toast.add({ title: t('account.passwordChanged'), color: 'success', icon: 'i-lucide-check' })
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
    <!-- For password managers: the account this password belongs to. -->
    <input type="text" name="username" autocomplete="username" :value="user?.email" hidden readonly>
    <UFormField :label="t('account.currentPassword')">
      <UInput v-model="form.current" type="password" name="currentPassword" autocomplete="current-password" icon="i-lucide-lock" required class="w-full" />
    </UFormField>
    <UFormField :label="t('account.newPassword')" :help="t('account.passwordHelp')">
      <UInput v-model="form.next" type="password" name="newPassword" autocomplete="new-password" icon="i-lucide-key-round" minlength="8" required class="w-full" />
    </UFormField>
    <UFormField :label="t('account.confirmPassword')" :error="mismatch ? t('account.mismatch') : undefined">
      <UInput v-model="form.confirm" type="password" name="confirmPassword" autocomplete="new-password" icon="i-lucide-key-round" required class="w-full" />
    </UFormField>
    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
    <UButton type="submit" :loading="loading" :disabled="!ready" icon="i-lucide-key-round">
      {{ t('account.changePassword') }}
    </UButton>
  </form>
</template>
