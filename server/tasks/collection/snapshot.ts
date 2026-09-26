import { snapshotAll } from '../../utils/collection/history'

/**
 * Takes the day's reading of every collection (value, copies) and the prices
 * behind it, after the night's card refresh brought the new prices.
 * Scheduled in nuxt.config.ts; by hand: `npx nuxi task run collection:snapshot`.
 */
export default defineTask({
  meta: {
    name: 'collection:snapshot',
    description: 'Record the day\'s value of every collection and the prices of the owned printings',
  },
  async run() {
    const n = await snapshotAll()
    console.warn(`[collection:snapshot] ${n} collection(s) recorded`)
    return { result: n }
  },
})
