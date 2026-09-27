import { requireAppUser } from '../../utils/appUser'
import { readErrors } from '../../utils/errorLog'

// The error journal, for the admins named in NUXT_ADMIN_EMAILS.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const admins = String(useRuntimeConfig(event).adminEmails ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (!admins.includes(user.email.toLowerCase()))
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  return { errors: readErrors(Number(getQuery(event).limit ?? 300) || 300) }
})
