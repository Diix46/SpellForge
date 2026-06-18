// Lightweight, dependency-free validation for auth inputs.
// Linear, no-backtracking: local@domain.tld with no spaces/@ and a dotted domain.
const EMAIL_RE = /^[^\s@]+@[^\s.@]+(?:\.[^\s.@]+)+$/

export interface Credentials { email: string, password: string }

export function validateCredentials(body: unknown): Credentials {
  const b = (body ?? {}) as Record<string, unknown>
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
  const password = typeof b.password === 'string' ? b.password : ''

  if (!EMAIL_RE.test(email))
    throw createError({ statusCode: 400, statusMessage: 'Adresse e-mail invalide' })
  if (password.length < 8)
    throw createError({ statusCode: 400, statusMessage: 'Le mot de passe doit faire au moins 8 caractères' })

  return { email, password }
}
