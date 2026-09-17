import type { ExportDto, ProjectDto, VenueDto } from "@menu-studio/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useCurrentOrg } from "../../components/AppShell.tsx";
import { IconArrowRight, IconPlus, IconQr } from "../../components/icons.tsx";
import { Badge, Button, Card, EmptyState, ErrorNotice, PageHeader, Spinner } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { useMe, useProjects, useUsage } from "../../lib/queries.ts";

function timeAgo(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function nextStepPath(project: ProjectDto): string {
  return project.currentVersionId ? `/projects/${project.id}/editor` : `/projects/${project.id}/review`;
}

function ProjectRow({ project }: { project: ProjectDto }) {
  return (
    <Link to={nextStepPath(project)} className="group flex items-center justify-between gap-4 rounded-md px-4 py-3.5 transition-colors hover:bg-paper-2">
      <div className="min-w-0">
        <div className="truncate text-[14.5px] font-medium text-ink">{project.name}</div>
        <div className="mt-0.5 text-[12.5px] text-muted">Edited {timeAgo(project.updatedAt)}</div>
      </div>
      <div className="flex items-center gap-3">
        {project.status === "published" ? (
          <Badge tone="ok">
            <IconQr size={12} /> Live
          </Badge>
        ) : project.status === "archived" ? (
          <Badge>Archived</Badge>
        ) : (
          <Badge>Draft</Badge>
        )}
        <IconArrowRight size={16} className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>
    </Link>
  );
}

function VenueCard({ venue }: { venue: VenueDto }) {
  const projects = useProjects(venue.id);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <div className="display text-[26px] leading-tight">{venue.name}</div>
          <div className="mt-1 text-[12.5px] text-muted">
            {[venue.city, venue.currency, venue.timezone].filter(Boolean).join(" · ")} · <span className="font-mono text-[11.5px]">/{venue.slug}</span>
          </div>
        </div>
        <Link to={`/venues/${venue.id}/new`}>
          <Button size="sm" icon={<IconPlus size={14} />}>
            New menu
          </Button>
        </Link>
      </div>
      <div className="p-1.5">
        {projects.isLoading ? (
          <div className="flex justify-center py-6 text-muted">
            <Spinner />
          </div>
        ) : projects.error ? (
          <ErrorNotice className="m-3" error={projects.error} onRetry={() => void projects.refetch()} />
        ) : projects.data?.length ? (
          projects.data.map((p) => <ProjectRow key={p.id} project={p} />)
        ) : (
          <div className="px-4 py-6 text-[13.5px] text-muted">No menus yet. Upload your current menu to start.</div>
        )}
      </div>
    </Card>
  );
}

export function Dashboard() {
  const me = useMe();
  const { org } = useCurrentOrg();
  const usage = useUsage(org?.id);
  const venues = (me.data?.venues ?? []).filter((v) => v.orgId === org?.id);
  const recent = useQuery({ queryKey: ["recent-exports", org?.id], queryFn: async () => {
    const projects = await api<ProjectDto[]>("/projects");
    const lists = await Promise.all(projects.slice(0, 6).map((p) => api<ExportDto[]>(`/projects/${p.id}/exports`).then((rows) => rows.map((r) => ({ ...r, projectName: p.name })))));
    return lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  }, enabled: Boolean(org) });

  if (me.isLoading) return null;
  const firstName = me.data?.user.email?.split("@")[0] ?? "";

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={org?.name}
        title={venues.length ? "Your menus" : `Welcome${firstName ? `, ${firstName}` : ""}`}
        description={venues.length ? "Pick up where you left off, or start a new menu from a photo, a PDF or pasted text." : "Add a venue to begin."}
        actions={
          org?.role === "owner" ? (
            <Link to={org.type === "agency" ? "/agency" : "/onboarding?new=1"}>
              <Button variant="ghost" size="sm">
                {org.type === "agency" ? "Manage clients" : "New organization"}
              </Button>
            </Link>
          ) : null
        }
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          {venues.length ? venues.map((v) => <VenueCard key={v.id} venue={v} />) : <EmptyState title="No venues yet" description="Create a venue to start designing its menu." action={<Link to="/onboarding"><Button variant="primary">Add a venue</Button></Link>} />}
        </div>
        <aside className="flex flex-col gap-6">
          {usage.data ? (
            <Card className="p-5">
              <div className="eyebrow">Plan</div>
              <div className="display mt-1 text-[28px] capitalize">{usage.data.plan.replace(/_/g, " ")}</div>
              <dl className="mt-4 space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-muted">AI edits this month</dt>
                  <dd className="tabular-nums">{usage.data.aiEditsThisMonth}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Clean export credits</dt>
                  <dd className="tabular-nums">{usage.data.exportCredits}</dd>
                </div>
              </dl>
              <Link to="/billing" className="mt-4 inline-block text-[13px] font-medium text-ink underline underline-offset-4">
                Plans and billing
              </Link>
            </Card>
          ) : null}
          <Card className="p-5">
            <div className="eyebrow">Recent exports</div>
            {recent.data?.length ? (
              <ul className="mt-3 space-y-3">
                {recent.data.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="truncate">
                      {e.projectName} <span className="text-muted">· {e.kind.replace(/_/g, " ")}</span>
                    </span>
                    <Badge tone={e.status === "done" ? "ok" : e.status === "failed" ? "danger" : "neutral"}>{e.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[13px] text-muted">Print-ready PDFs you export will appear here.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
