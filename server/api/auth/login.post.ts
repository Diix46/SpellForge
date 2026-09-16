import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../utils/db'
import { validateCredentials } from '../../utils/validateCredentials'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null)
  const { email, password } = validateCredentials(body)
  // Guessing is slowed per address and per account.
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  rateLimit(`auth:login:ip:${ip}`, 30, 10 * 60_000)
  rateLimit(`auth:login:email:${email}`, 10, 10 * 60_000)

  const db = useDb()
  const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get()

  // Same generic error whether the email is unknown or the password is wrong
  // (don't leak which emails are registered).
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    console.warn('[auth:login] échec', email)
    throw createError({ statusCode: 401, statusMessage: 'E-mail ou mot de passe incorrect' })
  }

  await setUserSession(event, { user: { id: user.id, email: user.email, displayName: user.displayName } }, { cookie: { sameSite: 'lax' } })
  return { user: { id: user.id, email: user.email, displayName: user.displayName } }
})
