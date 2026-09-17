import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";

const STORAGE_KEY = "menu-studio.session";
const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:5323";

interface AuthConfig {
  mode: "local" | "supabase";
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}

export interface SessionState {
  status: "loading" | "signed_out" | "signed_in";
  mode: AuthConfig["mode"];
  email: string | null;
  error: string | null;
}

export const useSession = create<SessionState>(() => ({ status: "loading", mode: "local", email: null, error: null }));

let supabase: SupabaseClient | null = null;
let localToken: string | null = null;
let initPromise: Promise<void> | null = null;

function readLocal(): { token: string; email: string | null } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { token: string; email: string | null }) : null;
  } catch {
    return null;
  }
}

function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "")) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function initSession(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    let config: AuthConfig = { mode: "local", supabaseUrl: null, supabaseAnonKey: null };
    try {
      const res = await fetch(`${API}/auth/config`);
      if (res.ok) config = (await res.json()) as AuthConfig;
    } catch {
      useSession.setState({ error: "Can't reach the Menu Studio API." });
    }
    if (config.mode === "supabase" && config.supabaseUrl && config.supabaseAnonKey) {
      supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
      const { data } = await supabase.auth.getSession();
      useSession.setState({ mode: "supabase", status: data.session ? "signed_in" : "signed_out", email: data.session?.user.email ?? null });
      supabase.auth.onAuthStateChange((_event, session) => {
        useSession.setState({ status: session ? "signed_in" : "signed_out", email: session?.user.email ?? null });
      });
      return;
    }
    const stored = readLocal();
    if (stored && !tokenExpired(stored.token)) {
      localToken = stored.token;
      useSession.setState({ mode: "local", status: "signed_in", email: stored.email });
    } else {
      useSession.setState({ mode: "local", status: "signed_out", email: null });
    }
  })();
  return initPromise;
}

export async function getAccessToken(): Promise<string | null> {
  await initSession();
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }
  return localToken;
}

/** Local mode returns a dev link to click (there is no mail server); Supabase sends an email. */
export async function requestMagicLink(email: string): Promise<{ devLink: string | null }> {
  await initSession();
  if (supabase) {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    if (error) throw new Error(error.message);
    return { devLink: null };
  }
  const res = await fetch(`${API}/auth/local/magic-link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  const body = (await res.json()) as { devLink?: string; error?: { message: string } };
  if (!res.ok) throw new Error(body.error?.message ?? "Could not send the link.");
  return { devLink: body.devLink ?? null };
}

export async function signInWithGoogle(): Promise<void> {
  await initSession();
  if (!supabase) throw new Error("Google sign-in needs Supabase Auth. This development server uses email links.");
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
  if (error) throw new Error(error.message);
}

export async function completeSignIn(search: URLSearchParams): Promise<void> {
  await initSession();
  if (supabase) {
    const code = search.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw new Error(error.message);
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("That sign-in link has expired. Request a new one.");
    return;
  }
  const token = search.get("token");
  if (!token) throw new Error("This sign-in link is incomplete.");
  const res = await fetch(`${API}/auth/local/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  const body = (await res.json()) as { accessToken?: string; user?: { email: string | null }; error?: { message: string } };
  if (!res.ok || !body.accessToken) throw new Error(body.error?.message ?? "Sign-in failed.");
  localToken = body.accessToken;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: body.accessToken, email: body.user?.email ?? null }));
  useSession.setState({ status: "signed_in", email: body.user?.email ?? null });
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
  localToken = null;
  localStorage.removeItem(STORAGE_KEY);
  useSession.setState({ status: "signed_out", email: null });
}

export function handleUnauthorized(): void {
  if (useSession.getState().status === "signed_in") void signOut();
}
