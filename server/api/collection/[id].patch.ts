import { copyFields, editCopy, requireOwnedCopy, withCards } from '../../utils/collection/copies'

// Edit a copy line (see editCopy): quantity 0 removes it, a finish or
// condition another line already has merges the two.
export default defineEventHandler(async (event) => {
  const id = decodeURIComponent(getRouterParam(event, 'id')!)
  const { row } = await requireOwnedCopy(event, id)
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  const result = await editCopy(row, copyFields(body, true))
  const [copy = null] = result.row ? await withCards([result.row]) : []
  return { copy, removed: result.removed }
})
