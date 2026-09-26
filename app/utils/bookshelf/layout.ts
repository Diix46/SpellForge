/**
 * Where each binder stands: a shelf per family of sets (labelled), a
 * "new releases" shelf first with fresh binders to start, shelves grouped
 * into bookcases standing side by side. Pure: the 3D scene only places what
 * this decides.
 */
import type { SetProgress } from '#shared/collection'

export interface ShelfBinder {
  set: SetProgress
  /** A new binder, not started yet (the "new releases" shelf). */
  fresh: boolean
}

export interface ShelfRow {
  /** The family, or 'fresh' for the new releases. */
  kind: string
  label: string
  binders: ShelfBinder[]
}

export interface Bookcase {
  rows: ShelfRow[]
}

export interface LayoutOptions {
  /** Binders a shelf holds. */
  perShelf: number
  /** Shelves a bookcase has. */
  rowsPerCase: number
  /** A set's family, and the families in their shelf order. */
  kindOf: (set: SetProgress) => string
  kinds: readonly string[]
  labelOf: (kind: string) => string
  freshLabel: string
}

/**
 * The library: the fresh binders on the first shelf, then each family's
 * binders in the order given, a family spanning as many shelves as it needs;
 * then the shelves into bookcases.
 */
export function layoutLibrary(started: readonly SetProgress[], fresh: readonly SetProgress[], opts: LayoutOptions): Bookcase[] {
  const per = Math.max(1, opts.perShelf)
  const rows: ShelfRow[] = []
  if (fresh.length)
    rows.push({ kind: 'fresh', label: opts.freshLabel, binders: fresh.slice(0, per).map(set => ({ set, fresh: true })) })

  const byKind = new Map<string, SetProgress[]>()
  for (const s of started) {
    const k = opts.kindOf(s)
    byKind.set(k, [...(byKind.get(k) ?? []), s])
  }
  const order = [...opts.kinds, ...[...byKind.keys()].filter(k => !opts.kinds.includes(k))]
  for (const kind of order) {
    const sets = byKind.get(kind)
    if (!sets?.length)
      continue
    for (let i = 0; i < sets.length; i += per)
      rows.push({ kind, label: opts.labelOf(kind), binders: sets.slice(i, i + per).map(set => ({ set, fresh: false })) })
  }

  const cases: Bookcase[] = []
  const rpc = Math.max(1, opts.rowsPerCase)
  for (let i = 0; i < rows.length; i += rpc)
    cases.push({ rows: rows.slice(i, i + rpc) })
  return cases
}

/** Where a set's binder stands, or null. */
export function findBinder(cases: readonly Bookcase[], code: string): { caseIndex: number, rowIndex: number, slot: number } | null {
  for (let c = 0; c < cases.length; c++) {
    const rows = cases[c]!.rows
    for (let r = 0; r < rows.length; r++) {
      const slot = rows[r]!.binders.findIndex(b => b.set.code === code)
      if (slot >= 0)
        return { caseIndex: c, rowIndex: r, slot }
    }
  }
  return null
}

/**
 * A set's own colour, stable across visits: a hash of its code (FNV-1a)
 * spread by the golden angle, so that close codes ("OP-01", "OP-02") still
 * get far apart hues.
 */
export function hueOf(code: string): number {
  let h = 0x811C9DC5
  for (const ch of code) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return Math.round((h % 1000) * 137.508) % 360
}
