import type { ExtractResponse, ProjectDetailDto, UploadDto } from "@menu-studio/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { IconCamera, IconFile, IconText, IconUpload, IconX } from "../../components/icons.tsx";
import { Button, Card, cx, ErrorNotice, Field, Input, PageHeader, ProgressSteps, Tab, TabList, TabPanel, Tabs, Textarea, useElapsed } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { keys, useMe, useSeeds } from "../../lib/queries.ts";

const EXTRACT_STEPS = ["Uploading your menu", "Reading every section", "Matching prices and variants", "Checking dietary marks", "Tidying up the details"];

export function NewProject() {
  const { venueId = "" } = useParams();
  const me = useMe();
  const venue = me.data?.venues.find((v) => v.id === venueId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("Main menu");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [tab, setTab] = useState("upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const seeds = useSeeds();

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 10);
    setFiles(next);
  };

  const importMenu = useMutation({
    mutationFn: async (source: "upload" | "text") => {
      const created = await api<ProjectDetailDto>("/projects", { method: "POST", body: { venueId, name, start: { kind: "import" } } });
      const projectId = created.project.id;
      const uploadIds: string[] = [];
      if (source === "upload") {
        for (const file of files) {
          const form = new FormData();
          form.set("file", file);
          form.set("orgId", created.org.id);
          form.set("projectId", projectId);
          form.set("kind", "menu_source");
          const upload = await api<UploadDto>("/uploads", { method: "POST", form });
          uploadIds.push(upload.id);
        }
      }
      try {
        const result = await api<ExtractResponse>("/extract", { method: "POST", body: source === "upload" ? { projectId, uploadIds } : { projectId, text } });
        sessionStorage.setItem(`menu-studio.warnings.${projectId}`, JSON.stringify(result.warnings));
      } catch (error) {
        // Keep the project so the owner can retry from the review screen.
        sessionStorage.setItem(`menu-studio.retry.${projectId}`, JSON.stringify({ uploadIds, text: source === "text" ? text : null }));
        throw Object.assign(error as Error, { projectId });
      }
      return projectId;
    },
    onSuccess: async (projectId) => {
      await queryClient.invalidateQueries({ queryKey: keys.projects() });
      void navigate(`/projects/${projectId}/review`);
    },
  });

  const startFrom = useMutation({
    mutationFn: (start: { kind: "seed"; seedId: string } | { kind: "blank" }) => api<ProjectDetailDto>("/projects", { method: "POST", body: { venueId, name, start } }),
    onSuccess: async (detail) => {
      await queryClient.invalidateQueries({ queryKey: keys.projects() });
      void navigate(`/projects/${detail.project.id}/editor`);
    },
  });

  const elapsed = useElapsed(importMenu.isPending);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  };

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow={venue?.name} title="Start a menu" description="Bring the menu you already have. We'll read every item and price, then you check the details before designing." />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <Tabs value={tab} onValueChange={setTab}>
            <TabList className="px-5">
              <Tab value="upload">
                <IconUpload size={14} /> Photo or PDF
              </Tab>
              <Tab value="text">
                <IconText size={14} /> Paste text
              </Tab>
              <Tab value="samples">Sample menus</Tab>
            </TabList>
            <TabPanel value="upload" className="p-5">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-paper px-6 py-14 text-center"
              >
                <div className="display text-[26px]">Drop your menu here</div>
                <p className="mt-2 max-w-sm text-[13.5px] text-muted">Photos of each page (JPEG, PNG) or one PDF up to 10 pages and 20 MB.</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <Button onClick={() => inputRef.current?.click()} icon={<IconFile size={15} />}>
                    Choose files
                  </Button>
                  <Button className="sm:hidden" onClick={() => cameraRef.current?.click()} icon={<IconCamera size={15} />}>
                    Take a photo
                  </Button>
                </div>
                <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFiles(e.target.files)} />
              </div>
              {files.length ? (
                <ul className="mt-4 divide-y divide-line rounded-md border border-line">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between px-3 py-2 text-[13px]">
                      <span className="truncate">
                        {i + 1}. {f.name} <span className="text-muted">· {(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      </span>
                      <button aria-label={`Remove ${f.name}`} className="rounded p-1 text-muted hover:bg-paper-2" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                        <IconX size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <Button variant="primary" size="lg" disabled={!files.length} loading={importMenu.isPending} onClick={() => importMenu.mutate("upload")}>
                  Read my menu
                </Button>
                {importMenu.isPending ? <ProgressSteps steps={EXTRACT_STEPS} elapsed={elapsed} /> : null}
              </div>
            </TabPanel>
            <TabPanel value="text" className="p-5">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-72 font-mono text-[12.5px]" placeholder={"STARTERS\nPaneer Tikka  ₹380\nCottage cheese marinated in hung curd…"} />
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <Button variant="primary" size="lg" disabled={text.trim().length < 5} loading={importMenu.isPending} onClick={() => importMenu.mutate("text")}>
                  Read my menu
                </Button>
                {importMenu.isPending ? <ProgressSteps steps={EXTRACT_STEPS.slice(1)} elapsed={elapsed} /> : null}
              </div>
            </TabPanel>
            <TabPanel value="samples" className="p-5">
              <p className="mb-4 text-[13.5px] text-muted">Explore the editor with a finished sample menu. You can replace the content later.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {seeds.data?.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => startFrom.mutate({ kind: "seed", seedId: s.id })}
                    disabled={startFrom.isPending}
                    className={cx("rounded-md border border-line bg-paper p-4 text-left transition-colors hover:border-ink-2", startFrom.isPending && "opacity-60")}
                  >
                    <div className="display text-[22px]">{s.venueName}</div>
                    <div className="mt-1 text-[12.5px] text-muted">
                      {s.label} · {s.city} · {s.currency}
                    </div>
                  </button>
                ))}
              </div>
            </TabPanel>
          </Tabs>
          {importMenu.error ? <ErrorNotice className="mx-5 mb-5" error={importMenu.error} onRetry={() => importMenu.mutate(tab === "text" ? "text" : "upload")} /> : null}
          {startFrom.error ? <ErrorNotice className="mx-5 mb-5" error={startFrom.error} /> : null}
        </Card>
        <aside className="flex flex-col gap-5">
          <Field label="Menu name" hint="For you only, for example Dinner or Cocktails.">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Card className="p-5 text-[13px] leading-relaxed text-muted">
            <div className="mb-2 font-medium text-ink">What happens next</div>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>We read your menu exactly as written. Nothing is invented.</li>
              <li>You check prices and anything we guessed, like dietary tags.</li>
              <li>You answer a short brief and pick one of three designs.</li>
            </ol>
            <button className="mt-4 text-ink underline underline-offset-4" onClick={() => startFrom.mutate({ kind: "blank" })}>
              Or start from a blank menu
            </button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
