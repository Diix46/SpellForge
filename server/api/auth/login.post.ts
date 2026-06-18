import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../utils/db'
import { validateCredentials } from '../../utils/validateCredentials'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null)
  const { email, password } = validateCredentials(body)

  const db = useDb()
  const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get()

  // Same generic error whether the email is unknown or the password is wrong
  // (don't leak which emails are registered).
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password)))
    throw createError({ statusCode: 401, statusMessage: 'E-mail ou mot de passe incorrect' })

  await setUserSession(event, { user: { id: user.id, email: user.email, displayName: user.displayName } })
  return { user: { id: user.id, email: user.email, displayName: user.displayName } }
})
