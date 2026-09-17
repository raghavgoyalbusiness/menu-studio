/**
 * Delete the local database directory. Refuses while Postgres is running, because the
 * running server holds the files open and would silently keep the old data.
 */
import { rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import { REPO_ROOT } from "../../packages/server-core/src/config.ts";

const port = Number(process.env.LOCAL_DB_PORT ?? 54329);
const running = await new Promise<boolean>((resolve) => {
  const socket = createConnection({ port, host: "127.0.0.1" });
  socket.once("connect", () => {
    socket.end();
    resolve(true);
  });
  socket.once("error", () => resolve(false));
});
if (running) {
  process.stderr.write(`Postgres is running on ${port}. Stop \`pnpm dev\` / \`pnpm db:start\` first.\n`);
  process.exit(1);
}
await rm(join(REPO_ROOT, ".data/pg"), { recursive: true, force: true });
process.stdout.write("Local database deleted. Run `pnpm db:start` then `pnpm db:seed`.\n");
