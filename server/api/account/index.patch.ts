import { and, eq, ne } from 'drizzle-orm'
import { checkCurrentPassword, requireAccount } from '../../utils/account'
import { schema, useDb } from '../../utils/db'
import { validateEmail } from '../../utils/validateCredentials'

// Change the display name and/or the e-mail. A new e-mail needs the current
// password: it is what signs the account in.
export default defineEventHandler(async (event) => {
  const user = await requireAccount(event)
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  const patch: { displayName?: string, email?: string } = {}

  if (body.displayName !== undefined) {
    const name = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 60) : ''
    if (!name)
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Le pseudo ne peut pas être vide' })
    patch.displayName = name
  }
  if (body.email !== undefined) {
    const email = validateEmail(body.email)
    if (email !== user.email) {
      await checkCurrentPassword(user, body.currentPassword)
      const taken = await useDb().select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.email, email), ne(schema.users.id, user.id))).get()
      if (taken)
        throw createError({ statusCode: 409, statusMessage: 'Conflict', message: 'Un compte existe déjà avec cet e-mail' })
      patch.email = email
    }
  }

  if (Object.keys(patch).length)
    await useDb().update(schema.users).set(patch).where(eq(schema.users.id, user.id))
  const next = { id: user.id, email: patch.email ?? user.email, displayName: patch.displayName ?? user.displayName }
  await setUserSession(event, { user: next }, { cookie: { sameSite: 'lax' } })
  return { user: next }
})
