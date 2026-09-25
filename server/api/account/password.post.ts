import { eq } from 'drizzle-orm'
import { checkCurrentPassword, requireAccount } from '../../utils/account'
import { schema, useDb } from '../../utils/db'
import { validatePassword } from '../../utils/validateCredentials'

// Change the password: the current one, then the new one.
export default defineEventHandler(async (event) => {
  const user = await requireAccount(event)
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  await checkCurrentPassword(user, body.currentPassword)
  const password = validatePassword(body.newPassword)
  await useDb().update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, user.id))
  return { ok: true }
})
