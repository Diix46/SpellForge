import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../utils/db'
import { genId } from '../../utils/id'
import { validateCredentials } from '../../utils/validateCredentials'

// Create an account, then start a session. Display name derives from the email
// local-part unless provided.
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null)
  const { email, password } = validateCredentials(body)
  const displayName = typeof (body as any)?.displayName === 'string' && (body as any).displayName.trim()
    ? (body as any).displayName.trim()
    : (email.split('@')[0] ?? 'Joueur')

  const db = useDb()
  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).get()
  if (existing)
    throw createError({ statusCode: 409, statusMessage: 'Un compte existe déjà avec cet e-mail' })

  const id = genId('u_')
  await db.insert(schema.users).values({
    id,
    email,
    passwordHash: await hashPassword(password),
    displayName,
  })

  await setUserSession(event, { user: { id, email, displayName } })
  return { user: { id, email, displayName } }
})
