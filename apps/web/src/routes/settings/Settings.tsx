import { isValidTimeZone } from "@menu-studio/i18n";
import type { MemberRole, VenueDto } from "@menu-studio/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useCurrentOrg } from "../../components/AppShell.tsx";
import { IconCopy, IconUpload } from "../../components/icons.tsx";
import { toast } from "../../components/toast.tsx";
import { Badge, Button, Card, Dialog, ErrorNotice, Field, Input, Notice, PageHeader, Select } from "../../components/ui.tsx";
import { api, API_URL } from "../../lib/api.ts";
import { keys, useMe, useMembers } from "../../lib/queries.ts";
import { getAccessToken, signOut } from "../../lib/session.ts";

function VenueSettings({ venue, canEdit }: { venue: VenueDto; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(venue.name);
  const [timezone, setTimezone] = useState(venue.timezone);
  const logoRef = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: () => api(`/venues/${venue.id}`, { method: "PATCH", body: { name, timezone } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.me });
      toast("Venue saved.");
    },
  });
  const logo = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return api(`/venues/${venue.id}/logo`, { method: "POST", form });
    },
    onSuccess: () => toast("Logo updated."),
  });
  return (
    <Card className="p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Venue name">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label="Time zone" hint="Used for brunch and happy-hour windows on the QR menu." error={isValidTimeZone(timezone) ? null : "Unknown time zone"}>
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canEdit} />
        </Field>
        <div className="flex gap-2">
          <Button onClick={() => logoRef.current?.click()} icon={<IconUpload size={14} />} loading={logo.isPending} disabled={!canEdit}>
            Logo
          </Button>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!canEdit || !isValidTimeZone(timezone)}>
            Save
          </Button>
        </div>
        <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && logo.mutate(e.target.files[0])} />
      </div>
      <div className="mt-3 text-[12px] text-muted">
        {venue.currency} · {venue.locale} · QR address /{venue.slug}
      </div>
      {save.error ? <ErrorNotice className="mt-3" error={save.error} /> : null}
    </Card>
  );
}

export function Settings() {
  const { org } = useCurrentOrg();
  const me = useMe();
  const members = useMembers(org?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState(org?.name ?? "");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("editor");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const owner = org?.role === "owner";

  const rename = useMutation({
    mutationFn: () => api(`/orgs/${org?.id}`, { method: "PATCH", body: { name: orgName } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.me });
      toast("Organization renamed.");
    },
  });
  const invite = useMutation({
    mutationFn: () => api<{ inviteUrl: string }>(`/orgs/${org?.id}/invites`, { method: "POST", body: { email: inviteEmail, role: inviteRole } }),
    onSuccess: (r) => {
      setInviteUrl(r.inviteUrl);
      setInviteEmail("");
    },
  });
  const exportData = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      const res = await fetch(`${API_URL}/account/export`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `menu-studio-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    },
  });
  const deleteAccount = useMutation({
    mutationFn: () => api("/account", { method: "DELETE", body: { confirm } }),
    onSuccess: async () => {
      await signOut();
      void navigate("/auth/sign-in");
    },
  });

  if (!org) return null;
  const venues = (me.data?.venues ?? []).filter((v) => v.orgId === org.id);

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow={org.name} title="Settings" />
      <div className="flex max-w-3xl flex-col gap-10">
        <section>
          <h2 className="display mb-4 text-[26px]">Organization</h2>
          <Card className="flex items-end gap-3 p-5">
            <Field label="Name" className="flex-1">
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={!owner} />
            </Field>
            <Button onClick={() => rename.mutate()} loading={rename.isPending} disabled={!owner || !orgName.trim()}>
              Rename
            </Button>
          </Card>
        </section>

        <section>
          <h2 className="display mb-4 text-[26px]">Venues</h2>
          <div className="flex flex-col gap-3">
            {venues.map((v) => (
              <VenueSettings key={v.id} venue={v} canEdit={org.role !== "viewer"} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="display mb-4 text-[26px]">Team</h2>
          <Card className="divide-y divide-line">
            {members.data?.map((m) => (
              <div key={m.userId} className="flex items-center justify-between px-5 py-3 text-[13.5px]">
                <span>{m.email ?? m.userId}</span>
                <Badge>{m.role}</Badge>
              </div>
            ))}
          </Card>
          {owner ? (
            <Card className="mt-3 p-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                <Field label="Invite by email">
                  <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="chef@restaurant.com" />
                </Field>
                <Field label="Role">
                  <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as MemberRole)}>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                    <option value="owner">Owner</option>
                  </Select>
                </Field>
                <Button variant="primary" onClick={() => invite.mutate()} loading={invite.isPending} disabled={!inviteEmail.includes("@")}>
                  Create invite
                </Button>
              </div>
              {inviteUrl ? (
                <Notice className="mt-4">
                  Share this link with them (valid for 14 days):
                  <div className="mt-2 flex items-center gap-2">
                    <code className="truncate text-[12px]">{inviteUrl}</code>
                    <button aria-label="Copy invite link" onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => toast("Invite link copied."))}>
                      <IconCopy size={14} />
                    </button>
                  </div>
                </Notice>
              ) : null}
              {invite.error ? <ErrorNotice className="mt-3" error={invite.error} /> : null}
            </Card>
          ) : null}
        </section>

        <section>
          <h2 className="display mb-4 text-[26px]">Your data</h2>
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="text-[13.5px] text-muted">Download everything you've created: menus, versions, venues and published menus.</div>
            <Button onClick={() => exportData.mutate()} loading={exportData.isPending}>
              Download my data
            </Button>
          </Card>
          <Card className="mt-3 flex flex-wrap items-center justify-between gap-4 border-danger/20 p-5">
            <div className="text-[13.5px] text-muted">Delete your account. Organizations you solely own are deleted with their menus.</div>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete account
            </Button>
          </Card>
          <p className="mt-3 text-[12px] text-faint">
            See our <a className="underline" href="/privacy">privacy notice</a> for how data is handled.
          </p>
        </section>
      </div>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete your account?" description="This cannot be undone. Type DELETE to confirm.">
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
        <Button variant="danger" className="mt-4 w-full" disabled={confirm !== "DELETE"} loading={deleteAccount.isPending} onClick={() => deleteAccount.mutate()}>
          Permanently delete
        </Button>
        {deleteAccount.error ? <ErrorNotice className="mt-3" error={deleteAccount.error} /> : null}
      </Dialog>
    </div>
  );
}
