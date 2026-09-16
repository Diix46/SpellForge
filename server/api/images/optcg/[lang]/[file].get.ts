/**
 * Local One Piece card images — served from disk only.
 *
 * Unlike Scryfall, Bandai grants no caching permission and no rate-limit
 * exemption, so the app never calls it at runtime: scripts/mirror-images-optcg.mjs
 * mirrors every image of both languages ahead of time. When an art is missing
 * in the requested language, the other language's art is served instead — the
 * same card, a different print — rather than an empty frame.
 *
 * SECURITY: both segments are matched against strict patterns before they
 * reach a path.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { OPTCG_ID } from '../../../../utils/cards/optcg-resolve'

const ROOT = resolve('.data/images/optcg')

// Bandai serves WebP on the French site and PNG on the English one; the mirror
// keeps whichever it got, so both are looked for.
const FORMATS = ['webp', 'png'] as const
const MIME = { webp: 'image/webp', png: 'image/png' } as const

export default defineEventHandler((event) => {
  const lang = getRouterParam(event, 'lang')
  const id = getRouterParam(event, 'file') ?? ''
  if ((lang !== 'fr' && lang !== 'en') || !OPTCG_ID.test(id))
    throw createError({ statusCode: 400, statusMessage: 'Bad image path' })

  for (const l of [lang, lang === 'fr' ? 'en' : 'fr']) {
    const dir = resolve(ROOT, l)
    for (const format of FORMATS) {
      const path = resolve(dir, `${id}.${format}`)
      // Defence in depth: the pattern above already rules traversal out.
      if (!path.startsWith(dir + sep))
        throw createError({ statusCode: 400, statusMessage: 'Bad image path' })
      if (existsSync(path) && statSync(path).size > 0) {
        // Cached forever once found: the URL carries the image version.
        setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
        setHeader(event, 'Content-Type', MIME[format])
        return sendStream(event, createReadStream(path))
      }
    }
  }
  throw createError({ statusCode: 404, statusMessage: 'Image not mirrored' })
})
