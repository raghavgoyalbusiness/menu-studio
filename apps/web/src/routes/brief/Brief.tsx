import { FONT_PAIRING_IDS, FONT_PAIRINGS, PALETTES, VIBE_KEYWORDS, type FontPairingId, type PaletteId, type VibeKeyword } from "@menu-studio/design-system/catalog";
import {
  archetypeEligibility,
  buildDefaultSpec,
  defaultBrief,
  FORMAT_IDS,
  FORMATS,
  pageSizeMm,
  PRICE_TIERS,
  type ArchetypeId,
  type DescribeReferenceResponse,
  type DesignBrief,
  type FormatId,
  type LayoutSpec,
  type MenuDocument,
  type UploadDto,
  type VersionDto,
} from "@menu-studio/shared";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { IconSparkle, IconUpload, IconX } from "../../components/icons.tsx";
import { MenuPreview } from "../../components/MenuPreview.tsx";
import { Badge, Button, Card, cx, ErrorNotice, Field, Input, PageHeader, Segmented, Slider, Spinner, Textarea } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { useProject } from "../../lib/queries.ts";

const VIBE_LABELS: Record<VibeKeyword, string> = {
  japanese_minimal: "Japanese minimal",
  art_deco: "Art deco",
  rustic: "Rustic",
  modern_indian: "Modern Indian",
  parisian_bistro: "Parisian bistro",
  brutalist: "Brutalist",
  botanical: "Botanical",
  retro_diner: "Retro diner",
  luxury_hotel: "Luxury hotel",
  street_food: "Street food",
  speakeasy: "Speakeasy",
  coastal: "Coastal",
};

function FormatThumb({ format, orientation }: { format: FormatId; orientation: DesignBrief["orientation"] }) {
  const size = pageSizeMm(format, orientation);
  const spec = FORMATS[format];
  const max = 46;
  const scale = max / Math.max(size.width, size.height);
  const w = size.width * scale;
  const h = size.height * scale;
  let x = 0;
  return (
    <svg width={max} height={max} viewBox={`0 0 ${max} ${max}`} aria-hidden>
      <rect x={(max - w) / 2} y={(max - h) / 2} width={w} height={h} rx={format === "MOBILE" ? 4 : 1} fill="#fff" stroke="currentColor" strokeWidth="1" />
      {spec.panelsMm?.slice(0, -1).map((p, i) => {
        x += p * scale;
        return <line key={i} x1={(max - w) / 2 + x} x2={(max - w) / 2 + x} y1={(max - h) / 2} y2={(max + h) / 2} stroke="currentColor" strokeDasharray="2 2" strokeWidth="0.8" />;
      })}
      {spec.horizontalFoldsMm?.map((f) => (
        <line key={f} x1={(max - w) / 2} x2={(max + w) / 2} y1={(max - h) / 2 + f * scale} y2={(max - h) / 2 + f * scale} stroke="currentColor" strokeDasharray="2 2" strokeWidth="0.8" />
      ))}
    </svg>
  );
}

/** What the two sliders mean, drawn with the real renderer. */
export function sliderPreviewSpec(document: MenuDocument, brief: DesignBrief): LayoutSpec {
  const m = brief.minimalToMaximal;
  const c = brief.classicToExperimental;
  const format: FormatId = brief.format === "MOBILE" ? "A4" : brief.format;
  const candidates: ArchetypeId[] = c < 34 ? ["classic_list", "two_column"] : c < 67 ? ["two_column", "classic_list"] : ["editorial", "two_column", "classic_list"];
  const archetype = candidates.find((a) => archetypeEligibility(a, document, format).eligible) ?? "classic_list";
  const fontPairingId: FontPairingId = c < 25 ? "bistro-garamond" : c < 50 ? "modern-serif" : c < 75 ? "geometric" : "luxe-didone";
  const vibe = brief.vibeKeywords[0];
  const paletteId = (Object.values(PALETTES).find((p) => vibe && p.moodTags.includes(vibe))?.id ?? (m > 70 ? "saffron" : "washi")) as PaletteId;
  return buildDefaultSpec({
    archetype,
    document,
    format,
    orientation: brief.orientation,
    tokens: {
      fontPairingId,
      paletteId,
      density: m < 34 ? "airy" : m < 67 ? "balanced" : "dense",
      ornamentStyle: m < 20 ? "none" : m < 45 ? "hairline" : m < 70 ? "double_rule" : c > 50 ? "deco" : "botanical",
      backgroundTexture: m > 75 ? "paper" : "none",
    },
  });
}

