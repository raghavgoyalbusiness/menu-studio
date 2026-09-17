import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db/migrate.ts";
import { createDb, type AuthClaims, type Db } from "../db/pool.ts";
import { freePort, startLocalPostgres } from "../local-postgres.ts";

export interface TestDatabase {
  url: string;
  stop(): Promise<void>;
}

/** A throwaway Postgres with Supabase shim + all migrations applied. For vitest globalSetup. */
export async function startTestDatabase(): Promise<TestDatabase> {
  const dir = await mkdtemp(join(tmpdir(), "menu-studio-pg-"));
  const port = await freePort();
  const pg = await startLocalPostgres({ dataDir: dir, port, database: "test", persistent: false, quiet: true });
  await migrate(pg.url, { localShim: true });
  return {
    url: pg.url,
    stop: async () => {
      await pg.stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function connectTestDb(url: string): Db {
  return createDb(url, { max: 5 });
}

let counter = 0;

/** Insert a user into auth.users (the local shim or a real Supabase test project). */
export async function createTestUser(db: Db, label = "user"): Promise<AuthClaims> {
  counter++;
  const email = `${label}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 7)}@test.menu-studio.local`;
  const { rows } = await db.pool.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
  const id = rows[0]?.id;
  if (!id) throw new Error("could not create test user");
  return { sub: id, email };
}
