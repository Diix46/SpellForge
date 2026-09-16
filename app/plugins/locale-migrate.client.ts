import { hasLocaleCookie, takeLegacyLocale } from '~/composables/useLocale'

// A server-rendered first visit hands the locale over from the payload, so
// useLocale never looks at the pre-cookie choice. Pick it up once the page is
// mounted (changing it earlier would break hydration).
export default defineNuxtPlugin((nuxtApp) => {
  const { setLocale } = useLocale()
  nuxtApp.hook('app:mounted', () => {
    if (hasLocaleCookie())
      return
    const legacy = takeLegacyLocale()
    if (legacy)
      setLocale(legacy)
  })
})
