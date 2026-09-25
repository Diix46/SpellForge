// Lightweight, dependency-free validation for auth inputs.
// Linear, no-backtracking: local@domain.tld with no spaces/@ and a dotted domain.
const EMAIL_RE = /^[^\s@]+@[^\s.@]+(?:\.[^\s.@]+)+$/

export interface Credentials { email: string, password: string }

function bad(message: string): never {
  throw createError({ statusCode: 400, statusMessage: 'Bad Request', message })
}

/** A normalized e-mail address (trimmed, lower case), or a 400. */
export function validateEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (email.length > 254 || !EMAIL_RE.test(email))
    bad('Adresse e-mail invalide')
  return email
}

/** A password fit to be hashed, or a 400. */
export function validatePassword(value: unknown): string {
  const password = typeof value === 'string' ? value : ''
  if (password.length < 8)
    bad('Le mot de passe doit faire au moins 8 caractères')
  // Hashing is deliberately slow: an endless password must not make it slower.
  if (password.length > 256)
    bad('Le mot de passe doit faire au plus 256 caractères')
  return password
}

export function validateCredentials(body: unknown): Credentials {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  return { email: validateEmail(b.email), password: validatePassword(b.password) }
}
