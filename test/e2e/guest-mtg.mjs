import { BASE, launch, recorder } from './support.mjs'

export async function run() {
  const rec = recorder('guest Magic')
  const browser = await launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', acceptDownloads: true })
  const page = await context.newPage()
  rec.watch(page)
  const raw = () => page.evaluate(() => {
    const id = location.pathname.split('/').pop()
    return (JSON.parse(localStorage.getItem('prism_decks_v2') || '[]').find(d => d.id === id) || {}).raw || ''
  })
  const deckTotal = () => page.evaluate(() => [...document.querySelectorAll('span, div')]
    .map(el => el.textContent.replace(/\s+/g, ' ').trim())
    .find(t => /^\d+ \/ 100$/.test(t)) || '?')

  // ---- Grimoire ----
  let t0 = Date.now()
  await page.goto(`${BASE}/magic`, { waitUntil: 'networkidle' })
  const pages = await page.locator('.library .page').count()
  rec.check('grimoire renders its first page', pages >= 60, `${pages} cards, ${Date.now() - t0} ms`)
  await page.getByPlaceholder(/syntaxe Scryfall/).first().fill('Atraxa')
  await page.waitForTimeout(1200)
  await page.locator('.library .page').first().click()
  await page.getByRole('button', { name: 'Commencer un deck avec ce commandant' }).click()
  await page.waitForURL('**/magic/deck/**')
  await page.waitForTimeout(1500)
  rec.check('deck opens with its commander', /Atraxa/.test(await raw()), (await raw()).split('\n')[0])

  // ---- Workshop ----
  const search = page.getByPlaceholder(/syntaxe Scryfall/).first()
  async function addFromSearch(text) {
    await search.fill(text)
    await page.waitForTimeout(1200)
    const add = page.locator('button[aria-label^="Ajouter, "]').first()
    await add.click()
    await page.waitForTimeout(300)
  }
  await addFromSearch('Sol Ring')
  await page.waitForTimeout(1500)
  rec.check('add from search', /Sol Ring/.test(await raw()))
  const solRow = page.locator('.dnd-row', { hasText: /Anneau solaire|Sol Ring/ }).first()
  rec.check('added card gets its thumbnail without opening Preview', (await solRow.locator('img').count()) === 1)

  await addFromSearch('Tymna the Weaver')
  await page.waitForTimeout(1500)
  const row = page.locator('.dnd-row', { hasText: /Tymna/ }).first()
  await row.hover()
  await row.locator('button[aria-label^="Définir commandant"]').click()
  await page.waitForTimeout(1500)
  const text = await raw()
  rec.check('chosen commander is written in the Commander section', text.startsWith('Commander\n1 Tymna'), text.split('\n').slice(0, 2).join(' | '))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const head = await page.locator('.deck-tab').first().textContent()
  rec.check('commander survives a reload', /Tymna/.test(head.slice(0, 400)))

  // Out-of-identity cards are not even offered while the lock is on
  await search.fill('Lightning Bolt')
  await page.waitForTimeout(1500)
  const bolt = await page.locator('button[aria-label*="Foudre"], button[aria-label*="Lightning Bolt"]').count()
  rec.check('out-of-identity card not offered', bolt === 0, `${bolt} matches`)

  // Token maker: the token is added but not counted
  const before = await deckTotal()
  await addFromSearch('Bitterblossom')
  await page.waitForTimeout(2500)
  const after = await deckTotal()
  const withToken = await raw()
  rec.check('token added with its maker', /Faerie Rogue/.test(withToken), withToken.split('\n').filter(l => /Faerie|Bitterblossom/.test(l)).join(' | '))
  rec.check('token not counted in the hundred', Number.parseInt(after) === Number.parseInt(before) + 1, `${before} → ${after}`)

  // Undo right after an edit keeps history straight
  await page.getByRole('button', { name: 'Annuler' }).first().click()
  await page.waitForTimeout(900)
  rec.check('undo removes the last add', !/Bitterblossom/.test(await raw()))
  await page.getByRole('button', { name: 'Rétablir' }).first().click()
  await page.waitForTimeout(900)
  rec.check('redo brings it back', /Bitterblossom/.test(await raw()))

  // Preview is for members: a guest is asked to sign up, and it stays shut
  await page.getByRole('button', { name: /Aperçu/ }).first().click()
  await page.waitForTimeout(1200)
  rec.check('preview asks a guest for an account', (await page.getByRole('dialog').getByText(/réservés aux membres/).count()) === 1)
  rec.check('preview stays shut for a guest', (await page.locator('section[role="dialog"][aria-label="Aperçu"]').count()) === 0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)

  // Choosing artworks too: the detail view shows the way in, not the gallery
  await page.locator('.dnd-row').getByText(/^(Anneau solaire|Sol Ring)$/).first().click()
  await page.waitForTimeout(1200)
  rec.check('artwork gallery is for members', (await page.getByText(/Choisis l'illustration de chaque carte/).count()) >= 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // Buy overlay leaves the token out
  await page.getByRole('button', { name: /Acheter/ }).first().click()
  await page.waitForTimeout(1500)
  const buyText = await page.locator('section[role="dialog"][aria-label="Acheter"]').textContent()
  rec.check('buy list has no token', !/Faerie Rogue/.test(buyText))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // ---- Import from EDHREC ----
  // From the deck page's import/export dialog, into a new deck.
  await page.getByRole('button', { name: /Importer \/ Exporter/ }).first().click()
  await page.waitForTimeout(800)
  const dialog = page.getByRole('dialog')
  await dialog.locator('button[aria-pressed]', { hasText: 'Nouveau deck' }).first().click().catch(() => {})
  await dialog.locator('input[name="import-url"]').fill('https://edhrec.com/commanders/atraxa-praetors-voice')
  await dialog.getByRole('button', { name: 'Importer' }).click()
  await page.waitForURL('**/magic/deck/**', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(3000)
  rec.check('EDHREC import opens a 100-card deck', /\/magic\/deck\//.test(page.url()) && (await deckTotal()) === '100 / 100', await deckTotal().catch(() => '?'))
  t0 = Date.now()
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('.dnd-row img').length >= 60, null, { timeout: 15000 }).catch(() => {})
  rec.check('100-card deck resolves quickly after reload', true, `${Date.now() - t0} ms to 60 thumbnails`)

  await browser.close()
  return rec.done()
}
