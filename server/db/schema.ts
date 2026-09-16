import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ─── Users ────────────────────────────────────────────────────────────────
// Email/password auth (scrypt hash via nuxt-auth-utils). `id` is a random
// string (cuid-ish) generated in the auth handler.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  // null for OAuth-only accounts (future); set for email/password.
  passwordHash: text('password_hash'),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
})

// ─── Decks ───────────────────────────────────────────────────────────────
// One row per saved deck. `raw` is the canonical decklist text (the source of
// truth, same format as the localStorage decks). `source` mirrors the local model.
export const decks = sqliteTable('decks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // Which game the decklist belongs to. Set at creation and never changed:
  // the two games' decklist formats are incompatible. Existing rows predate
  // One Piece, hence the default.
  game: text('game', { enum: ['mtg', 'optcg'] }).notNull().default('mtg'),
  raw: text('raw').notNull().default(''),
  source: text('source'),
  // Public read-only share token (null = private). Indexed for lookup.
  shareId: text('share_id').unique(),
  // Listed in the public "Discover" gallery. Requires shareId to be set —
  // enforced in app logic (publish.post.ts), not a DB constraint.
  public: integer('public', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
}, t => [
  index('decks_user_idx').on(t.userId),
  // Discover lists public decks, optionally for one game.
  index('decks_public_game_idx').on(t.public, t.game),
])

export type UserRow = typeof users.$inferSelect
export type DeckRow = typeof decks.$inferSelect
