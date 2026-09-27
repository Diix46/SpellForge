// Errors of the app in the visitor's browser, sent to the server's journal
// (api/errors): each message once per visit, ten at most.
export default defineNuxtPlugin((nuxtApp) => {
  const sent = new Set<string>()
  function report(err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err))
    // Network hiccups and aborted loads are not bugs.
    if (sent.size >= 10 || sent.has(e.message) || /Failed to fetch|NetworkError|Load failed|aborted|ResizeObserver/i.test(e.message))
      return
    sent.add(e.message)
    void $fetch('/api/errors', { method: 'POST', body: { message: e.message, stack: e.stack, url: location.pathname } }).catch(() => {})
  }
  nuxtApp.hook('vue:error', report)
  nuxtApp.hook('app:error', report)
  window.addEventListener('unhandledrejection', e => report(e.reason))
})
