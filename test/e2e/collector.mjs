// A collector's day, on a local build: sign-up, cards into the collection,
// its worth and finest cards, one put in the showcase and one up for trade,
// the public profile opened and seen by a visitor, a like in Discover, and
// what a deck is missing sent to the wishlist.
import { BASE, launch, recorder } from './support.mjs'

export async function run() {
  const rec = recorder('collector')
  const browser = await launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' })
  const page = await context.newPage()
  rec.watch(page, 'collector')
  await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' })

  const api = (path, method = 'GET', body) => page.evaluate(async ([p, m, b]) => {
    const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    return { status: r.status, json: await r.json().catch(() => null) }
  }, [path, method, body])

  const reg = await api('/api/auth/register', 'POST', { email: `qa-${Date.now()}@test.invalid`, password: 'e2e-only-password-123', displayName: 'Collectionneur' })
  rec.check('inscription', reg.status === 200, `HTTP ${reg.status}`)

  const { json: browse } = await api('/api/tcg/pokemon/browse?lang=fr&order=price')
  const cards = browse.cards.filter(c => c.image && c.price).slice(0, 5)
  let added = 0
  for (const c of cards)
    added += (await api('/api/collection', 'POST', { game: 'pokemon', printingId: `fr:${c.id}`, quantity: 2 })).status === 200 ? 1 : 0
  rec.check('cartes ajoutées', added === cards.length, `${added}/${cards.length}`)

  const { json: hl } = await api('/api/collection/highlights?game=pokemon')
  rec.check('valeur de la collection', hl.value > 0, `${hl.value} €`)
  rec.check('plus belles cartes triées', hl.finest.length > 1 && hl.finest[0].value >= hl.finest[1].value)

  const top = hl.finest[0]
  rec.check('mise en vitrine', (await api(`/api/collection/${encodeURIComponent(top.id)}`, 'PATCH', { featured: 1, forTrade: 1 })).status === 200)
  const { json: prof } = await api('/api/account/profile', 'PATCH', { profilePublic: true, collectionPublic: true })
  rec.check('profil public ouvert', !!prof?.profile?.id)

  // A visitor, without an account, sees the profile.
  const visitor = await (await browser.newContext({ locale: 'fr-FR' })).newPage()
  const res = await visitor.goto(`${BASE}/joueur/${prof.profile.id}`, { waitUntil: 'domcontentloaded' })
  await visitor.waitForTimeout(1500)
  rec.check('profil visible d\'un visiteur', res?.status() === 200)
  rec.check('vitrine et échanges sur le profil', await visitor.getByText('Vitrine').count() > 0 && await visitor.getByText('À échanger').count() > 0)

  // The showcase tab, rendered.
  await page.goto(`${BASE}/pokemon/collection/showcase`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  rec.check('onglet Vitrine', await page.locator('.worth .value').count() === 1 && await page.locator('.holo').count() > 0)

  // A like in Discover (someone else's deck).
  const { json: disc } = await api('/api/decks/discover')
  const other = disc.decks.find(d => !d.mine && d.shareId)
  if (other) {
    const liked = await api('/api/decks/like', 'POST', { shareId: other.shareId, liked: true })
    rec.check('j\'aime dans Découvrir', liked.status === 200 && liked.json.likes >= 1)
    await api('/api/decks/like', 'POST', { shareId: other.shareId, liked: false })
  }

  // What a deck is missing, to the wishlist.
  const wish = await api('/api/collection/wishlist', 'POST', { game: 'pokemon', printingId: `fr:${browse.cards[10].id}`, anyPrinting: true, quantity: 3 })
  rec.check('manquante vers la wishlist', wish.status === 200 && wish.json.item.quantity === 3)

  await browser.close()
  return rec.done()
}
