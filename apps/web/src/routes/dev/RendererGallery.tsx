import { ARCHETYPE_IDS, archetypeEligibility, buildDefaultSpec, FORMAT_IDS, type ArchetypeId, type FormatId } from "@menu-studio/shared";
import { SEED_IDS, SEEDS, type SeedId } from "@menu-studio/shared/seeds";
import { MenuRenderer } from "@menu-studio/renderer";
import type { OverflowReport } from "@menu-studio/shared";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

/**
 * Development gallery: any seed × archetype × format through the real renderer.
 * `?seed=&archetype=&format=&mode=print&lang=` also serves as a screenshot target.
 */
export function RendererGallery() {
  const [params, setParams] = useSearchParams();
  const seedId = (params.get("seed") as SeedId | null) ?? "cocktail-bar-london";
  const seed = SEEDS[seedId] ?? SEEDS["cocktail-bar-london"];
  const archetype = (params.get("archetype") as ArchetypeId | null) ?? seed.spec.archetype;
  const format = (params.get("format") as FormatId | null) ?? seed.spec.format;
  const mode = params.get("mode") === "print" ? "print" : params.get("mode") === "qr" ? "qr" : "editor";
  const lang = params.get("lang") ?? undefined;
  const [report, setReport] = useState<OverflowReport | null>(null);

  const spec = useMemo(() => {
    if (archetype === seed.spec.archetype && format === seed.spec.format) return seed.spec;
    return buildDefaultSpec({
      archetype,
      document: seed.document,
      format,
      orientation: params.get("orientation") === "landscape" ? "landscape" : "portrait",
      tokens: seed.spec.tokens,
    });
  }, [archetype, format, seed, params]);

  const eligibility = archetypeEligibility(archetype, seed.document, format);
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  if (mode === "print") {
    return <MenuRenderer document={seed.document} spec={spec} mode="print" lang={lang} signalReady />;
  }

  return (
    <div className="min-h-full bg-canvas">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-paper/95 px-5 py-3 backdrop-blur">
        <span className="display text-xl">Renderer gallery</span>
        <select className="rounded-sm border border-line bg-card px-2 py-1" value={seedId} onChange={(e) => set("seed", e.target.value)}>
          {SEED_IDS.map((id) => (
            <option key={id} value={id}>
              {SEEDS[id].document.venueName}
            </option>
          ))}
        </select>
        <select className="rounded-sm border border-line bg-card px-2 py-1" value={archetype} onChange={(e) => set("archetype", e.target.value)}>
          {ARCHETYPE_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <select className="rounded-sm border border-line bg-card px-2 py-1" value={format} onChange={(e) => set("format", e.target.value)}>
          {FORMAT_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        {!eligibility.eligible ? <span className="text-warn">{eligibility.reason}</span> : null}
        {report ? (
          <span className={report.fits ? "text-ok" : "text-danger"} data-testid="overflow-status">
            {report.fits ? "Fits" : `Overflow: ${report.pages.map((p) => p.overflowMm).join(", ")} mm`}
            {report.fontsLoaded ? "" : " · fonts missing"}
          </span>
        ) : null}
      </div>
      <div className="flex justify-center p-10">
        <MenuRenderer document={seed.document} spec={spec} mode={mode} lang={lang} onReport={setReport} now={new Date().toISOString()} timezone={seed.timezone} />
      </div>
    </div>
  );
}
