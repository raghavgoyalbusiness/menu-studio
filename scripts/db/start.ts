/**
 * Local Postgres for development (no Docker). Applies the Supabase shim and migrations, then
 * stays running until interrupted. Only this process opens .data/pg.
 *
 *   pnpm db:start
 */
import { join } from "node:path";
import { createConnection } from "node:net";
import { migrate } from "../../packages/server-core/src/db/migrate.ts";
import { startLocalPostgres } from "../../packages/server-core/src/local-postgres.ts";
import { REPO_ROOT } from "../../packages/server-core/src/config.ts";

export const LOCAL_DB_PORT = Number(process.env.LOCAL_DB_PORT ?? 54329);

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

if (await portInUse(LOCAL_DB_PORT)) {
  process.stdout.write(`Postgres is already running on ${LOCAL_DB_PORT}.\n`);
  // Keep the turbo task alive without opening the data directory a second time.
  setInterval(() => undefined, 1 << 30);
} else {
  const pg = await startLocalPostgres({ dataDir: join(REPO_ROOT, ".data/pg"), port: LOCAL_DB_PORT, database: "menu_studio", persistent: true, quiet: true });
  const applied = await migrate(pg.url, { localShim: true, log: (m) => process.stdout.write(`  ${m}\n`) });
  process.stdout.write(`Postgres ready at ${pg.url} (${applied.length} new migrations)\n`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
  setInterval(() => undefined, 1 << 30);
}
