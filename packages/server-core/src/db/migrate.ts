import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const supabaseDir = fileURLToPath(new URL("../../../../supabase/", import.meta.url));

export interface MigrateOptions {
  /** Apply supabase/local shim first. Only for the embedded local Postgres. */
  localShim: boolean;
  log?: (msg: string) => void;
}

/**
 * Apply supabase/migrations in order, recording them in the same table the Supabase CLI
 * uses, so a database migrated locally and one migrated with `supabase db push` agree.
 */
export async function migrate(connectionString: string, options: MigrateOptions): Promise<string[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    if (options.localShim) {
      await client.query(await readFile(`${supabaseDir}local/00_supabase_shim.sql`, "utf8"));
    }
    await client.query("create schema if not exists supabase_migrations");
    await client.query(
      "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)",
    );
    const done = new Set((await client.query<{ version: string }>("select version from supabase_migrations.schema_migrations")).rows.map((r) => r.version));
    const files = (await readdir(`${supabaseDir}migrations`)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const [version = file, ...rest] = file.replace(/\.sql$/, "").split("_");
      if (done.has(version)) continue;
      const sql = await readFile(`${supabaseDir}migrations/${file}`, "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3)", [version, [sql], rest.join("_")]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
      applied.push(file);
      options.log?.(`applied ${file}`);
    }
  } finally {
    await client.end();
  }
  return applied;
}

/**
 * pg-boss creates its own tables. Enable RLS on them (no policies) so nothing in that
 * schema is readable through the Data API; the owner connection pg-boss uses bypasses RLS.
 */
export async function hardenPgBossSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    do $$
    declare t record;
    begin
      for t in select schemaname, tablename from pg_tables where schemaname = 'pgboss' loop
        execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
      end loop;
    end $$;
  `);
}

/** Tables in the given schemas that do not have RLS enabled. */
export async function tablesWithoutRls(pool: pg.Pool, schemas: string[]): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>(
    `select n.nspname || '.' || c.relname as name
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and n.nspname = any($1) and not c.relrowsecurity
      order by 1`,
    [schemas],
  );
  return rows.map((r) => r.name);
}
