import { requireAppUser } from '../../utils/appUser'
import { gameOf } from '../../utils/collection/copies'
import { highlights } from '../../utils/collection/showcase'

// A game's collection, shown off: its worth today and a month ago, its finest
// cards, its showcase (?game=).
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  return highlights(user.id, gameOf(getQuery(event).game))
})
