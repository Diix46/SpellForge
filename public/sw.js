/*
 * Prism's service worker: the app opens without network, with the member's
 * collection as last seen.
 * - The build's files (/_nuxt/), fonts and textures: from the cache, fetched
 *   once (their names change with each version).
 * - Card images: from the cache when there, kept up to 600.
 * - Pages and the collection's API: from the network, the last answer kept
 *   for when the network is gone.
 * Nothing else is cached (accounts, writes, other APIs go to the network).
 */
const VERSION = 'prism-v1'
const STATIC = `${VERSION}-static`
const IMAGES = `${VERSION}-images`
const PAGES = `${VERSION}-pages`
const MAX_IMAGES = 600

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then(c => c.addAll(['/', '/offline.html'])).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (!key.startsWith(VERSION))
        await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (const k of keys.slice(0, Math.max(0, keys.length - max)))
    await cache.delete(k)
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit)
    return hit
  const res = await fetch(request)
  if (res.ok) {
    await cache.put(request, res.clone())
    if (max)
      void trim(cacheName, max)
  }
  return res
}

async function networkFirst(request, fallback) {
  const cache = await caches.open(PAGES)
  try {
    const res = await fetch(request)
    if (res.ok)
      await cache.put(request, res.clone())
    return res
  }
  catch (err) {
    const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' })
    if (hit)
      return hit
    if (fallback)
      return (await cache.match(fallback)) ?? Response.error()
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET')
    return
  const url = new URL(request.url)
  if (url.origin !== location.origin)
    return
  if (url.pathname.startsWith('/_nuxt/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/textures/') || url.pathname.startsWith('/icons/'))
    return event.respondWith(cacheFirst(request, STATIC))
  if (url.pathname.startsWith('/api/images/'))
    return event.respondWith(cacheFirst(request, IMAGES, MAX_IMAGES))
  if (request.mode === 'navigate')
    return event.respondWith(networkFirst(request, '/offline.html'))
  if (url.pathname === '/api/collection' || url.pathname.startsWith('/api/collection/sets') || url.pathname === '/api/collection/highlights' || url.pathname === '/api/_auth/session')
    return event.respondWith(networkFirst(request))
})
