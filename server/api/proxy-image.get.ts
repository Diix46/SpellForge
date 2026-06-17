// Proxies card images so the browser can fetch() them for canvas/PDF use.
// The Scryfall image CDN (cards.scryfall.io) does not send CORS headers,
// so a direct client-side fetch() is blocked. Routing through our own
// server origin sidesteps that.

const ALLOWED_HOSTS = ['cards.scryfall.io', 'c1.scryfall.com', 'c2.scryfall.com', 'svgs.scryfall.io']

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const url = typeof query.url === 'string' ? query.url : ''

  if (!url) {
    throw createError({ statusCode: 400, statusMessage: 'url manquante' })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'url invalide' })
  }

  // Only allow proxying from known Scryfall image hosts.
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw createError({ statusCode: 403, statusMessage: 'hôte non autorisé' })
  }

  const upstream = await fetch(parsed.toString(), {
    headers: { 'User-Agent': 'MTGProxyPrinter/1.0' },
  })

  if (!upstream.ok) {
    throw createError({ statusCode: upstream.status, statusMessage: `image upstream ${upstream.status}` })
  }

  const contentType = upstream.headers.get('content-type') || 'image/jpeg'
  const bytes = new Uint8Array(await upstream.arrayBuffer())

  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Cache-Control', 'public, max-age=604800, immutable')
  setHeader(event, 'Access-Control-Allow-Origin', '*')

  return bytes
})
