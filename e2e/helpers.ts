import type { Page } from "@playwright/test";

export const API = process.env.API_URL ?? "http://127.0.0.1:5323";
export const SEED_EMAIL = process.env.SEED_EMAIL ?? "demo@menu-studio.local";

export interface ProjectSummary {
  id: string;
  name: string;
}

/** Signs in through the real UI. Local auth is passwordless: the dev page shows the link. */
export async function signIn(page: Page): Promise<string> {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(SEED_EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByTestId("dev-magic-link").click();
  await page.getByText("Your menus").waitFor();
  const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("menu-studio.session") ?? "{}") as { token?: string }).token ?? "");
  if (!token) throw new Error("Signed in but no session token was stored");
  return token;
}

export async function apiGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function seededProject(token: string, name: string): Promise<ProjectSummary> {
  const projects = await apiGet<ProjectSummary[]>(token, "/projects");
  const project = projects.find((p) => p.name === name);
  if (!project) throw new Error(`Seed project "${name}" is missing. Run pnpm db:seed.`);
  return project;
}

/** Polls an export until it leaves the queue. Rendering a print pack takes a few seconds. */
export async function waitForExport(
  token: string,
  exportId: string,
  timeoutMs = 90_000,
): Promise<{ status: string; error: string | null; files: { name: string; url: string; bytes: number }[] }> {
  const deadline = Date.now() + timeoutMs;
  let body = await apiGet<{ status: string; error: string | null; files: { name: string; url: string; bytes: number }[] }>(token, `/exports/${exportId}`);
  while ((body.status === "queued" || body.status === "rendering") && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    body = await apiGet(token, `/exports/${exportId}`);
  }
  return body;
}
