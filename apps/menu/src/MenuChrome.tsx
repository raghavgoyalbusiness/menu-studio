import { languageName } from "@menu-studio/i18n";
import type { ReactNode } from "react";

const FILTERS = [
  { id: "veg", label: "Vegetarian", tags: "veg vegan jain" },
  { id: "vegan", label: "Vegan", tags: "vegan" },
  { id: "gluten_free", label: "Gluten free", tags: "gluten_free" },
];

/** Search, dietary filters and language links around the renderer. Behaviour comes from entry-client. */
export function MenuChrome({
  children,
  languages,
  lang,
  basePath,
  venueName,
  allergenNote,
  brandName,
  colors,
}: {
  children: ReactNode;
  languages: string[];
  lang: string;
  basePath: string;
  venueName: string;
  allergenNote: string | null;
  brandName: string | null;
  /** The published menu's palette, so the search and filter bar matches the menu. */
  colors: { background: string; text: string; muted: string; accent: string };
}) {
  return (
    <div
      className="qr-shell"
      style={{ background: colors.background, color: colors.text, ["--qr-muted" as string]: colors.muted, ["--qr-accent" as string]: colors.accent }}
    >
      <div className="qr-tools" role="search">
        <label className="qr-search">
          <span className="qr-sr">Search {venueName} menu</span>
          <input type="search" placeholder="Search the menu" data-qr-search autoComplete="off" />
        </label>
        <div className="qr-filters" aria-label="Dietary filters">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="qr-chip" data-qr-filter={f.tags} aria-pressed="false">
              {f.label}
            </button>
          ))}
        </div>
        {languages.length > 1 ? (
          <nav className="qr-langs" aria-label="Language">
            {languages.map((l, i) => (
              <a key={l} href={i === 0 ? basePath : `${basePath}/${l}`} aria-current={l === lang ? "true" : undefined} hrefLang={l} lang={l}>
                {languageName(l, true)}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
      {children}
      <p className="qr-empty" data-qr-empty hidden>
        No dishes match. Try another search or filter.
      </p>
      <footer className="qr-footer">
        {allergenNote ? <p>{allergenNote}</p> : null}
        <p className="qr-powered">{brandName ? `Menu by ${brandName}` : "Menu by Menu Studio"}</p>
      </footer>
    </div>
  );
}
