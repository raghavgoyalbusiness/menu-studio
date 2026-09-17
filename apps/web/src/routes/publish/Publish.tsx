import { contrastRatio, PALETTES } from "@menu-studio/design-system/catalog";
import { languageName } from "@menu-studio/i18n";
import { MenuRenderer } from "@menu-studio/renderer";
import { allItems, buildDefaultSpec, buildQrSpec, type MenuDocument, type PublishedMenuDto, type QrThemeMode } from "@menu-studio/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { IconArrowLeft, IconCopy, IconDownload, IconExternal } from "../../components/icons.tsx";
import { MenuPreview } from "../../components/MenuPreview.tsx";
import { toast } from "../../components/toast.tsx";
import { Badge, Button, Card, cx, ErrorNotice, Field, Input, Notice, PageHeader, Segmented, Spinner, Switch } from "../../components/ui.tsx";
import { api, ApiError } from "../../lib/api.ts";
import { keys, useAnalytics, useProject, usePublished } from "../../lib/queries.ts";

export function useQrSvg(url: string | null, colors: { dark: string; light: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    void QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 1, color: colors }).then(setSvg);
  }, [url, colors.dark, colors.light]); // eslint-disable-line react-hooks/exhaustive-deps
  return svg ? `data:image/svg+xml;base64,${btoa(svg)}` : null;
}

async function downloadQrPng(url: string, colors: { dark: string; light: string }, logoUrl: string | null, filename: string) {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, url, { errorCorrectionLevel: "H", margin: 2, width: 1200, color: colors });
  if (logoUrl) {
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = logoUrl;
    await img.decode().catch(() => undefined);
    if (ctx && img.naturalWidth) {
      const size = canvas.width * 0.22;
      const x = (canvas.width - size) / 2;
      ctx.fillStyle = colors.light;
      ctx.fillRect(x - 16, x - 16, size + 32, size + 32);
      ctx.drawImage(img, x, x, size, size);
    }
  }
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}

