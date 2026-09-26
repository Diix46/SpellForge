import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { CONDITIONS, FINISHES } from '../../shared/collection'

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

// ─── Collection ──────────────────────────────────────────────────────────
// The copies a member owns: one row per printing, finish and condition, whose
// quantity grows as copies are added. `printingId` is the card database's id
// (a Scryfall printing for Magic, an art id for One Piece): the card databases
// are rebuilt, so it is not a foreign key.
export const collectionItems = sqliteTable('collection_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  game: text('game', { enum: ['mtg', 'optcg'] }).notNull(),
  printingId: text('printing_id').notNull(),
  finish: text('finish', { enum: FINISHES }).notNull().default('nonfoil'),
  condition: text('condition', { enum: CONDITIONS }).notNull().default('NM'),
  quantity: integer('quantity').notNull().default(1),
  // What was paid for one copy, in euros.
  purchasePrice: real('purchase_price'),
  // Binder, box, deck… free text.
  location: text('location'),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
}, t => [
  uniqueIndex('collection_copy_idx').on(t.userId, t.game, t.printingId, t.finish, t.condition),
  index('collection_user_game_idx').on(t.userId, t.game),
])

// One import of a file into a collection, kept so it can be undone: what it
// added, line by line (JSON of ImportedItem[]).
export const collectionImports = sqliteTable('collection_imports', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  game: text('game', { enum: ['mtg', 'optcg'] }).notNull(),
  format: text('format').notNull(),
  filename: text('filename'),
  lines: integer('lines').notNull(),
  copies: integer('copies').notNull(),
  items: text('items').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
}, t => [
  index('collection_imports_user_idx').on(t.userId, t.game, t.createdAt),
])

// A collection's worth, one reading a day (the nightly task, or the first
// visit of the day): the value chart.
export const collectionSnapshots = sqliteTable('collection_snapshots', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  game: text('game', { enum: ['mtg', 'optcg'] }).notNull(),
  // YYYY-MM-DD, UTC.
  day: text('day').notNull(),
  value: real('value').notNull(),
  paid: real('paid').notNull(),
  copies: integer('copies').notNull(),
  cards: integer('cards').notNull(),
}, t => [
  primaryKey({ columns: [t.userId, t.game, t.day] }),
])

// The price of each owned printing and finish, one a day: what moved.
export const collectionPrices = sqliteTable('collection_prices', {
  printingId: text('printing_id').notNull(),
  finish: text('finish', { enum: FINISHES }).notNull(),
  day: text('day').notNull(),
  price: real('price').notNull(),
}, t => [
  primaryKey({ columns: [t.printingId, t.finish, t.day] }),
  index('collection_prices_day_idx').on(t.day),
])

// Cards a member is after: a printing (or any printing of the card), how many,
// and the price under which to buy.
export const wishlistItems = sqliteTable('wishlist_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  game: text('game', { enum: ['mtg', 'optcg'] }).notNull(),
  // The printing picked; with anyPrinting, just the card's face.
  printingId: text('printing_id').notNull(),
  anyPrinting: integer('any_printing', { mode: 'boolean' }).notNull().default(true),
  finish: text('finish', { enum: FINISHES }).notNull().default('nonfoil'),
  quantity: integer('quantity').notNull().default(1),
  // Euros, for one copy.
  targetPrice: real('target_price'),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
}, t => [
  uniqueIndex('wishlist_card_idx').on(t.userId, t.game, t.printingId, t.finish),
])

export type UserRow = typeof users.$inferSelect
export type DeckRow = typeof decks.$inferSelect
export type CollectionItemRow = typeof collectionItems.$inferSelect
export type CollectionImportRow = typeof collectionImports.$inferSelect
export type WishlistItemRow = typeof wishlistItems.$inferSelect
