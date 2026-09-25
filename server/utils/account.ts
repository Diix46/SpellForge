import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAppUser } from './appUser'
import { schema, useDb } from './db'

/** The signed-in user's row, or a 401 (no session, or the account is gone). */
export async function requireAccount(event: H3Event) {
  const session = await requireAppUser(event)
  const row = await useDb().select().from(schema.users).where(eq(schema.users.id, session.id)).get()
  if (!row)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Compte introuvable' })
  return row
}

/**
 * The account's current password must be given for what can lock it out
 * (e-mail, password, deletion). Guesses are slowed per account.
 */
export async function checkCurrentPassword(user: { id: string, passwordHash: string | null }, value: unknown) {
  rateLimit(`account:password:${user.id}`, 10, 10 * 60_000)
  const password = typeof value === 'string' ? value : ''
  if (!user.passwordHash || !password || !(await verifyPassword(user.passwordHash, password)))
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Mot de passe actuel incorrect' })
}
