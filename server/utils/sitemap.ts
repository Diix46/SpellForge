/**
 * Sitemap and robots.txt text. Pure, so the tests read exactly what search
 * engines get.
 */

/** A sitemap file holds at most this many addresses. */
export const SITEMAP_MAX_URLS = 50_000

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&apos;' }
export const xmlEscape = (s: string) => s.replace(/[&<>"']/g, c => XML_ESCAPES[c]!)

export interface SitemapUrl {
  /** Site-relative path, already percent-encoded. */
  path: string
  lastmod?: Date
}

/** The public address: the configured one, else the request's. */
export function siteOrigin(configured: string | undefined, requestOrigin: string): string {
  return (configured || requestOrigin).replace(/\/+$/, '')
}

export function urlset(origin: string, urls: readonly SitemapUrl[]): string {
  if (urls.length > SITEMAP_MAX_URLS)
    throw new Error(`A sitemap holds at most ${SITEMAP_MAX_URLS} URLs, got ${urls.length}`)
  const body = urls.map(u => `<url><loc>${xmlEscape(origin + u.path)}</loc>${
    u.lastmod ? `<lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''
  }</url>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>\n`
}

export function sitemapIndex(origin: string, paths: readonly string[]): string {
  const body = paths.map(p => `<sitemap><loc>${xmlEscape(origin + p)}</loc></sitemap>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>\n`
}

/**
 * What crawlers may read: the public pages. The workshop (dashboard, decks)
 * lives in each visitor's browser and the API is for the app.
 */
export function robotsTxt(origin: string): string {
  return [
    'User-agent: *',
    'Disallow: /api/',
    'Disallow: /deck/',
    'Disallow: /magic/deck/',
    'Disallow: /one-piece/deck/',
    'Allow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}
