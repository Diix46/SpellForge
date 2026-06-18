import { migrate } from 'drizzle-orm/libsql/migrator'
import { useDb } from '../utils/db'

// Run pending migrations once on server startup so the DB schema is always
// current (dev + prod). Idempotent: drizzle tracks applied migrations.
export default defineNitroPlugin(async () => {
  try {
    await migrate(useDb(), { migrationsFolder: './server/db/migrations' })
  }
  catch (err) {
    console.error('[db] migration failed:', err)
  }
})
