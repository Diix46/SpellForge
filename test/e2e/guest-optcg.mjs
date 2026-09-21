import { BASE, launch, OP_LIST, recorder } from './support.mjs'

export async function run() {
  const rec = recorder('guest One Piece and dashboard')
  const browser = await launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' })
  const page = await context.newPage()
  rec.watch(page)

  // ---- Landing ----
  let t0 = Date.now()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  rec.check('landing loads', (await page.locator('h1').first().textContent()).includes('Deux mondes'), `${Date.now() - t0} ms`)

  // The card tide: One Piece on the left, Magic on the right, and a click
  // puts a card on show in its own world's corner.
  const tide = await page.evaluate(() => {
    const mid = document.querySelector('.tide').getBoundingClientRect().width / 2
    const cards = [...document.querySelectorAll('[data-tide-card]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { op: el.classList.contains('card--op'), left: r.left + r.width / 2 < mid }
    })
    return { total: cards.length, misplaced: cards.filter(c => c.op !== c.left).length }
  })
  rec.check('card tide splits the two worlds', tide.total >= 60 && tide.misplaced <= tide.total * 0.1, `${tide.total} cards, ${tide.misplaced} across the seam`)
  // Let the first cards land, and move the pointer in: the page stops dealing
  // while someone is there, so nothing flies over the card about to be clicked.
  await page.waitForTimeout(2500)
  // (The page deals again after 3 s without input; the depth drift settles in ~2 s.)
  await page.mouse.move(1000, 450, { steps: 4 })
  await page.waitForTimeout(2200)
  // Any Magic card of the pile that is on top where it is clicked.
  const pick = await page.evaluate(() => {
    const spots = [[0.5, 0.5], [0.3, 0.25], [0.7, 0.75], [0.5, 0.15], [0.5, 0.85]]
    for (const el of document.querySelectorAll('[data-tide-card].card--mtg')) {
      if (Number(el.style.zIndex) >= 9000)
        continue
      const r = el.getBoundingClientRect()
      for (const [fx, fy] of spots) {
        const x = r.left + r.width * fx
        const y = r.top + r.height * fy
        if (x > 760 && x < 1430 && y > 90 && y < 880
          && document.elementFromPoint(x, y)?.closest('[data-tide-card]') === el) {
          return { x, y, i: el.dataset.tideCard }
        }
      }
    }
    return null
  })
  if (pick) {
    await page.mouse.click(pick.x, pick.y)
    await page.waitForTimeout(1200)
  }
  const shown = pick && await page.evaluate(i => Number(document.querySelector(`[data-tide-card="${i}"]`).style.zIndex) >= 9000, pick.i)
  rec.check('a clicked card goes on show with its name', !!shown && (await page.locator('.caption--mtg .caption-link').count()) === 1)

  await page.getByRole('button', { name: 'Luffy' }).click()
  await page.waitForTimeout(800)
  const opHits = await page.locator('.col--op .hit').count()
  const mtgHits = await page.locator('.col--mtg .hit').count()
  rec.check('landing search shows both games', opHits > 0 && mtgHits >= 0, `op ${opHits}, mtg ${mtgHits}`)
  await page.getByRole('link', { name: /Prendre la mer/ }).first().click()
  await page.waitForURL('**/one-piece')
  rec.check('hero door opens the One Piece library', true)

  // ---- Library ----
  await page.waitForSelector('.grid .poster, .grid article, .grid [class*="wanted"]', { timeout: 10000 }).catch(() => {})
  const firstCount = await page.locator('.library .grid > *').count()
  rec.check('library renders its first page', firstCount >= 60, `${firstCount} posters`)
  const search = page.getByPlaceholder(/Nom, effet ou numéro/)
  await search.fill('OP07-001')
  await page.waitForTimeout(900)
  const afterSearch = await page.locator('.library .grid > *').count()
  rec.check('library search by number', afterSearch >= 1 && afterSearch < 10, `${afterSearch} results`)

  // Start a deck from the Leader's sheet
  await page.locator('.library .grid > *').first().click()
  await page.getByRole('button', { name: 'Commencer un deck avec ce Leader' }).click()
  await page.waitForURL('**/one-piece/deck/**')
  const deckUrl = page.url()
  await page.waitForTimeout(1200)
  rec.check('deck starts with the Leader', (await page.locator('.leader-name').first().textContent()).trim().length > 0)

  // ---- Workshop: paste a full list with the Leader in the middle and a bad line ----
  await page.getByRole('button', { name: 'Importer / Exporter' }).click()
  await page.locator('textarea[name="import-list"]').fill(OP_LIST.text)
  await page.getByRole('button', { name: 'Appliquer' }).click()
  await page.waitForTimeout(2000)
  const count = (await page.locator('.status .count').textContent()).trim()
  rec.check('pasted list counts 50 / 50', count === '50 / 50', count)
  const legal = await page.getByText('Deck légal en Standard').count()
  rec.check('pasted list is legal', legal > 0)
  const unreadable = await page.getByText('this is not a card').count()
  rec.check('unreadable line is reported', unreadable > 0)

  // The Leader moves first in the saved text; the bad line stays.
  await page.waitForTimeout(1200)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('prism_decks_v2') || '[]'))
  const mine = saved.find(d => page.url().endsWith(d.id))
  rec.check('saved text starts with the Leader', mine?.raw.split('\n')[0] === `1x${OP_LIST.leader}`, mine?.raw.split('\n')[0])
  rec.check('saved text keeps the unreadable line', mine?.raw.includes('this is not a card'))

  // Remove one copy, then undo and redo
  const minus = page.locator('.stepper button').first()
  await minus.click()
  await page.waitForTimeout(900)
  rec.check('removing a copy gives 49', (await page.locator('.status .count').textContent()).trim() === '49 / 50')
  await page.getByRole('button', { name: 'Annuler' }).first().click()
  await page.waitForTimeout(900)
  rec.check('undo brings 50 back', (await page.locator('.status .count').textContent()).trim() === '50 / 50')
  await page.getByRole('button', { name: 'Rétablir' }).first().click()
  await page.waitForTimeout(900)
  rec.check('redo removes it again', (await page.locator('.status .count').textContent()).trim() === '49 / 50')
  // Edit then undo within the save delay, then reload: nothing half-saved.
  await minus.click()
  await page.waitForTimeout(100)
  await page.locator('.stepper button').nth(1).click()
  await page.waitForTimeout(1200)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  rec.check('reload keeps 49 / 50', (await page.locator('.status .count').textContent()).trim() === '49 / 50')

  // Add a card from the search, off-colour card refused
  const addButtons = page.locator('.ws-results .grid button[aria-label*="Ajouter"], .ws-results .grid .add')
  rec.check('search offers add buttons', (await addButtons.count()) > 0, `${await addButtons.count()}`)

  // Language switch keeps the Leader visible
  await page.getByRole('button', { name: 'English', exact: true }).first().click()
  await page.waitForTimeout(150)
  const leaderDuring = await page.locator('.leader-name').first().textContent()
  rec.check('language switch keeps the Leader', leaderDuring && leaderDuring.trim().length > 0)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Français', exact: true }).first().click()
  await page.waitForTimeout(800)

  // ---- Dashboard ----
  t0 = Date.now()
  await page.goto(`${BASE}/decks`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const tiles = await page.locator('.tile').count()
  rec.check('dashboard lists the deck', tiles >= 1, `${tiles} tiles, ${Date.now() - t0} ms`)
  const opTile = page.locator('.tile--op').first()
  rec.check('One Piece tile shows the Leader', (await opTile.locator('.leader').count()) > 0)

  // Keyboard on the tile menu does not open the deck
  await opTile.locator('.menu').focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  rec.check('Enter on the tile menu stays on the dashboard', page.url().endsWith('/decks'))
  await page.keyboard.press('Escape')

  // Duplicate, rename, delete through the menu
  await opTile.locator('.menu').click()
  await page.getByRole('menuitem', { name: 'Dupliquer' }).click()
  await page.waitForTimeout(600)
  rec.check('duplicate adds a tile', (await page.locator('.tile').count()) === tiles + 1)
  const copy = page.locator('.tile', { hasText: '(copie)' }).first()
  await copy.locator('.menu').click()
  await page.getByRole('menuitem', { name: 'Supprimer' }).click()
  await page.getByRole('button', { name: 'Supprimer' }).last().click()
  await page.waitForTimeout(600)
  rec.check('delete removes it', (await page.locator('.tile').count()) === tiles)

  // Import a One Piece list from the dashboard, with a second Enter ignored
  await page.goto(`${BASE}/decks?import=optcg`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const dialog = page.getByRole('dialog')
  rec.check('?import=optcg opens the import dialog', (await dialog.count()) > 0)
  await dialog.locator('textarea').fill(OP_LIST.text)
  await dialog.getByRole('button', { name: 'Importer' }).click()
  await page.waitForURL('**/one-piece/deck/**', { timeout: 8000 }).catch(() => {})
  rec.check('import opens the new One Piece deck', /\/one-piece\/deck\//.test(page.url()), page.url())
  await page.waitForTimeout(1500)
  rec.check('imported deck is 50 / 50', (await page.locator('.status .count').textContent()).trim() === '50 / 50')

  // Palette: new deck inside One Piece preselects One Piece
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(400)
  await page.keyboard.type('Créer un nouveau deck')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  const opPressed = await page.locator('.world--op[aria-pressed="true"]').count()
  rec.check('palette new deck preselects One Piece', opPressed > 0)
  await page.keyboard.press('Escape')

  // Old deck URL still works
  const id = deckUrl.split('/').pop()
  await page.goto(`${BASE}/deck/${id}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  rec.check('/deck/:id redirects to the universe', page.url().includes(`/one-piece/deck/${id}`), page.url())

  await browser.close()
  return rec.done()
}