export function Brief() {
  const { projectId = "" } = useParams();
  const project = useProject(projectId);
  const navigate = useNavigate();
  const [brief, setBrief] = useState<DesignBrief | null>(null);
  const [debounced, setDebounced] = useState<DesignBrief | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const [references, setReferences] = useState<UploadDto[]>([]);

  // Start from the saved brief the first time the project loads.
  if (!brief && project.data?.head) {
    setBrief(project.data.head.brief ?? defaultBrief({ format: project.data.venue.country === "US" ? "US_LETTER" : "A4" }));
  }
  useEffect(() => {
    const id = setTimeout(() => setDebounced(brief), 250);
    return () => clearTimeout(id);
  }, [brief]);

  const update = (patch: Partial<DesignBrief>) => setBrief((b) => (b ? { ...b, ...patch } : b));
  const head = project.data?.head;

  const save = useMutation({
    mutationFn: async () => {
      if (!head || !brief) throw new Error("Nothing to save");
      return api<VersionDto>(`/projects/${projectId}/brief`, { method: "PUT", body: { baseVersionId: head.id, brief } });
    },
    onSuccess: () => navigate(`/projects/${projectId}/concepts?generate=1`),
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return api(`/venues/${project.data?.venue.id}/logo`, { method: "POST", form });
    },
    onSuccess: () => void project.refetch(),
  });

  const describe = useMutation({
    mutationFn: async (files: File[]) => {
      const uploads: UploadDto[] = [];
      for (const file of files.slice(0, 6)) {
        const form = new FormData();
        form.set("file", file);
        form.set("orgId", project.data?.org.id ?? "");
        form.set("projectId", projectId);
        form.set("kind", "reference");
        uploads.push(await api<UploadDto>("/uploads", { method: "POST", form }));
      }
      setReferences(uploads);
      return api<DescribeReferenceResponse>("/describe-reference", { method: "POST", body: { projectId, uploadIds: uploads.map((u) => u.id) } });
    },
    onSuccess: (result) => update({ referenceStyle: result.descriptors, referenceImageUrls: references.map((r) => r.url).slice(0, 6) }),
  });

  const preview = useMemo(() => (head && debounced ? sliderPreviewSpec(head.document, debounced) : null), [head, debounced]);

  if (project.isLoading || !brief) return <div className="flex justify-center py-24 text-muted"><Spinner /></div>;
  if (project.error) return <ErrorNotice error={project.error} />;
  if (!head) return <ErrorNotice error={new Error("Import a menu first.")} />;

  const locked = FORMATS[brief.format].orientation !== "any";

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow={project.data?.venue.name} title="Design brief" description="A few choices so the three concepts fit your venue. Everything can be changed later." />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="display text-[26px]">Format</h2>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {FORMAT_IDS.map((f) => (
                <button
                  key={f}
                  onClick={() => update({ format: f, orientation: FORMATS[f].orientation === "any" ? brief.orientation : FORMATS[f].orientation })}
                  className={cx("flex flex-col items-center gap-2 rounded-md border px-2 py-3 text-[11.5px] transition-colors", brief.format === f ? "border-ink bg-card text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink")}
                  aria-pressed={brief.format === f}
                  title={FORMATS[f].description}
                >
                  <FormatThumb format={f} orientation={brief.orientation} />
                  {FORMATS[f].label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-muted">{FORMATS[brief.format].description}</p>
            <div className="mt-4 flex flex-wrap gap-6">
              <Field label="Orientation">
                {locked ? (
                  <span className="text-[13px] capitalize text-muted">{FORMATS[brief.format].orientation} (fixed)</span>
                ) : (
                  <Segmented value={brief.orientation} onChange={(v) => update({ orientation: v })} options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]} />
                )}
              </Field>
              <Field label="Pages">
                <Segmented
                  value={typeof brief.pageCountPreference === "number" ? "number" : brief.pageCountPreference}
                  onChange={(v) => update({ pageCountPreference: v === "number" ? 2 : v })}
                  options={[
                    { value: "single", label: "One page" },
                    { value: "fit_content", label: "As needed" },
                    { value: "number", label: "Exactly…" },
                  ]}
                />
              </Field>
              {typeof brief.pageCountPreference === "number" ? (
                <Field label="Page count">
                  <Input type="number" min={1} max={24} value={brief.pageCountPreference} onChange={(e) => update({ pageCountPreference: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })} className="w-20" />
                </Field>
              ) : null}
            </div>
          </section>

          <section>
            <h2 className="display text-[26px]">Look and feel</h2>
            <div className="mt-5 grid gap-8 sm:grid-cols-2">
              <div>
                <div className="mb-3 flex justify-between text-[12.5px] text-muted">
                  <span>Minimal</span>
                  <span>Maximal</span>
                </div>
                <Slider label="Minimal to maximal" value={brief.minimalToMaximal} onChange={(v) => update({ minimalToMaximal: v })} />
                <p className="mt-2 text-[12.5px] text-muted">Spacing and ornament: from generous white space to rich rules and flourishes.</p>
              </div>
              <div>
                <div className="mb-3 flex justify-between text-[12.5px] text-muted">
                  <span>Classic</span>
                  <span>Experimental</span>
                </div>
                <Slider label="Classic to experimental" value={brief.classicToExperimental} onChange={(v) => update({ classicToExperimental: v })} />
                <p className="mt-2 text-[12.5px] text-muted">Layout and type: from a traditional list to editorial layouts and bolder type.</p>
              </div>
            </div>
            <div className="mt-6">
              <div className="text-[12.5px] font-medium text-ink-2">Vibe</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {VIBE_KEYWORDS.map((v) => {
                  const active = brief.vibeKeywords.includes(v);
                  return (
                    <button
                      key={v}
                      onClick={() => update({ vibeKeywords: active ? brief.vibeKeywords.filter((x) => x !== v) : [...brief.vibeKeywords, v].slice(0, 6) })}
                      className={cx("rounded-full border px-3 py-1.5 text-[12.5px] transition-colors", active ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-2 hover:border-ink")}
                      aria-pressed={active}
                    >
                      {VIBE_LABELS[v]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Cuisine (optional)">
                <Input value={brief.cuisine ?? ""} onChange={(e) => update({ cuisine: e.target.value || undefined })} placeholder="North Indian" />
              </Field>
              <Field label="Price point">
                <Segmented value={brief.priceTier} onChange={(v) => update({ priceTier: v })} options={PRICE_TIERS.map((p) => ({ value: p, label: p === "fine_dining" ? "Fine" : p[0]?.toUpperCase() + p.slice(1) }))} />
              </Field>
            </div>
          </section>

          <section>
            <h2 className="display text-[26px]">Brand and references</h2>
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <Card className="p-4">
                <div className="text-[12.5px] font-medium text-ink-2">Logo</div>
                <div className="mt-3 flex items-center gap-3">
                  {project.data?.venue.logoUrl ? <img src={project.data.venue.logoUrl} alt="Venue logo" className="h-12 w-12 rounded border border-line object-contain" /> : <div className="h-12 w-12 rounded border border-dashed border-line-strong" />}
                  <Button size="sm" icon={<IconUpload size={14} />} loading={uploadLogo.isPending} onClick={() => logoRef.current?.click()}>
                    {project.data?.venue.logoUrl ? "Replace" : "Upload"}
                  </Button>
                  <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && uploadLogo.mutate(e.target.files[0])} />
                </div>
                <div className="mt-4 text-[12.5px] font-medium text-ink-2">Brand colours</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(brief.brandAssets?.brandColors ?? []).map((c, i) => (
                    <span key={`${c}-${i}`} className="group relative">
                      <input
                        type="color"
                        value={c}
                        aria-label={`Brand colour ${i + 1}`}
                        onChange={(e) => update({ brandAssets: { brandColors: (brief.brandAssets?.brandColors ?? []).map((x, j) => (j === i ? e.target.value.toUpperCase() : x)), brandFonts: brief.brandAssets?.brandFonts ?? [] } })}
                        className="h-8 w-8 rounded border border-line"
                      />
                      <button
                        className="absolute -top-1.5 -right-1.5 hidden rounded-full bg-ink p-0.5 text-paper group-hover:block"
                        aria-label="Remove colour"
                        onClick={() => update({ brandAssets: { brandColors: (brief.brandAssets?.brandColors ?? []).filter((_, j) => j !== i), brandFonts: brief.brandAssets?.brandFonts ?? [] } })}
                      >
                        <IconX size={10} />
                      </button>
                    </span>
                  ))}
                  {(brief.brandAssets?.brandColors.length ?? 0) < 6 ? (
                    <Button size="sm" variant="ghost" onClick={() => update({ brandAssets: { brandColors: [...(brief.brandAssets?.brandColors ?? []), "#1C1B19"], brandFonts: brief.brandAssets?.brandFonts ?? [] } })}>
                      Add colour
                    </Button>
                  ) : null}
                </div>
                <p className="mt-2 text-[11.5px] text-muted">Menus use curated palettes; brand colours steer which one is chosen.</p>
              </Card>
              <Card className="p-4">
                <div className="text-[12.5px] font-medium text-ink-2">Menus you like</div>
                <p className="mt-1 text-[12px] text-muted">Upload up to 6. We describe their mood only and never copy a layout.</p>
                <Button size="sm" className="mt-3" icon={<IconSparkle size={14} />} loading={describe.isPending} onClick={() => referenceRef.current?.click()}>
                  Upload references
                </Button>
                <input ref={referenceRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => e.target.files?.length && describe.mutate(Array.from(e.target.files))} />
                {brief.referenceStyle ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[brief.referenceStyle.typographyMood, brief.referenceStyle.paletteMood, brief.referenceStyle.density, brief.referenceStyle.layoutPattern, ...brief.referenceStyle.vibeKeywords].map((d) => (
                      <Badge key={d} tone="accent">
                        {d.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {describe.error ? <ErrorNotice className="mt-3" error={describe.error} /> : null}
              </Card>
            </div>
            <div className="mt-6">
              <div className="text-[12.5px] font-medium text-ink-2">Preferred typography (optional)</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {FONT_PAIRING_IDS.map((id) => {
                  const pairing = FONT_PAIRINGS[id];
                  const selected = brief.brandAssets?.brandFonts.includes(id) ?? false;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        const fonts = selected ? (brief.brandAssets?.brandFonts ?? []).filter((f) => f !== id) : [...(brief.brandAssets?.brandFonts ?? []), id].slice(0, 3);
                        update({ brandAssets: { brandColors: brief.brandAssets?.brandColors ?? [], brandFonts: fonts } });
                      }}
                      className={cx("rounded-md border px-3 py-2 text-left transition-colors", selected ? "border-ink bg-card" : "border-line hover:border-line-strong")}
                      aria-pressed={selected}
                    >
                      <span className="block text-[17px] leading-tight" style={{ fontFamily: `"${pairing.display.family}"` }}>
                        {pairing.name}
                      </span>
                      <span className="text-[11px] text-muted" style={{ fontFamily: `"${pairing.body.family}"` }}>
                        {pairing.body.family}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Must include" hint="For example: our logo at the top, a note about the service charge.">
                <Textarea value={brief.mustInclude ?? ""} onChange={(e) => update({ mustInclude: e.target.value || undefined })} className="min-h-20" />
              </Field>
              <Field label="Avoid" hint="For example: gold, script fonts, busy borders.">
                <Textarea value={brief.avoid ?? ""} onChange={(e) => update({ avoid: e.target.value || undefined })} className="min-h-20" />
              </Field>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <div className="eyebrow">Live preview</div>
              <p className="mt-1 text-[12px] text-muted">A quick sketch of your slider choices, using your menu.</p>
            </div>
            <div className="flex justify-center bg-canvas p-5">
              {preview ? <MenuPreview document={head.document} spec={preview} width={250} className="shadow-soft" /> : <Spinner />}
            </div>
          </Card>
          <Button variant="primary" size="lg" className="mt-5 w-full" icon={<IconSparkle size={16} />} loading={save.isPending} onClick={() => save.mutate()}>
            Generate 3 concepts
          </Button>
          {save.error ? <ErrorNotice className="mt-3" error={save.error} onRetry={() => save.mutate()} /> : null}
        </aside>
      </div>
    </div>
  );
}
