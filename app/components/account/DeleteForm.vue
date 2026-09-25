<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

// Deleting the account: the password and a typed word, so it is never a slip.
const { t } = useLocale()
const { deleteAccount } = useAuth()
const toast = useToast()

const form = reactive({ password: '', word: '' })
const ready = computed(() => !!form.password && form.word.trim().toUpperCase() === t('account.deleteWord'))
const loading = ref(false)
const error = ref('')

async function remove() {
  error.value = ''
  loading.value = true
  try {
    await deleteAccount(form.password)
    toast.add({ title: t('account.deleted'), color: 'neutral', icon: 'i-lucide-trash-2' })
    await navigateTo('/')
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
  <form class="space-y-4" @submit.prevent="remove">
    <UFormField :label="t('account.currentPassword')">
      <UInput v-model="form.password" type="password" name="password" autocomplete="current-password" icon="i-lucide-lock" required class="w-full" />
    </UFormField>
    <UFormField :label="t('account.deleteConfirm')">
      <UInput v-model="form.word" name="confirm" autocomplete="off" :placeholder="t('account.deleteWord')" class="w-full" />
    </UFormField>
    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
    <UButton type="submit" color="error" :loading="loading" :disabled="!ready" icon="i-lucide-trash-2">
      {{ t('account.delete') }}
    </UButton>
  </form>
</template>
