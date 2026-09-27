// A read-only walk through the public site, safe against production
// (BASE=https://…): every world's library and a card of each, Discover, the
// 404s, the link previews, the installable app's files. No account, no write.
import { BASE, launch, recorder } from './support.mjs'

const PAGES = ['/', '/magic', '/one-piece', '/pokemon', '/yu-gi-oh', '/riftbound', '/discover', '/magic/card/Sol%20Ring', '/one-piece/card/OP01-001', '/pokemon/card/sv03.5-006', '/yu-gi-oh/card/LOB-EN001', '/riftbound/card/ogn-001-298']

export async function run() {
  const rec = recorder('smoke')
  const browser = await launch()
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' })).newPage()
  rec.watch(page, 'smoke', /Failed to load resource/)

  for (const path of PAGES) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    // The card images the page shows answer (none broken).
    const broken = await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.currentSrc).length)
    rec.check(`${path} s'affiche`, res?.status() === 200, `HTTP ${res?.status()}`)
    rec.check(`${path} sans image cassée`, broken === 0, `${broken} cassée(s)`)
  }

  for (const [path, status] of [['/page-qui-n-existe-pas', 404], ['/joueur/p_nexistepas', 404], ['/manifest.webmanifest', 200], ['/sw.js', 200], ['/offline.html', 200]]) {
    const res = await page.request.get(`${BASE}${path}`)
    rec.check(`${path} → ${status}`, res.status() === status, `HTTP ${res.status()}`)
  }

  // A published deck's link preview is an image.
  const discover = await (await page.request.get(`${BASE}/api/decks/discover`)).json()
  const shared = discover.decks.find(d => d.shareId)
  if (shared) {
    const og = await page.request.get(`${BASE}/api/og/deck/${shared.shareId}.png`)
    rec.check('aperçu de partage en PNG', og.status() === 200 && og.headers()['content-type'] === 'image/png')
  }

  // Every world searched at once.
  const search = await (await page.request.get(`${BASE}/api/landing/search?q=dragon&lang=fr`)).json()
  rec.check('recherche des cinq jeux', ['mtg', 'optcg', 'pokemon', 'yugioh', 'riftbound'].every(g => Array.isArray(search[g])))

  await browser.close()
  return rec.done()
}
