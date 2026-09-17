import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

export interface LocalPostgres {
  url: string;
  port: number;
  stop(): Promise<void>;
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Real Postgres without Docker (binaries from the embedded-postgres package). Used for
 * local development and tests; production uses Supabase.
 */
export async function startLocalPostgres(options: { dataDir: string; port: number; database: string; persistent: boolean; quiet?: boolean }): Promise<LocalPostgres> {
  await mkdir(options.dataDir, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: options.dataDir,
    port: options.port,
    user: "postgres",
    password: "postgres",
    persistent: options.persistent,
    onLog: options.quiet ? () => undefined : (m) => process.stdout.write(`[postgres] ${m}`),
    onError: (m) => process.stderr.write(`[postgres] ${String(m)}\n`),
  });
  if (!existsSync(join(options.dataDir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(options.database);
  } catch {
    // Already exists.
  }
  return {
    url: `postgres://postgres:postgres@127.0.0.1:${options.port}/${options.database}`,
    port: options.port,
    stop: () => pg.stop(),
  };
}
