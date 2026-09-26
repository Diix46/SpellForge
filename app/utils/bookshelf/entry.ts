/**
 * What the library hands the binder page as it opens a binder: the set's
 * data (the page shows it at once), where the open 3D binder stood on screen
 * and a still of the scene — the page's binder grows out of it.
 */
import type { ChecklistCard, SetProgress } from '#shared/collection'

export interface ScreenBox { x: number, y: number, w: number, h: number }

export interface BinderEntry {
  code: string
  rect: ScreenBox | null
  stage: ScreenBox | null
  still: string | null
  data: { set: SetProgress, cards: ChecklistCard[] } | null
}
