import { AutoFitRunner, type AutoFitResult } from "@menu-studio/renderer";
import { ARCHETYPES, type ConceptDto, type ConceptsResponse, type VersionDto } from "@menu-studio/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Wordmark } from "../../components/AppShell.tsx";
import { IconArrowLeft, IconRefresh, IconSparkle } from "../../components/icons.tsx";
import { MenuPreview } from "../../components/MenuPreview.tsx";
import { Badge, Button, ErrorNotice, ProgressSteps, useElapsed } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { keys, useConcepts, useProject } from "../../lib/queries.ts";

const STEPS = ["Reading your menu and brief", "Choosing layouts that suit your content", "Pairing typography and colour", "Placing every section", "Checking the concepts differ", "Measuring fit on the page"];

function ConceptCard({ concept, projectId, index, onUse, onMore, busy }: { concept: ConceptDto; projectId: string; index: number; onUse: () => void; onMore: () => void; busy: boolean }) {
  const project = useProject(projectId);
  const queryClient = useQueryClient();
  const [fitted, setFitted] = useState<ConceptDto>(concept);
  const width = 360;
  const head = project.data?.head;

  // Follow a regenerated concept without an effect round-trip.
  const [shownId, setShownId] = useState(concept.id);
  if (shownId !== concept.id) {
    setShownId(concept.id);
    setFitted(concept);
  }

  const onFit = useCallback(
    (result: AutoFitResult) => {
      setFitted((c) => ({ ...c, spec: result.spec, fitReport: result.report }));
      void api(`/projects/${projectId}/concepts/${concept.id}/fit`, { method: "POST", body: { spec: result.spec, report: result.report } })
        .then(() => queryClient.invalidateQueries({ queryKey: keys.concepts(projectId) }))
        .catch(() => undefined);
    },
    [concept.id, projectId, queryClient],
  );

  if (!head) return null;
  const report = fitted.fitReport;

  return (
    <article className="animate-fade-up flex w-[360px] shrink-0 snap-center flex-col" style={{ animationDelay: `${index * 90}ms` }}>
      <div className="relative flex justify-center rounded-lg bg-canvas p-6">
        <MenuPreview document={head.document} spec={fitted.spec} width={width - 48} className="shadow-float" />
        {!report ? <AutoFitRunner document={head.document} spec={concept.spec} pageCountPreference={head.brief?.pageCountPreference ?? "fit_content"} onDone={onFit} /> : null}
      </div>
      <div className="mt-5 px-1">
        <div className="flex items-center gap-2">
          <Badge>{ARCHETYPES[fitted.spec.archetype].label}</Badge>
          {fitted.spec.pages.length > 1 ? <Badge>{fitted.spec.pages.length} pages</Badge> : null}
          {report && !report.fits ? <Badge tone="warn">Tight fit</Badge> : null}
        </div>
        <h2 className="display mt-3 text-[30px] leading-tight">{fitted.spec.conceptName}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{fitted.spec.rationale}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={onUse} disabled={busy}>
            Use this
          </Button>
          <Button variant="ghost" onClick={onMore} disabled={busy} icon={<IconSparkle size={14} />}>
            More like this
          </Button>
        </div>
      </div>
    </article>
  );
}

export function Concepts() {
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const project = useProject(projectId);
  const concepts = useConcepts(projectId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const started = useRef(false);

  const generate = useMutation({
    mutationFn: (referenceConceptId?: string) => api<ConceptsResponse>("/concepts", { method: "POST", body: { projectId, ...(referenceConceptId ? { referenceConceptId } : {}) } }),
    onSuccess: (result) => {
      queryClient.setQueryData(keys.concepts(projectId), result.concepts);
      setParams({}, { replace: true });
    },
  });

  const select = useMutation({
    mutationFn: async (concept: ConceptDto) => {
      const head = project.data?.head;
      if (!head) throw new Error("No menu");
      return api<VersionDto>(`/projects/${projectId}/concepts/${concept.id}/select`, { method: "POST", body: { baseVersionId: head.id } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.project(projectId) });
      void navigate(`/projects/${projectId}/editor`);
    },
  });

  useEffect(() => {
    if (started.current || concepts.isLoading) return;
    if (params.get("generate") === "1" || (concepts.data && concepts.data.length === 0)) {
      started.current = true;
      generate.mutate(undefined);
    }
  }, [concepts.isLoading, concepts.data, params, generate]);

  const elapsed = useElapsed(generate.isPending);
  const list = generate.isPending ? [] : (concepts.data ?? []);

  return (
    <div className="min-h-full">
      <header className="flex h-14 items-center justify-between border-b border-line px-5">
        <div className="flex items-center gap-4">
          <Wordmark />
          <span className="h-5 w-px bg-line" />
          <Link to={`/projects/${projectId}/brief`} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
            <IconArrowLeft size={14} /> Brief
          </Link>
        </div>
        <Button size="sm" icon={<IconRefresh size={14} />} onClick={() => generate.mutate(undefined)} loading={generate.isPending}>
          Regenerate all
        </Button>
      </header>
      <div className="mx-auto max-w-[1240px] px-5 pt-12 pb-20">
        <div className="max-w-2xl">
          <div className="eyebrow">{project.data?.venue.name}</div>
          <h1 className="display mt-2 text-[46px]">Three directions</h1>
          <p className="mt-3 text-[15px] text-muted">Each concept uses your real menu. Choose one to refine in the editor; you can change fonts, colours and layout there.</p>
        </div>
        {generate.isPending ? (
          <div className="mt-10">
            <ProgressSteps steps={STEPS} elapsed={elapsed} />
            <div className="mt-6 flex snap-x gap-8 overflow-x-auto pb-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-[360px] shrink-0">
                  <div className="skeleton h-[450px] rounded-lg" />
                  <div className="skeleton mt-5 h-7 w-2/3 rounded" />
                  <div className="skeleton mt-3 h-4 w-full rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {generate.error ? <ErrorNotice className="mt-8" error={generate.error} onRetry={() => generate.mutate(undefined)} /> : null}
        {select.error ? <ErrorNotice className="mt-8" error={select.error} /> : null}
        {list.length ? (
          <div className="mt-10 flex snap-x snap-mandatory gap-8 overflow-x-auto pb-6 lg:justify-between">
            {list.map((c, i) => (
              <ConceptCard key={c.id} concept={c} projectId={projectId} index={i} busy={select.isPending || generate.isPending} onUse={() => select.mutate(c)} onMore={() => generate.mutate(c.id)} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
