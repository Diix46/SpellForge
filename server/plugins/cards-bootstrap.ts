import { existsSync, statSync } from 'node:fs'
import process from 'node:process'
import { MTG_CARDS_DB, OPTCG_CARDS_DB } from '../utils/cards/db'

// A new install has no card database: build them at boot instead of waiting
// for the nightly refresh. An empty file counts as missing (the server creates
// one when a request opens a database that is not there yet).
// CARDS_REFRESH_ON_BOOT=false turns this off.
const hasCards = (path: string) => existsSync(path) && statSync(path).size > 0

export default defineNitroPlugin(() => {
  if (import.meta.dev || process.env.CARDS_REFRESH_ON_BOOT === 'false')
    return
  if (hasCards(MTG_CARDS_DB) && hasCards(OPTCG_CARDS_DB))
    return
  console.warn('[cards:refresh] card database missing, building it now')
  runTask('cards:refresh').catch(err => console.error('[cards:refresh] boot run failed', err))
})
