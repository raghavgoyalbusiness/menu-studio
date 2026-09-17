import { CACHE, getVenue, publishedPath, requireVersion, type Bucket, type Db, type Logger, type PublishFile, type PublishTarget, type Storage } from "@menu-studio/server-core";
import { specFontFamilies } from "@menu-studio/renderer/pure";
import { buildQrSpec } from "@menu-studio/shared";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const menuDist = join(repoRoot, "apps/menu/dist");
const fontsDir = join(repoRoot, "packages/design-system/fonts");

export interface PublishDeps {
  db: Db;
  storage: Storage;
  target: PublishTarget;
  logger: Logger;
  apiUrl: string;
  menuUrl: string;
}

interface ClientAssets {
  css: string[];
  js: string[];
  files: PublishFile[];
}

let assetsCache: ClientAssets | null = null;

/** The QR site's client bundle, published once under content-hashed names. */
async function clientAssets(): Promise<ClientAssets> {
  if (assetsCache) return assetsCache;
  const manifest = JSON.parse(await readFile(join(menuDist, "client/.vite/manifest.json"), "utf8")) as Record<string, { file: string; css?: string[]; isEntry?: boolean }>;
  const entry = Object.values(manifest).find((m) => m.isEntry);
  if (!entry) throw new Error("apps/menu client build has no entry. Run `pnpm --filter @menu-studio/menu build`.");
  // With cssCodeSplit off, Vite lists the stylesheet as its own manifest entry, not under the chunk.
  const css = [...new Set([...(entry.css ?? []), ...Object.values(manifest).map((m) => m.file).filter((f) => f.endsWith(".css"))])];
  const files: PublishFile[] = [];
  for (const path of [entry.file, ...css]) {
    files.push({ key: path, body: await readFile(join(menuDist, "client", path)), contentType: path.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8", cacheControl: CACHE.immutable });
  }
  const assetDir = join(menuDist, "client/assets");
  for (const name of await readdir(assetDir)) {
    if (name.endsWith(".woff2") || name.endsWith(".svg") || name.endsWith(".png")) {
      files.push({ key: `assets/${name}`, body: await readFile(join(assetDir, name)), contentType: name.endsWith(".woff2") ? "font/woff2" : name.endsWith(".svg") ? "image/svg+xml" : "image/png", cacheControl: CACHE.immutable });
    }
  }
  assetsCache = { css: css.map((c) => `/${c}`), js: [`/${entry.file}`], files };
  return assetsCache;
}

/** Only the @font-face rules for this menu's two families, pointing at published copies. */
export async function fontCssFor(families: string[]): Promise<{ css: string; files: PublishFile[] }> {
  const source = await readFile(join(fontsDir, "fonts.css"), "utf8");
  const blocks = source.match(/@font-face\s*{[^}]*}/g) ?? [];
  const wanted = new Set(families.map((f) => f.toLowerCase()));
  const files: PublishFile[] = [];
  const kept: string[] = [];
  for (const block of blocks) {
    const family = /font-family:\s*'([^']+)'/.exec(block)?.[1]?.toLowerCase();
    if (!family || !wanted.has(family)) continue;
    const file = /url\(\.\/files\/([^)]+)\)/.exec(block)?.[1];
    if (!file) continue;
    files.push({ key: `fonts/${file}`, body: await readFile(join(fontsDir, "files", file)), contentType: "font/woff2", cacheControl: CACHE.immutable });
    kept.push(block.replace(`./files/${file}`, `/fonts/${file}`));
  }
  return { css: kept.join("\n").replace(/\s+/g, " "), files };
}

interface RenderModule {
  renderMenuPage(input: unknown): string;
}

let renderModule: Promise<RenderModule> | null = null;
function loadRenderer(): Promise<RenderModule> {
  renderModule ??= import(join(menuDist, "server/entry-server.js")) as Promise<RenderModule>;
  return renderModule;
}

export async function runPublish(deps: PublishDeps, publishedMenuId: string): Promise<{ keys: string[] }> {
  const logger = deps.logger.child({ publishedMenuId });
  const data = await deps.db.asService(async (q) => {
    const { rows } = await q.query<{ venue_id: string; project_id: string; version_id: string; slug: string; is_live: boolean; languages: string[]; theme_mode: "match_print" | "mobile_optimized"; published_at: Date; white_label: { brandName?: string } | null }>(
      `select pm.*, o.white_label from published_menus pm join venues v on v.id = pm.venue_id join organizations o on o.id = v.org_id where pm.id = $1`,
      [publishedMenuId],
    );
    const row = rows[0];
    if (!row) throw new Error(`Published menu ${publishedMenuId} not found`);
    const venue = await getVenue(q, row.venue_id);
    if (!venue) throw new Error("Venue not found");
    const version = await requireVersion(q, row.project_id, row.version_id);
    return { row, venue, version };
  });

  const { row, venue, version } = data;
  const document = version.document;
  const spec = buildQrSpec(document, version.spec, row.theme_mode);
  const languages = row.languages.length ? row.languages.filter((l) => l === document.primaryLanguage || document.additionalLanguages.includes(l)) : [document.primaryLanguage];
  const ordered = [document.primaryLanguage, ...languages.filter((l) => l !== document.primaryLanguage)].filter((l) => languages.includes(l) || l === document.primaryLanguage);

  const [{ renderMenuPage }, assets, fonts] = await Promise.all([loadRenderer(), clientAssets(), fontCssFor(specFontFamilies(spec))]);

  let logoUrl: string | null = null;
  const files: PublishFile[] = [...assets.files, ...fonts.files];
  if (venue.logoUrl?.includes(":")) {
    const [bucket, key] = venue.logoUrl.split(/:(.+)/) as [Bucket, string];
    const logo = await deps.storage.get(bucket, key);
    if (logo) {
      const name = `logos/${createHash("sha1").update(logo.body).digest("hex").slice(0, 16)}.png`;
      files.push({ key: name, body: logo.body, contentType: logo.contentType, cacheControl: CACHE.immutable });
      logoUrl = `/${name}`;
    }
  }

  const root = publishedPath(venue.slug, row.slug);
  for (const lang of ordered) {
    const path = lang === document.primaryLanguage ? root : `${root}/${lang}`;
    const html = renderMenuPage({
      document,
      spec,
      lang,
      languages: ordered,
      venue: { name: venue.name, slug: venue.slug, timezone: venue.timezone, city: venue.city, logoUrl },
      publishedMenuId,
      basePath: `/${root}`,
      apiUrl: deps.apiUrl.replace(/\/$/, ""),
      canonicalUrl: `${deps.menuUrl.replace(/\/$/, "")}/${path}`,
      publishedAt: new Date().toISOString(),
      offline: !row.is_live,
      assets: { css: assets.css, js: assets.js },
      fontCss: fonts.css,
      whiteLabel: row.white_label,
    });
    files.push({ key: `${path}/index.html`, body: html, contentType: "text/html; charset=utf-8", cacheControl: CACHE.html });
  }

  await deps.target.write(files);
  logger.info("published", { root, languages: ordered, live: row.is_live, files: files.length });
  return { keys: files.map((f) => f.key) };
}
