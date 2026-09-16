import { reopenCardDbs } from '../../utils/cards/db'
import { refreshCards } from '../../utils/cards/refresh'

/**
 * Rebuilds the local card databases when their sources moved (each script
 * does nothing when its base is current), mirrors the new One Piece images,
 * then points the app at the new files. Scheduled in nuxt.config.ts; run by
 * hand with `npx nuxi task run cards:refresh` in development.
 */
export default defineTask({
  meta: {
    name: 'cards:refresh',
    description: 'Refresh the One Piece and Magic card databases and the One Piece images',
  },
  async run() {
    const outcomes = await refreshCards({
      onStep(o) {
        console.warn(`[cards:refresh] ${o.name}: ${o.ok ? 'ok' : `failed (code ${o.code})`} after ${o.attempts} attempt(s), ${Math.round(o.ms / 1000)} s`)
        // A rebuilt database serves at once, not after the whole refresh.
        if (o.ok)
          reopenCardDbs()
      },
    })
    return { result: outcomes.every(o => o.ok) ? 'ok' : 'partial', outcomes }
  },
})
