import { SEEDS } from "@menu-studio/shared/seeds";
import type { MenuDocument } from "@menu-studio/shared";
import { describe, expect, it } from "vitest";
import { renderMenuPage, type RenderMenuInput } from "./entry-server.tsx";

/**
 * The published menu is a public page carrying text an owner typed. Owner text is never trusted:
 * React escapes what it renders, and the three places this file builds HTML by hand — the head, the
 * JSON-LD block and the config blob — escape explicitly. These tests are the guard on that.
 */

const seed = SEEDS["bistro-paris"];

function input(overrides: Partial<RenderMenuInput> = {}): RenderMenuInput {
  return {
    document: seed.document,
    spec: seed.spec,
    lang: seed.document.primaryLanguage,
    languages: [seed.document.primaryLanguage],
    venue: { name: "Chez Lucette", slug: "chez-lucette", timezone: "Europe/Paris", city: "Paris", logoUrl: null },
    publishedMenuId: "00000000-0000-4000-8000-000000000001",
    basePath: "/chez-lucette",
    apiUrl: "https://api.example.test",
    canonicalUrl: "https://menu.example.test/chez-lucette",
    publishedAt: "2026-09-18T00:00:00.000Z",
    offline: false,
    assets: { css: ["/assets/menu.css"], js: ["/assets/menu.js"] },
    fontCss: "@font-face{font-family:'Fraunces';src:url(/fonts/fraunces.woff2)}",
    whiteLabel: null,
    ...overrides,
  };
}

/** A menu whose every text field is an injection attempt. */
function hostileDocument(): MenuDocument {
  const document = structuredClone(seed.document) as MenuDocument;
  document.venueName = '</title><script>alert("venue")</script>';
  const section = document.sections[0];
  if (!section) throw new Error("seed has no sections");
  section.title = '</h2><img src=x onerror=alert("section")>';
  const item = section.items[0];
  if (!item) throw new Error("seed has no items");
  item.name = '<script>alert("item")</script>';
  item.description = '"><svg onload=alert(1)>';
  return document;
}

describe("published menu HTML", () => {
  it("renders the menu into the HTML itself", () => {
    const html = renderMenuPage(input());
    expect(html.toLowerCase()).toContain("<!doctype html>");
    expect(html).toContain("Chez Lucette");
    // Items must be in the document, not fetched after load.
    const firstItem = seed.document.sections[0]?.items[0]?.name;
    expect(firstItem).toBeTruthy();
    expect(html).toContain(firstItem!);
  });

  it("declares its language and direction", () => {
    const html = renderMenuPage(input());
    expect(html).toContain(`<html lang="${seed.document.primaryLanguage}" dir="ltr">`);
    const rtl = renderMenuPage(input({ lang: "ar", languages: ["ar"] }));
    expect(rtl).toContain('<html lang="ar" dir="rtl">');
  });

  it("links every translation with hreflang", () => {
    const html = renderMenuPage(input({ languages: ["fr", "en", "de"] }));
    for (const lang of ["fr", "en", "de"]) expect(html).toContain(`hreflang="${lang}"`);
  });

  it("emits JSON-LD a search engine can read", () => {
    const html = renderMenuPage(input());
    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(match, "no JSON-LD block").not.toBeNull();
    const parsed = JSON.parse(match![1]!.replaceAll("\\u003c", "<").replaceAll("\\u003e", ">").replaceAll("\\u0026", "&")) as { "@type": string; name: string };
    expect(parsed["@type"]).toBe("Restaurant");
    expect(parsed.name).toBe("Chez Lucette");
  });

  it("escapes owner text everywhere it builds HTML by hand", () => {
    const html = renderMenuPage(input({ document: hostileDocument(), venue: { ...input().venue, name: '"><script>alert("name")</script>' } }));

    // The injected strings may appear as *text* — that is what escaping looks like. What must never
    // appear is any of them as real markup.
    expect(html).not.toContain('<script>alert(');
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<svg onload");

    // The escaped forms are present, which proves the text survived rather than being stripped.
    expect(html).toContain("&lt;img src=x onerror=alert(&quot;section&quot;)&gt;");
    expect(html).toContain("&lt;script&gt;alert(&quot;item&quot;)&lt;/script&gt;");

    // The only script tags on the page are the ones this file writes.
    const scriptOpens = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(scriptOpens).toEqual(scriptOpens.filter((tag) => tag === "<script>" || tag.includes('type="application/ld+json"') || tag.includes('type="module"')));
  });

  it("keeps a closing script tag out of the inlined JSON blobs", () => {
    // The venue name is written into the JSON-LD block, which is hand-built rather than rendered.
    const html = renderMenuPage(input({ venue: { ...input().venue, name: "</script><script>alert(1)</script>" } }));
    // escapeJson turns < and > into unicode escapes, so the string cannot close its own script tag.
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c/script\\u003e");
  });

  it("still names the venue when the menu is unavailable", () => {
    const html = renderMenuPage(input({ offline: true }));
    expect(html).toContain("Chez Lucette");
    expect(html).toContain("not available");
  });

  it("uses an agency's brand name when white-labelled", () => {
    const html = renderMenuPage(input({ whiteLabel: { brandName: "Studio Bellecour" } }));
    expect(html).toContain("Studio Bellecour");
    expect(html).not.toContain("Menu by Menu Studio");
  });
});
