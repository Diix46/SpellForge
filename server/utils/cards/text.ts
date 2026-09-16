/**
 * Text helpers shared by the search engine, the query-syntax compiler and the
 * resolver. Kept apart so the compiler needs nothing from the engine at
 * runtime — the engine is the one that calls it.
 */

/** Strip accents and lowercase — matches the `name_folded` column built at ingest. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/**
 * FTS5 needs bare terms; it tokenizes punctuation away. Quote the phrase and
 * drop the characters that would be read as operators.
 */
export function ftsPhrase(s: string): string {
  const cleaned = fold(s).replace(/["'()*:^-]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned ? `"${cleaned}"` : ''
}

/** A LIKE pattern matching `s` anywhere, for use with `ESCAPE '\'`. */
export function likeContains(s: string): string {
  return `%${s.replace(/[\\%_]/g, c => `\\${c}`)}%`
}
