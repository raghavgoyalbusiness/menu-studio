/**
 * Local stand-in for the QR menu CDN: serves what the publish job wrote to .data/published,
 * with the same cache headers S3/CloudFront would send, plus the client build's assets.
 *
 *   pnpm --filter @menu-studio/menu dev   → http://127.0.0.1:5224/<venue-slug>
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(here, "../..");
const publishedDir = process.env.PUBLISHED_DIR ?? join(repoRoot, ".data/published");
const port = Number(process.env.PORT ?? 5224);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
};

async function file(path: string): Promise<{ body: Buffer; headers: Record<string, string> } | null> {
  try {
    const info = await stat(path);
    const resolved = info.isDirectory() ? join(path, "index.html") : path;
    const body = await readFile(resolved);
    let headers: Record<string, string> = { "content-type": TYPES[extname(resolved)] ?? "application/octet-stream" };
    try {
      headers = { ...headers, ...(JSON.parse(await readFile(`${resolved}.headers.json`, "utf8")) as Record<string, string>) };
    } catch {
      headers["cache-control"] = "public, max-age=60";
    }
    return { body, headers };
  } catch {
    return null;
  }
}

const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
app.get("/*", async (c) => {
  const path = normalize(decodeURIComponent(c.req.path)).replace(/^(\.\.[/\\])+/, "");
  if (path.includes("..")) return c.text("Not found", 404);
  const found = await file(join(publishedDir, path));
  if (!found) {
    return c.html(`<!doctype html><meta name="viewport" content="width=device-width"><title>Menu not found</title><body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh"><p>This menu isn't published.</p>`, 404);
  }
  return c.body(new Uint8Array(found.body), 200, found.headers);
});

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  process.stdout.write(`QR menu site on http://127.0.0.1:${info.port} (serving ${publishedDir})\n`);
});
