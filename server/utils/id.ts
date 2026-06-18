import { randomBytes } from 'node:crypto'

// URL-safe random id (base36-ish). Good enough for primary keys / share tokens.
export function genId(prefix = ''): string {
  return prefix + randomBytes(12).toString('base64url')
}
