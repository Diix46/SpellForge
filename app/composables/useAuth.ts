// Thin wrapper over nuxt-auth-utils' useUserSession + the auth API routes.
// `user`/`loggedIn` are reactive and shared (nuxt-auth-utils uses useState).
export interface SessionUser { id: string, email: string, displayName: string }

export function useAuth() {
  const { loggedIn, user, fetch: refreshSession, clear } = useUserSession()

  async function register(email: string, password: string, displayName?: string) {
    await $fetch('/api/auth/register', { method: 'POST', body: { email, password, displayName } })
    await refreshSession()
  }

  async function login(email: string, password: string) {
    await $fetch('/api/auth/login', { method: 'POST', body: { email, password } })
    await refreshSession()
  }

  /** Display name and/or e-mail; a new e-mail needs the current password. */
  async function updateAccount(patch: { displayName?: string, email?: string, currentPassword?: string }) {
    await $fetch('/api/account', { method: 'PATCH', body: patch })
    await refreshSession()
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await $fetch('/api/account/password', { method: 'POST', body: { currentPassword, newPassword } })
  }

  /** The account and its decks, for good; the session ends with it. */
  async function deleteAccount(password: string) {
    await $fetch('/api/account', { method: 'DELETE', body: { password } })
    await clear()
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await clear()
  }

  return {
    loggedIn,
    user: user as Ref<SessionUser | null>,
    register,
    login,
    logout,
    updateAccount,
    changePassword,
    deleteAccount,
    refreshSession,
  }
}
