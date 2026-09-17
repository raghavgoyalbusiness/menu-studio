import type { OrgDto } from "@menu-studio/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Wordmark } from "../../components/AppShell.tsx";
import { Button, Card, ErrorNotice, Field, Input, Notice, Select, Spinner } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { keys, useMe } from "../../lib/queries.ts";
import { completeSignIn, requestMagicLink, signInWithGoogle, useSession } from "../../lib/session.ts";

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Wordmark />
        <div className="flex flex-1 items-center">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>
        <p className="text-[12px] text-faint">Menus designed from your own content. We never invent items or prices.</p>
      </div>
      <div className="relative hidden overflow-hidden border-l border-line bg-canvas lg:block" aria-hidden>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="grid rotate-[-4deg] grid-cols-2 gap-6 opacity-95">
            {[
              { bg: "#16140F", fg: "#EFE8DA", accent: "#C9A45C", name: "Yoru Niwa", font: "'Shippori Mincho'" },
              { bg: "#F6EFE0", fg: "#1F2433", accent: "#7A1F2B", name: "Chez Lucette", font: "'EB Garamond'" },
              { bg: "#FBF4E6", fg: "#2A1512", accent: "#8C1D2E", name: "Haveli Rasoi", font: "'Rozha One'" },
              { bg: "#EFE4D6", fg: "#2B1D14", accent: "#834620", name: "Filter & Fold", font: "'Outfit'" },
            ].map((m, i) => (
              <div key={m.name} className="flex h-[300px] w-[212px] flex-col items-center rounded-[3px] px-5 pt-8 shadow-float" style={{ background: m.bg, color: m.fg, transform: `translateY(${i % 2 ? 40 : 0}px)` }}>
                <div style={{ fontFamily: m.font, fontSize: 24 }}>{m.name}</div>
                <div className="mt-3 h-px w-16" style={{ background: m.accent }} />
                {Array.from({ length: 7 }, (_, j) => (
                  <div key={j} className="mt-3 flex w-full items-center gap-2">
                    <div className="h-[6px] rounded-full opacity-70" style={{ width: `${40 + ((j * 17) % 35)}%`, background: m.fg }} />
                    <div className="flex-1 border-b border-dotted opacity-30" style={{ borderColor: m.fg }} />
                    <div className="h-[6px] w-6 rounded-full" style={{ background: m.accent }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SignIn() {
  const { status, mode } = useSession();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [devLink, setDevLink] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const send = useMutation({
    mutationFn: () => requestMagicLink(email.trim()),
    onSuccess: (result) => {
      setSent(true);
      setDevLink(result.devLink);
    },
  });
  const google = useMutation({ mutationFn: signInWithGoogle });

  if (status === "signed_in") return <Navigate to={params.get("next") ?? "/"} replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (email.trim()) send.mutate();
  };

  return (
    <AuthFrame>
      <h1 className="display text-[44px] text-ink">Welcome in</h1>
      <p className="mt-2 text-[15px] text-muted">Sign in or create your account with a one-time link. No password needed.</p>
      {sent ? (
        <Card className="mt-8 p-5">
          <div className="text-[14px] text-ink">Check {email} for your sign-in link.</div>
          {devLink ? (
            <Notice className="mt-4">
              Development mode: there is no mail server, so here is your link.
              <a href={devLink} className="mt-2 block font-medium text-ink underline underline-offset-2" data-testid="dev-magic-link">
                Continue to Menu Studio
              </a>
            </Notice>
          ) : null}
          <button className="mt-4 text-[13px] text-muted underline underline-offset-2" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </Card>
      ) : (
        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          <Field label="Email">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@restaurant.com" autoFocus />
          </Field>
          <Button variant="primary" size="lg" type="submit" loading={send.isPending}>
            Email me a sign-in link
          </Button>
          {send.error ? <ErrorNotice error={send.error} /> : null}
          <div className="my-1 flex items-center gap-3 text-[12px] text-faint">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <Button type="button" size="lg" onClick={() => google.mutate()} loading={google.isPending} disabled={mode !== "supabase"} title={mode !== "supabase" ? "Available when Supabase Auth is configured" : undefined}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z" />
              <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
            </svg>
            Continue with Google
          </Button>
          {google.error ? <ErrorNotice error={google.error} /> : null}
        </form>
      )}
    </AuthFrame>
  );
}

export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    completeSignIn(params)
      .then(() => navigate("/", { replace: true }))
      .catch(setError);
  }, [params, navigate]);
  return (
    <AuthFrame>
      {error ? (
        <>
          <ErrorNotice error={error} />
          <Link to="/auth/sign-in" className="mt-4 inline-block text-[13px] underline underline-offset-2">
            Request a new link
          </Link>
        </>
      ) : (
        <div className="flex items-center gap-3 text-muted">
          <Spinner /> Signing you in…
        </div>
      )}
    </AuthFrame>
  );
}

export function InviteAccept() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const handoff = params.get("handoff") === "1";
  const me = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const owned = (me.data?.orgs ?? []).filter((o: OrgDto) => o.role === "owner");
  const [target, setTarget] = useState("");
  const accept = useMutation({
    mutationFn: () => api<{ orgId: string }>("/invites/accept", { method: "POST", body: { token, ...(handoff ? { targetOrgId: target || owned[0]?.id } : {}) } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.me });
      void navigate("/");
    },
  });
  return (
    <AuthFrame>
      <h1 className="display text-[40px]">{handoff ? "A venue is being handed to you" : "You've been invited"}</h1>
      <p className="mt-2 text-[14px] text-muted">
        {handoff ? "Accept to move the venue, its menus and history into one of your organizations." : "Accept to join the team and work on its menus."}
      </p>
      {handoff ? (
        owned.length ? (
          <Field label="Receiving organization" className="mt-6">
            <Select value={target || owned[0]?.id} onChange={(e) => setTarget(e.target.value)}>
              {owned.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Notice className="mt-6">
            Create your own organization first, then open this link again. <Link to="/onboarding" className="underline">Create organization</Link>
          </Notice>
        )
      ) : null}
      <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => accept.mutate()} loading={accept.isPending} disabled={handoff && !owned.length}>
        Accept
      </Button>
      {accept.error ? <ErrorNotice className="mt-4" error={accept.error} /> : null}
    </AuthFrame>
  );
}
