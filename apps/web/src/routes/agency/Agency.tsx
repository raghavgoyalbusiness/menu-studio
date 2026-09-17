import { COUNTRIES } from "@menu-studio/i18n";
import { VENUE_TYPES, type ExportKind, type ProjectDto, type PublishedMenuDto, type VenueDto } from "@menu-studio/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { useCurrentOrg } from "../../components/AppShell.tsx";
import { IconCopy } from "../../components/icons.tsx";
import { toast } from "../../components/toast.tsx";
import { Badge, Button, Card, Dialog, EmptyState, ErrorNotice, Field, Input, Notice, PageHeader, Select, Spinner } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { keys } from "../../lib/queries.ts";

interface Client {
  venue: VenueDto;
  projects: ProjectDto[];
  published: PublishedMenuDto[];
}

export function Agency() {
  const { org } = useCurrentOrg();
  const queryClient = useQueryClient();
  const clients = useQuery({ queryKey: keys.agency(org?.id ?? ""), queryFn: () => api<Client[]>(`/agency/${org?.id}/clients`), enabled: org?.type === "agency" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<ExportKind>("print_pack");
  const [addOpen, setAddOpen] = useState(false);
  const [newVenue, setNewVenue] = useState({ name: "", venueType: "restaurant", city: "", country: org?.country ?? "GB" });
  const [whiteLabel, setWhiteLabel] = useState(org?.whiteLabel ?? {});
  const [handoff, setHandoff] = useState<{ venueId: string; email: string; url: string | null } | null>(null);

  const bulk = useMutation({
    mutationFn: () => api<{ queued: number }>(`/agency/${org?.id}/bulk-export`, { method: "POST", body: { venueIds: [...selected], kind } }),
    onSuccess: (r) => toast(`Queued exports for ${r.queued} venues. Files appear in each menu's export list.`, { tone: "ok" }),
  });
  const addVenue = useMutation({
    mutationFn: () => api<VenueDto>("/venues", { method: "POST", body: { orgId: org?.id, ...newVenue, city: newVenue.city || null } }),
    onSuccess: () => {
      setAddOpen(false);
      void queryClient.invalidateQueries({ queryKey: keys.agency(org?.id ?? "") });
      void queryClient.invalidateQueries({ queryKey: keys.me });
    },
  });
  const saveWhiteLabel = useMutation({
    mutationFn: () => api(`/orgs/${org?.id}`, { method: "PATCH", body: { whiteLabel } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.me });
      toast("White-label settings saved.");
    },
  });
  const createHandoff = useMutation({
    mutationFn: () => api<{ inviteUrl: string }>(`/agency/${org?.id}/handoff`, { method: "POST", body: { venueId: handoff?.venueId, email: handoff?.email } }),
    onSuccess: (r) => setHandoff((h) => (h ? { ...h, url: r.inviteUrl } : h)),
  });

  if (!org) return null;
  if (org.type !== "agency") return <EmptyState title="Agency tools" description="Client management, white-label and bulk export are for agency accounts." />;

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow={org.name} title="Clients" description="Every client venue, its menus and what's live." actions={<Button variant="primary" onClick={() => setAddOpen(true)}>Add client venue</Button>} />
      {clients.isLoading ? <div className="flex justify-center py-12 text-muted"><Spinner /></div> : null}
      {clients.error ? <ErrorNotice error={clients.error} onRetry={() => void clients.refetch()} /> : null}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="divide-y divide-line">
          {clients.data?.map((c) => (
            <div key={c.venue.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <input
                type="checkbox"
                aria-label={`Select ${c.venue.name}`}
                checked={selected.has(c.venue.id)}
                onChange={(e) =>
                  setSelected((s) => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(c.venue.id);
                    else next.delete(c.venue.id);
                    return next;
                  })
                }
              />
              <div className="min-w-0 flex-1">
                <div className="display text-[22px]">{c.venue.name}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-[12.5px] text-muted">
                  {c.projects.map((p) => (
                    <Link key={p.id} to={`/projects/${p.id}/editor`} className="underline underline-offset-4 hover:text-ink">
                      {p.name}
                    </Link>
                  ))}
                  {!c.projects.length ? <Link to={`/venues/${c.venue.id}/new`} className="underline underline-offset-4">Start a menu</Link> : null}
                </div>
              </div>
              {c.published.some((p) => p.isLive) ? <Badge tone="ok">Live</Badge> : <Badge>Not live</Badge>}
              <Button size="sm" variant="ghost" onClick={() => setHandoff({ venueId: c.venue.id, email: "", url: null })}>
                Hand off
              </Button>
            </div>
          ))}
          {clients.data && !clients.data.length ? <div className="px-5 py-10 text-center text-[13.5px] text-muted">No client venues yet.</div> : null}
        </Card>
        <aside className="flex flex-col gap-6">
          <Card className="p-5">
            <div className="eyebrow mb-3">Bulk export</div>
            <Select value={kind} onChange={(e) => setKind(e.target.value as ExportKind)}>
              <option value="print_pack">Print packs</option>
              <option value="pdf">PDFs with bleed</option>
              <option value="pdf_crop_marks">PDFs with crop marks</option>
              <option value="png">PNGs</option>
            </Select>
            <Button variant="primary" className="mt-3 w-full" disabled={!selected.size} loading={bulk.isPending} onClick={() => bulk.mutate()}>
              Export {selected.size} venue{selected.size === 1 ? "" : "s"}
            </Button>
            {bulk.error ? <ErrorNotice className="mt-3" error={bulk.error} /> : null}
          </Card>
          <Card className="p-5">
            <div className="eyebrow mb-3">White-label</div>
            <div className="flex flex-col gap-3">
              <Field label="Brand name" hint="Shown in the app header and export README.">
                <Input value={whiteLabel.brandName ?? ""} onChange={(e) => setWhiteLabel({ ...whiteLabel, brandName: e.target.value })} />
              </Field>
              <Field label="Logo URL">
                <Input value={whiteLabel.logoUrl ?? ""} onChange={(e) => setWhiteLabel({ ...whiteLabel, logoUrl: e.target.value })} />
              </Field>
              <Field label="QR subdomain" hint="Requires DNS setup by Menu Studio.">
                <Input value={whiteLabel.qrSubdomain ?? ""} onChange={(e) => setWhiteLabel({ ...whiteLabel, qrSubdomain: e.target.value.toLowerCase() })} />
              </Field>
              <Button onClick={() => saveWhiteLabel.mutate()} loading={saveWhiteLabel.isPending}>
                Save
              </Button>
              {saveWhiteLabel.error ? <ErrorNotice error={saveWhiteLabel.error} /> : null}
            </div>
          </Card>
        </aside>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen} title="Add a client venue">
        <div className="flex flex-col gap-4">
          <Field label="Venue name">
            <Input value={newVenue.name} onChange={(e) => setNewVenue({ ...newVenue, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={newVenue.venueType} onChange={(e) => setNewVenue({ ...newVenue, venueType: e.target.value })}>
                {VENUE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Country">
              <Select value={newVenue.country} onChange={(e) => setNewVenue({ ...newVenue, country: e.target.value })}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="City">
            <Input value={newVenue.city} onChange={(e) => setNewVenue({ ...newVenue, city: e.target.value })} />
          </Field>
          <Button variant="primary" loading={addVenue.isPending} disabled={!newVenue.name.trim()} onClick={() => addVenue.mutate()}>
            Add venue
          </Button>
          {addVenue.error ? <ErrorNotice error={addVenue.error} /> : null}
        </div>
      </Dialog>

      <Dialog open={Boolean(handoff)} onOpenChange={(o) => !o && setHandoff(null)} title="Hand off to the client" description="The client accepts in their own account and the venue, its menus and history move to them.">
        {handoff?.url ? (
          <Notice>
            Send this link to {handoff.email}:
            <div className="mt-2 flex items-center gap-2">
              <code className="truncate text-[12px]">{handoff.url}</code>
              <button aria-label="Copy handoff link" onClick={() => handoff.url && void navigator.clipboard.writeText(handoff.url).then(() => toast("Link copied."))}>
                <IconCopy size={14} />
              </button>
            </div>
          </Notice>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="Client email">
              <Input type="email" value={handoff?.email ?? ""} onChange={(e) => setHandoff((h) => (h ? { ...h, email: e.target.value } : h))} />
            </Field>
            <Button variant="primary" loading={createHandoff.isPending} disabled={!handoff?.email.includes("@")} onClick={() => createHandoff.mutate()}>
              Create handoff link
            </Button>
            {createHandoff.error ? <ErrorNotice error={createHandoff.error} /> : null}
          </div>
        )}
      </Dialog>
    </div>
  );
}
