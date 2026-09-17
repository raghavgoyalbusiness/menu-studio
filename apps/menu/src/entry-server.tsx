import { textDirection } from "@menu-studio/i18n";
import { MenuRenderer, resolveTokens } from "@menu-studio/renderer";
import { confirmedAllergens, DEFAULT_ALLERGEN_DISCLAIMER, type LayoutSpec, type MenuDocument } from "@menu-studio/shared";
import { renderToString } from "react-dom/server";
import { MenuChrome } from "./MenuChrome.tsx";

export interface RenderMenuInput {
  document: MenuDocument;
  spec: LayoutSpec;
  lang: string;
  languages: string[];
  venue: { name: string; slug: string; timezone: string; city: string | null; logoUrl: string | null };
  publishedMenuId: string;
  basePath: string;
  apiUrl: string;
  canonicalUrl: string;
  publishedAt: string;
  offline: boolean;
  /** Stylesheets and scripts from the client build, relative to the site root. */
  assets: { css: string[]; js: string[] };
  /** Inline @font-face rules for just this menu's fonts. */
  fontCss: string;
  whiteLabel: { brandName?: string } | null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const escapeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

function jsonLd(input: RenderMenuInput): unknown {
  const { document } = input;
  return {
    "@context": "https://schema.org",
    "@type": document.venueType === "cafe" || document.venueType === "bakery" ? "CafeOrCoffeeShop" : document.venueType === "bar" ? "BarOrPub" : "Restaurant",
    name: input.venue.name,
    ...(input.venue.city ? { address: { "@type": "PostalAddress", addressLocality: input.venue.city } } : {}),
    hasMenu: {
      "@type": "Menu",
      inLanguage: input.lang,
      hasMenuSection: document.sections.map((s) => ({
        "@type": "MenuSection",
        name: s.translations?.[input.lang]?.title ?? s.title,
        hasMenuItem: s.items
          .filter((i) => i.available)
          .map((i) => ({
            "@type": "MenuItem",
            name: i.translations?.[input.lang]?.name ?? i.name,
            ...(i.description ? { description: i.translations?.[input.lang]?.description ?? i.description } : {}),
            ...(i.price !== null ? { offers: { "@type": "Offer", price: (i.price / 100).toFixed(2), priceCurrency: document.currency } } : {}),
          })),
      })),
    },
  };
}

/** Full static HTML for one language of a published QR menu. */
export function renderMenuPage(input: RenderMenuInput): string {
  const dir = textDirection(input.lang);
  const hasAllergens = input.document.sections.some((s) => s.items.some((i) => confirmedAllergens(i).length > 0));
  const body = input.offline ? (
    <main className="qr-offline">
      <h1>{input.venue.name}</h1>
      <p>This menu is not available right now.</p>
    </main>
  ) : (
    <MenuChrome
      languages={input.languages}
      lang={input.lang}
      basePath={input.basePath}
      venueName={input.venue.name}
      allergenNote={hasAllergens ? (input.document.allergenDisclaimer ?? DEFAULT_ALLERGEN_DISCLAIMER) : null}
      brandName={input.whiteLabel?.brandName ?? null}
      colors={resolveTokens(input.spec, "qr").colors}
    >
      <MenuRenderer document={input.document} spec={input.spec} mode="qr" lang={input.lang} now={input.publishedAt} timezone={input.venue.timezone} logoUrl={input.venue.logoUrl} />
    </MenuChrome>
  );
  const markup = renderToString(body);
  const title = `${input.venue.name} menu`;
  const description = `${input.document.sections.map((s) => s.title).slice(0, 5).join(", ")}${input.venue.city ? ` · ${input.venue.city}` : ""}`;
  const config = { m: input.publishedMenuId, api: input.apiUrl, tz: input.venue.timezone, lang: input.lang };
  return `<!doctype html>
<html lang="${escapeHtml(input.lang)}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}">
${input.languages.map((l) => `<link rel="alternate" hreflang="${escapeHtml(l)}" href="${escapeHtml(`${input.canonicalUrl.replace(/\/[a-z]{2,3}$/, "")}${l === input.languages[0] ? "" : `/${l}`}`)}">`).join("\n")}
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta name="theme-color" content="${escapeHtml(resolveTokens(input.spec, "qr").colors.background)}">
<style>${input.fontCss}</style>
${input.assets.css.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join("\n")}
<script type="application/ld+json">${escapeJson(jsonLd(input))}</script>
<script>window.__MENU__=${escapeJson(config)}</script>
</head>
<body>
<div id="menu">${markup}</div>
${input.assets.js.map((src) => `<script type="module" src="${escapeHtml(src)}"></script>`).join("\n")}
</body>
</html>`;
}
