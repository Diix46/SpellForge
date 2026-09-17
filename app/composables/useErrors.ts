// Small helper to extract a human-readable message from an unknown error
// (a failed request, whose body carries the server's message; a Nuxt/h3 error;
// an Error; or anything else).
export function errMessage(err: unknown): string {
  if (typeof err === 'string')
    return err
  if (err && typeof err === 'object') {
    const e = err as { data?: { message?: unknown, statusMessage?: unknown } | null, statusMessage?: unknown, message?: unknown }
    const data = e.data && typeof e.data === 'object' ? e.data : null
    for (const text of [data?.message, data?.statusMessage, e.statusMessage, e.message]) {
      if (typeof text === 'string' && text)
        return text
    }
  }
  return ''
}
