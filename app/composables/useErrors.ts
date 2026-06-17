// Small helper to extract a human-readable message from an unknown error
// (Error, Nuxt/h3 error with statusMessage, or anything else).
export function errMessage(err: unknown): string {
  if (typeof err === 'string')
    return err
  if (err && typeof err === 'object') {
    const e = err as { statusMessage?: unknown, message?: unknown }
    if (typeof e.statusMessage === 'string' && e.statusMessage)
      return e.statusMessage
    if (typeof e.message === 'string' && e.message)
      return e.message
  }
  return ''
}
