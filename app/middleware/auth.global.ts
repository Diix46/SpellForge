// Auth wall: members-only content requires a session. "/" is public — it shows
// the marketing landing to guests and the dashboard to members (handled in the
// page itself), so there is no /landing route. Shared deck links stay public.
// Everything else (deck editor, etc.) redirects guests to "/".
//
// SPA build (ssr:false): nuxt-auth-utils resolves the session client-side, so
// `loggedIn` is reliable by the time route middleware runs on navigation.

const PUBLIC_PREFIXES = ['/shared']

function isPublic(path: string): boolean {
  if (path === '/')
    return true // "/" serves the landing for guests
  return PUBLIC_PREFIXES.some(p => path === p || path.startsWith(`${p}/`))
}

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value && !isPublic(to.path))
    return navigateTo('/')
})
