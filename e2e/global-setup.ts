import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The web servers in playwright.config.ts bring the stack up; this makes sure the schema and the
 * sample menus are in place before the first test. Both commands are idempotent.
 */
export default async function globalSetup(): Promise<void> {
  const cwd = new URL("..", import.meta.url).pathname;
  await run("pnpm", ["db:migrate"], { cwd });
  const { stdout } = await run("pnpm", ["db:seed"], { cwd });
  process.stdout.write(stdout.trim().split("\n").at(-1) + "\n");
}
