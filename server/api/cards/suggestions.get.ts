// "Cards often played with this commander" via EDHREC's recommendation JSON.
// Thin route over the shared edhrecSuggestions() util (server/utils/edhrec.ts),
// which is also used by the Eve coach's edhrec_suggestions tool.

export default defineEventHandler(async (event): Promise<{ names: string[] }> => {
  const query = getQuery(event)
  const commander = typeof query.commander === 'string' ? query.commander.trim() : ''
  if (!commander)
    return { names: [] }
  return { names: await edhrecSuggestions(commander) }
})