function Analytics({ published }: { published: PublishedMenuDto }) {
  const analytics = useAnalytics(published.id);
  if (analytics.isLoading) return <Spinner />;
  const data = analytics.data;
  if (!data) return null;
  const total = data.days.reduce((n, d) => n + d.views, 0);
  const max = Math.max(1, ...data.days.map((d) => d.views));
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="display text-[36px]">{total}</span>
        <span className="text-[13px] text-muted">views in 30 days</span>
      </div>
      <div className="mt-3 flex h-16 items-end gap-[3px]" aria-label="Views per day">
        {data.days.map((d) => (
          <div key={d.date} title={`${d.date}: ${d.views}`} className="flex-1 rounded-t-sm bg-ink/70" style={{ height: `${Math.max(4, (d.views / max) * 100)}%` }} />
        ))}
        {!data.days.length ? <span className="text-[12.5px] text-muted">No views yet.</span> : null}
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <div>
          <div className="eyebrow mb-2">Languages</div>
          {data.languages.map((l) => (
            <div key={l.lang} className="flex justify-between text-[13px]">
              <span>{l.lang === "default" ? "Default" : languageName(l.lang)}</span>
              <span className="tabular-nums text-muted">{l.views}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="eyebrow mb-2">Devices</div>
          {data.devices.map((d) => (
            <div key={d.device} className="flex justify-between text-[13px] capitalize">
              <span>{d.device}</span>
              <span className="tabular-nums text-muted">{d.views}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="eyebrow mb-2">Most opened</div>
          {data.topItems.map((i) => (
            <div key={i.itemId} className="flex justify-between gap-2 text-[13px]">
              <span className="truncate">{i.name}</span>
              <span className="tabular-nums text-muted">{i.opens}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 text-[11.5px] text-faint">Anonymous counts only. No cookies, no personal data.</p>
    </div>
  );
}

function tentDocument(document: MenuDocument): MenuDocument {
  const picks = allItems(document).filter((i) => i.isSignature || i.featured).slice(0, 6);
  const ids = new Set((picks.length ? picks : allItems(document).slice(0, 5)).map((i) => i.id));
  return { ...document, sections: document.sections.map((s) => ({ ...s, items: s.items.filter((i) => ids.has(i.id)) })).filter((s) => s.items.length) };
}

export function Publish() {
  const { projectId = "" } = useParams();
  const project = useProject(projectId);
  const published = usePublished(projectId);
  const queryClient = useQueryClient();
  const head = project.data?.head;
  const current = published.data?.find((p) => p.slug === "main") ?? published.data?.[0];
  const [slug, setSlug] = useState("main");
  const [themeMode, setThemeMode] = useState<QrThemeMode>("mobile_optimized");
  const [languages, setLanguages] = useState<string[]>([]);
  const [qrOnBrand, setQrOnBrand] = useState(true);

  // Fill the form from what is already published, once.
  const [hydrated, setHydrated] = useState(false);
  if (!hydrated && (current || head)) {
    setHydrated(true);
    if (current) {
      setSlug(current.slug);
      setThemeMode(current.themeMode);
      setLanguages(current.languages);
    } else if (head) setLanguages([head.document.primaryLanguage, ...head.document.additionalLanguages]);
  }

  const publish = useMutation({
    mutationFn: () => api<PublishedMenuDto>(`/projects/${projectId}/publish`, { method: "POST", body: { versionId: head?.id, slug, languages, themeMode, isLive: true } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.published(projectId) });
      toast("Publishing. Your menu will be live in a few seconds.", { tone: "ok" });
    },
  });
  const toggleLive = useMutation({
    mutationFn: (isLive: boolean) => api(`/published/${current?.id}`, { method: "PATCH", body: { isLive } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.published(projectId) }),
  });

  const qrSpec = useMemo(() => (head ? buildQrSpec(head.document, head.spec, themeMode) : null), [head, themeMode]);
  const palette = head?.spec ? PALETTES[head.spec.tokens.paletteId] : null;
  const brandColors = palette ? { dark: palette.dark ? palette.colors.background : palette.colors.text, light: palette.dark ? palette.colors.text : palette.colors.background } : null;
  const colors = qrOnBrand && brandColors && contrastRatio(brandColors.dark, brandColors.light) >= 7 ? brandColors : { dark: "#111111", light: "#FFFFFF" };
  const qr = useQrSvg(current?.url ?? null, colors);
  const tentSpec = useMemo(
    () => (head?.spec ? buildDefaultSpec({ archetype: "poster", document: tentDocument(head.document), format: "TABLE_TENT", orientation: "portrait", tokens: { ...head.spec.tokens, density: "balanced" } }) : null),
    [head],
  );

  if (project.isLoading) return <div className="flex justify-center py-24 text-muted"><Spinner /></div>;
  if (!head || !qrSpec) return <ErrorNotice error={project.error ?? new Error("Nothing to publish yet.")} />;

  const available = [head.document.primaryLanguage, ...head.document.additionalLanguages];

  return (
    <div className="animate-fade-up">
      <Link to={`/projects/${projectId}/editor`} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <IconArrowLeft size={14} /> Back to editor
      </Link>
      <PageHeader eyebrow={project.data?.venue.name} title="QR menu" description="A fast, phone-friendly menu that updates the moment you change a price. It uses the same content as your printed menu." />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-6">
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="eyebrow">Status</div>
                {current ? (
                  <div className="mt-2 flex items-center gap-3">
                    <Badge tone={current.isLive ? "ok" : "neutral"}>{current.isLive ? "Live" : "Offline"}</Badge>
                    <a href={current.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-[13px] text-ink underline underline-offset-4">
                      {current.url.replace(/^https?:\/\//, "")} <IconExternal size={12} />
                    </a>
                    <button aria-label="Copy link" className="rounded p-1 text-muted hover:bg-paper-2" onClick={() => void navigator.clipboard.writeText(current.url).then(() => toast("Link copied."))}>
                      <IconCopy size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 text-[14px] text-muted">Not published yet.</div>
                )}
                {current && current.versionId !== head.id ? <Notice tone="warn" className="mt-3">The live menu shows an older version. Publish again to update it.</Notice> : null}
              </div>
              {current ? (
                <label className="flex items-center gap-2 text-[13px]">
                  <Switch checked={current.isLive} onChange={(v) => toggleLive.mutate(v)} label="Menu is live" /> Live
                </label>
              ) : null}
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Address" hint={`${project.data?.venue.slug}${slug === "main" ? "" : `/${slug}`}`}>
                <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
              </Field>
              <Field label="Style">
                <Segmented value={themeMode} onChange={setThemeMode} options={[{ value: "mobile_optimized", label: "Optimised for phones" }, { value: "match_print", label: "Match print" }]} />
              </Field>
            </div>
            <div className="mt-5">
              <div className="text-[12.5px] font-medium text-ink-2">Languages</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {available.map((l) => {
                  const active = languages.includes(l);
                  return (
                    <button key={l} onClick={() => setLanguages(active ? languages.filter((x) => x !== l) : [...languages, l])} className={cx("rounded-full border px-3 py-1 text-[12.5px]", active ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-2")}>
                      {languageName(l, true)}
                    </button>
                  );
                })}
                <Link to={`/projects/${projectId}/editor`} className="self-center text-[12.5px] text-muted underline underline-offset-4">
                  Add translations in the editor
                </Link>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" loading={publish.isPending} onClick={() => publish.mutate()}>
                {current ? "Publish latest version" : "Publish QR menu"}
              </Button>
              <Link to={`/projects/${projectId}/quick-edit`}>
                <Button variant="ghost">Quick edit prices</Button>
              </Link>
            </div>
            {publish.error ? (
              <div className="mt-4">
                <ErrorNotice error={publish.error} />
                {publish.error instanceof ApiError && publish.error.upgradeTo ? (
                  <Link to="/billing" className="mt-2 inline-block text-[13px] font-medium underline underline-offset-4">
                    See plans
                  </Link>
                ) : null}
              </div>
            ) : null}
          </Card>

          {current ? (
            <Card className="p-6">
              <h2 className="display text-[26px]">QR code</h2>
              <div className="mt-4 flex flex-wrap items-center gap-6">
                {qr ? <img src={qr} alt={`QR code for ${current.url}`} className="h-44 w-44 rounded-md border border-line" /> : <Spinner />}
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 text-[13px]">
                    <Switch checked={qrOnBrand} onChange={setQrOnBrand} label="Use menu colours" /> Use menu colours
                  </label>
                  {qrOnBrand && colors.dark === "#111111" ? <p className="max-w-60 text-[12px] text-muted">Your palette is too low-contrast for reliable scanning, so black and white is used.</p> : null}
                  <div className="flex gap-2">
                    <Button size="sm" icon={<IconDownload size={13} />} onClick={() => void downloadQrPng(current.url, colors, project.data?.venue.logoUrl ?? null, `${project.data?.venue.slug}-qr.png`)}>
                      PNG
                    </Button>
                    {qr ? (
                      <a href={qr} download={`${project.data?.venue.slug}-qr.svg`}>
                        <Button size="sm" icon={<IconDownload size={13} />}>
                          SVG
                        </Button>
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          {current && tentSpec && qr ? (
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="display text-[26px]">Table tent</h2>
                  <p className="mt-1 text-[13px] text-muted">A5 folded in half, with your signature items and the QR code. Print at 100%.</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    sessionStorage.setItem("menu-studio.tent", JSON.stringify({ document: tentDocument(head.document), spec: tentSpec, qr }));
                    window.open("/print-tent", "_blank");
                  }}
                >
                  Print
                </Button>
              </div>
              <div className="mt-4 flex justify-center rounded-md bg-canvas p-5">
                <div className="relative">
                  <MenuPreview document={tentDocument(head.document)} spec={tentSpec} width={220} className="shadow-soft" />
                </div>
              </div>
            </Card>
          ) : null}

          {current ? (
            <Card className="p-6">
              <h2 className="display mb-4 text-[26px]">Visitors</h2>
              <Analytics published={current} />
            </Card>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="mx-auto w-[340px] rounded-[44px] border border-line-strong bg-ink p-3 shadow-float">
            <div className="scroll-quiet h-[640px] overflow-y-auto rounded-[34px] bg-card">
              <div style={{ zoom: 316 / 390 }}>
                <MenuRenderer document={head.document} spec={qrSpec} mode="qr" now={new Date().toISOString()} timezone={project.data?.venue.timezone ?? "UTC"} logoUrl={project.data?.venue.logoUrl ?? null} {...(languages[0] && languages[0] !== head.document.primaryLanguage ? { lang: languages[0] } : {})} />
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[12px] text-muted">Preview. 86'd items and sections outside their hours are hidden for guests.</p>
        </aside>
      </div>
    </div>
  );
}
