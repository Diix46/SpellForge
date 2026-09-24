import { computed, nextTick } from 'vue'

// Recomposed French cards (scripts/recompose) or Scryfall's official scans.
// Kept in a cookie the API reads (server/utils/images/recomposed.ts): the
// server then leaves the recomposed images out of every card and printing it
// sends, so no component has to rewrite image URLs. Switching reloads the app,
// which drops the cards and printings already fetched.
const COOKIE = 'prism_scans'

export function useScanPreference() {
  const cookie = useCookie<'official' | 'recomposed' | null>(COOKIE, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  const official = computed(() => cookie.value === 'official')

  async function setOfficial(value: boolean) {
    cookie.value = value ? 'official' : 'recomposed'
    // useCookie writes the cookie on the next tick: reload only once it is set,
    // or the API would still see the old preference.
    await nextTick()
    reloadNuxtApp({ persistState: false })
  }

  return { official, setOfficial }
}
