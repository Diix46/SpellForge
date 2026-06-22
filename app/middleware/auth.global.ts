// Auth wall: everything requires a session except the public landing page and
// shared deck links (designed to be opened by anyone with the URL). Guests are
// sent to /landing; logged-in users never see /landing (bounced to the app).
//
// SPA build (ssr:false): nuxt-auth-utils resolves the session client-side, so
// `loggedIn` is reliable by the time route middleware runs on navigation.

const PUBLIC_PREFIXES = ['/landing', '/shared']

function isPublic(path: string): boolean {
  return PUBLIC_PREFIXES.some(p => path === p || path.startsWith(`${p}/`))
}

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  // Logged-in users have no business on the marketing landing — send them in.
  if (loggedIn.value && to.path === '/landing')
    return navigateTo('/')

  // Guests may only see public routes; everything else redirects to the landing.
  if (!loggedIn.value && !isPublic(to.path))
    return navigateTo('/landing')
})
