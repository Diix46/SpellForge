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
    refreshSession,
  }
}
