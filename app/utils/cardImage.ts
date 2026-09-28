/**
 * The light copy of a Magic card image served by the app (320 px WebP,
 * server/utils/images/thumbnail), for grids that draw cards small: a large
 * scan (672 px, ~75 KB) becomes ~25 KB. Other addresses are returned as is.
 */
export function thumbOf(url: string | null | undefined): string | null {
  if (!url)
    return null
  if (!url.startsWith('/api/images/mtg/'))
    return url
  const [path, query = ''] = url.split('?')
  const params = new URLSearchParams(query)
  params.set('size', 'thumb')
  return `${path!.replace(/\/(?:large|png)\//, '/normal/')}?${params}`
}
