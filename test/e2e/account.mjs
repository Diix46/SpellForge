// Account flows: sign-up from the app, guest decks moving to the account,
// sharing, a visitor copying the deck, offline edits replayed, sign-out.
import { BASE, launch, OP_LIST, recorder } from './support.mjs'

// Expected while the browser is offline on purpose.
const OFFLINE_NOISE = /Failed to load resource|ERR_INTERNET_DISCONNECTED|\[decks\] sync failed/

export async function run() {
  const rec = recorder('account')
  const email = `qa-${Date.now()}@test.invalid`
  const password = 'e2e-only-password-123'
  const browser = await launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' })
  const page = await context.newPage()
  rec.watch(page, 'owner', OFFLINE_NOISE)

  // Two guest decks, one per game
  await page.goto(`${BASE}/decks`, { waitUntil: 'networkidle' })
  await page.evaluate((text) => {
    const now = Date.now()
    localStorage.setItem('prism_decks_v2', JSON.stringify([
      { id: `d_e2eop${now}`, name: 'Guest crew', game: 'optcg', raw: text, createdAt: now - 86400000, updatedAt: now - 3600000 },
      { id: `d_e2emtg${now}`, name: 'Guest grimoire', game: 'mtg', raw: '1 Sol Ring', createdAt: now - 172800000, updatedAt: now - 7200000 },
    ]))
  }, OP_LIST.text)
  await page.reload({ waitUntil: 'networkidle' })
  rec.check('guest dashboard shows both decks', (await page.locator('.tile').count()) === 2)

  // Sign up from the app
  await page.getByRole('button', { name: 'Se connecter' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Créer un compte' }).click().catch(() => dialog.getByText('Créer un compte').first().click())
  await dialog.locator('input[name="email"]').fill(email)
  await dialog.locator('input[name="password"]').fill(password)
  await dialog.locator('button[type="submit"]').click()
  await page.waitForTimeout(3500)
  const tilesAfter = await page.locator('.tile').count()
  rec.check('guest decks move to the account', tilesAfter === 2, `${tilesAfter} tiles`)
  const guestLeft = await page.evaluate(() => localStorage.getItem('prism_decks_v2'))
  rec.check('browser copies are cleared once saved', guestLeft === null, String(guestLeft).slice(0, 40))
  const server = await page.evaluate(() => fetch('/api/decks').then(r => r.json()))
  rec.check('server has both decks with their game', server.decks.length === 2 && server.decks.some(d => d.game === 'optcg'), server.decks.map(d => `${d.name}:${d.game}`).join(', '))
  const oldest = server.decks.find(d => d.name === 'Guest grimoire')
  rec.check('migration keeps the deck dates', new Date(oldest.updatedAt).getTime() < Date.now() - 3600000, oldest.updatedAt)

  // Edit the One Piece deck while signed in, then reload: the server has it
  await page.locator('.tile', { hasText: 'Guest crew' }).first().click()
  await page.waitForURL('**/one-piece/deck/**')
  await page.waitForTimeout(2000)
  await page.locator('.stepper button').first().click()
  await page.waitForTimeout(1800)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  rec.check('signed-in edit is saved to the account', (await page.locator('.status .count').textContent()).trim() === '49 / 50')

  // Offline edit is kept and sent later
  await context.setOffline(true)
  await page.locator('.stepper button').nth(1).click()
  await page.waitForTimeout(8000)
  const pending = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('prism_outbox_v1')).map(k => localStorage.getItem(k)))
  rec.check('offline edit waits in the outbox', pending.length === 1 && pending[0].includes('upsert'))
  await context.setOffline(false)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  rec.check('offline edit reaches the account after reload', (await page.locator('.status .count').textContent()).trim() === '50 / 50')
  const outboxAfter = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('prism_outbox_v1')).length)
  rec.check('outbox empties once sent', outboxAfter === 0, `${outboxAfter} left`)

  // Share and publish
  await page.getByRole('button', { name: 'Partager' }).first().click()
  const share = page.getByRole('dialog')
  await share.getByRole('switch', { name: 'Lien de partage actif' }).click()
  await page.waitForTimeout(1500)
  const link = await share.locator('input[readonly]').inputValue()
  rec.check('share link is in the deck universe', /\/one-piece\/shared\/s_/.test(link), link)
  await share.getByRole('switch', { name: 'Lister dans Découvrir' }).click()
  await page.waitForTimeout(1500)
  await page.keyboard.press('Escape')

  // A visitor opens it and copies it
  const visitorContext = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'fr-FR' })
  const visitor = await visitorContext.newPage()
  rec.watch(visitor, 'visitor')
  await visitor.goto(link, { waitUntil: 'networkidle' })
  await visitor.waitForTimeout(2000)
  rec.check('visitor sees the shared deck', (await visitor.locator('h1').first().textContent()).includes('Guest crew'))
  rec.check('shared deck is indexable once listed', (await visitor.locator('meta[name="robots"]').getAttribute('content')) === 'index, follow')
  await visitor.goto(`${BASE}/discover`, { waitUntil: 'networkidle' })
  rec.check('Discover lists it', (await visitor.getByText('Guest crew').count()) > 0)
  await visitor.goto(link, { waitUntil: 'networkidle' })
  await visitor.getByRole('button', { name: 'Copier dans mes decks' }).click()
  await visitor.waitForURL('**/one-piece/deck/**')
  await visitor.waitForTimeout(1500)
  rec.check('visitor copy is a legal guest deck', (await visitor.locator('.status .count').textContent()).trim() === '50 / 50')

  // Home page shows the way back to the decks
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  rec.check('home shows "Mes decks" to a member', (await page.getByRole('link', { name: 'Mes decks' }).count()) > 0)

  // Sign out: back to the (now empty) guest list
  await page.goto(`${BASE}/decks`, { waitUntil: 'networkidle' })
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  rec.check('signed out, the account decks are gone from this browser', (await page.locator('.tile').count()) === 0)

  await browser.close()
  return rec.done()
}
