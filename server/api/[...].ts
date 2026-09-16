/**
 * Unknown API paths answer 404 JSON.
 *
 * Without this, the SPA renderer caught every unmatched URL — `/api/*`
 * included — and returned the HTML shell with a 200. A client calling a removed
 * or misspelled endpoint got a page instead of an error, with no way to tell.
 * Specific routes, including the ones modules register, still take precedence.
 */
export default defineEventHandler((event) => {
  throw createError({ statusCode: 404, statusMessage: `Unknown API route: ${event.path.split('?')[0]}` })
})
