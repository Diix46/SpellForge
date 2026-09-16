import process from 'node:process'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { useDb } from '../utils/db'

// Run pending migrations once on server startup so the DB schema is always
// current (dev + prod). Idempotent: drizzle tracks applied migrations.
//
// Nitro does not await plugins, so requests are held until the migrations are
// done — otherwise the first ones could read a table missing a column. A
// failed migration stops the server: running on a half-migrated schema turned
// every deck route into a silent 500 ("no such column").
export default defineNitroPlugin((nitroApp) => {
  const ready = migrate(useDb(), { migrationsFolder: './server/db/migrations' }).catch((err) => {
    console.error('[db] migration failed, stopping:', err)
    process.exit(1)
  })
  nitroApp.hooks.hook('request', () => ready)
})
