import { logError } from '../utils/errorLog'

// Server errors into the journal (utils/errorLog): the unexpected ones, not
// the 4xx a request earns (a card not found, a form refused).
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('error', (error, { event }) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500
    if (status < 500)
      return
    logError({ source: 'server', message: error.message, where: event?.path, status, stack: error.stack })
  })
})
