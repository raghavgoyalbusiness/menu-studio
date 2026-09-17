import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { OrgDto } from "@menu-studio/shared";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { preferredOrgId, setPreferredOrgId, useMe } from "../lib/queries.ts";
import { signOut, useSession } from "../lib/session.ts";
import { IconCheck, IconChevronDown } from "./icons.tsx";
import { cx } from "./ui.tsx";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx("flex items-center gap-2 text-ink", className)}>
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill="currentColor" />
        <path d="M9 22V10l7 7 7-7v12" fill="none" stroke="#F6F4EF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="display text-[21px] leading-none">Menu Studio</span>
    </Link>
  );
}

export function useCurrentOrg(): { org: OrgDto | undefined; orgs: OrgDto[] } {
  const me = useMe();
  const orgs = me.data?.orgs ?? [];
  const id = preferredOrgId(orgs);
  return { org: orgs.find((o) => o.id === id), orgs };
}

function OrgSwitcher() {
  const { org, orgs } = useCurrentOrg();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (!org) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-ink-2 hover:bg-paper-2">
        <span className="max-w-40 truncate">{org.name}</span>
        <IconChevronDown size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="z-50 min-w-56 rounded-md border border-line bg-card p-1 shadow-float">
          {orgs.map((o) => (
            <DropdownMenu.Item
              key={o.id}
              className="flex cursor-pointer items-center justify-between rounded-sm px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-paper-2"
              onSelect={() => {
                setPreferredOrgId(o.id);
                void queryClient.invalidateQueries();
                void navigate("/");
              }}
            >
              <span>
                {o.name}
                <span className="ml-2 text-[11.5px] text-muted">{o.type === "agency" ? "Agency" : o.plan}</span>
              </span>
              {o.id === org.id ? <IconCheck size={14} /> : null}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className="cursor-pointer rounded-sm px-2.5 py-2 text-[13px] text-muted outline-none data-[highlighted]:bg-paper-2" onSelect={() => navigate("/onboarding?new=1")}>
            New organization…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { email } = useSession();
  const me = useMe();
  const { org } = useCurrentOrg();
  const navigate = useNavigate();
  const link = ({ isActive }: { isActive: boolean }) => cx("rounded-md px-2.5 py-1.5 text-[13px] transition-colors", isActive ? "bg-paper-2 text-ink" : "text-muted hover:text-ink");

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-4 px-5">
          <Wordmark />
          <span className="h-5 w-px bg-line" />
          <OrgSwitcher />
          <nav className="ml-2 hidden items-center gap-1 md:flex">
            <NavLink to="/" end className={link}>
              Menus
            </NavLink>
            {org?.type === "agency" ? (
              <NavLink to="/agency" className={link}>
                Clients
              </NavLink>
            ) : null}
            <NavLink to="/billing" className={link}>
              Billing
            </NavLink>
            <NavLink to="/settings" className={link}>
              Settings
            </NavLink>
            {me.data?.user.isAdmin ? (
              <NavLink to="/admin" className={link}>
                Admin
              </NavLink>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="flex h-8 w-8 items-center justify-center rounded-full bg-paper-2 text-[12px] font-medium text-ink-2 uppercase hover:bg-line" aria-label="Account">
                {(email ?? "?").slice(0, 1)}
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-md border border-line bg-card p-1 shadow-float">
                  <div className="px-2.5 py-2 text-[12px] text-muted">{email}</div>
                  <DropdownMenu.Item className="cursor-pointer rounded-sm px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-paper-2 md:hidden" onSelect={() => navigate("/billing")}>
                    Billing
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className="cursor-pointer rounded-sm px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-paper-2 md:hidden" onSelect={() => navigate("/settings")}>
                    Settings
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="cursor-pointer rounded-sm px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-paper-2"
                    onSelect={() => {
                      void signOut().then(() => navigate("/auth/sign-in"));
                    }}
                  >
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 pt-12 pb-24">{children}</main>
    </div>
  );
}
