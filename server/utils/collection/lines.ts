import type { GameId } from '../../../shared/game'
import type { OwnedLine } from './sets'
import { and, eq } from 'drizzle-orm'
import { schema, useDb } from '../db'

/** A member's copy lines for one game, reduced to printing and quantity. */
export function ownedLines(userId: string, game: GameId): Promise<OwnedLine[]> {
  const t = schema.collectionItems
  return useDb().select({ printingId: t.printingId, quantity: t.quantity }).from(t).where(and(eq(t.userId, userId), eq(t.game, game))).all()
}
