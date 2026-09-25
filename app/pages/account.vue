<script setup lang="ts">
import { computed } from 'vue'

// My account: profile, password, deletion. For members; a guest is asked to
// sign in.
const { t } = useLocale()
const { loggedIn, user } = useAuth()
const { decks } = useDeckStore()
const members = useMembersOnly()

useSeoMeta({ title: () => t('account.title'), robots: 'noindex' })

const initials = computed(() => (user.value?.displayName ?? '·').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())
</script>

<template>
  <div class="account fade-up">
    <h1 class="account-title">
      {{ t('account.title') }}
    </h1>

    <section v-if="!loggedIn" class="card guest">
      <p>{{ t('account.guest') }}</p>
      <UButton icon="i-lucide-log-in" @click="members.require('decks')">
        {{ t('members.login') }}
      </UButton>
    </section>

    <template v-else>
      <section class="card who">
        <span class="avatar">{{ initials }}</span>
        <div class="min-w-0">
          <p class="who-name">
            {{ user?.displayName }}
          </p>
          <p class="who-sub">
            {{ user?.email }} · {{ t('account.decks').replace('{n}', String(decks.length)) }}
          </p>
        </div>
      </section>

      <section class="card">
        <h2>{{ t('account.profile') }}</h2>
        <p class="help">
          {{ t('account.profileHelp') }}
        </p>
        <AccountProfileForm />
      </section>

      <section class="card">
        <h2>{{ t('account.password') }}</h2>
        <AccountPasswordForm />
      </section>

      <section class="card danger">
        <h2>{{ t('account.danger') }}</h2>
        <p class="help">
          {{ t('account.dangerHelp') }}
        </p>
        <AccountDeleteForm />
      </section>
    </template>
  </div>
</template>

<style scoped>
.account {
  display: grid;
  gap: 18px;
  max-width: 620px;
  margin: 0 auto;
  padding-bottom: 40px;
}
.account-title {
  margin: 0 0 4px;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--color-text-high);
}
.card {
  padding: 22px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: var(--color-surface-1);
  box-shadow: var(--shadow-elev-1);
}
.card h2 {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-high);
}
.help {
  margin: 0 0 16px;
  font-size: 13.5px;
  color: var(--color-text-muted);
}
.card h2 + form {
  margin-top: 14px;
}
.guest {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: var(--color-text-mid);
}
.guest p {
  margin: 0;
}
.who {
  display: flex;
  align-items: center;
  gap: 14px;
}
.avatar {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-text);
  font-weight: 600;
}
.who-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-high);
}
.who-sub {
  margin: 2px 0 0;
  font-size: 13.5px;
  color: var(--color-text-muted);
}
.danger {
  border-color: color-mix(in srgb, var(--ui-error) 45%, transparent);
}
.danger h2 {
  color: var(--ui-error);
}
</style>
