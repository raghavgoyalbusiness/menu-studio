/**
 * Apply migrations to DATABASE_URL. Uses the local Supabase shim only with --local.
 *   node scripts/db/migrate.ts --local
 */
import { migrate } from "../../packages/server-core/src/db/migrate.ts";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54329/menu_studio";
const applied = await migrate(url, { localShim: process.argv.includes("--local"), log: (m) => process.stdout.write(`${m}\n`) });
process.stdout.write(applied.length ? `Applied ${applied.length} migrations.\n` : "Database is up to date.\n");
