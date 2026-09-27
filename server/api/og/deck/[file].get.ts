/**
 * A shared deck's link preview: /api/og/deck/<shareId>.png (?lang=fr|en).
 * Made once per version of the deck and kept on disk; a deck edited gets a
 * new one (its update time is in the file's name).
 *
 * SECURITY: the share id is checked against its shape before any path or query.
 */
import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../../utils/db'
import { keyCardImages, renderDeckCard } from '../../../utils/og/deckCard'

const ROOT = resolve('.data/og')

export default defineEventHandler(async (event) => {
  const m = /^([\w-]{6,64})\.png$/.exec(getRouterParam(event, 'file') ?? '')
  if (!m)
    throw createError({ statusCode: 400, statusMessage: 'Bad preview' })
  const shareId = m[1]!
  const lang = getQuery(event).lang === 'en' ? 'en' : 'fr'
  const deck = await useDb().select({ name: schema.decks.name, game: schema.decks.game, raw: schema.decks.raw, updatedAt: schema.decks.updatedAt }).from(schema.decks).where(eq(schema.decks.shareId, shareId)).get()
  if (!deck)
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })

  const version = deck.updatedAt instanceof Date ? deck.updatedAt.getTime() : Number(deck.updatedAt)
  const file = resolve(ROOT, `${shareId}-${version}-${lang}.png`)
  setHeader(event, 'Content-Type', 'image/png')
  setHeader(event, 'Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  if (existsSync(file))
    return readFileSync(file)

  const { images, count } = await keyCardImages(deck.game, deck.raw, lang)
  const png = await renderDeckCard({
    game: deck.game,
    name: deck.name,
    count,
    images,
    countLabel: lang === 'fr' ? `${count} cartes` : `${count} cards`,
    fetchImage: async path => Buffer.from(await $fetch<ArrayBuffer>(path, { responseType: 'arrayBuffer' })),
  })
  if (!png)
    throw createError({ statusCode: 503, statusMessage: 'Preview unavailable' })

  // Older versions of this deck's preview go.
  mkdirSync(ROOT, { recursive: true })
  for (const old of readdirSync(ROOT).filter(f => f.startsWith(`${shareId}-`)))
    unlinkSync(resolve(ROOT, old))
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, png)
  renameSync(tmp, file)
  return png
})
