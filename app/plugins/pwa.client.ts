// Prism as an app on the phone's home screen: the service worker (public/sw.js)
// once the page is loaded, production only (in development it would serve
// stale builds).
export default defineNuxtPlugin(() => {
  if (import.meta.dev || !('serviceWorker' in navigator))
    return
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
})
