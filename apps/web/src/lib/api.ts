import type { ApiErrorBody, PlanId } from "@menu-studio/shared";
import { getAccessToken, handleUnauthorized } from "./session.ts";

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:5323";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly issues: string[];
  readonly upgradeTo: PlanId | undefined;

  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    super(body?.error.message ?? fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error.code ?? "unknown";
    this.retryable = body?.error.retryable ?? status >= 500;
    this.issues = body?.error.issues ?? [];
    this.upgradeTo = body?.error.upgradeTo;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  auth?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.auth !== false) {
    const token = await getAccessToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: options.method ?? "GET", headers, body, signal: options.signal ?? null });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, { error: { code: "network", message: "Can't reach Menu Studio. Check your connection and try again.", retryable: true } }, "Network error");
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    if (response.status === 401 && options.auth !== false) handleUnauthorized();
    throw new ApiError(response.status, (json as ApiErrorBody | null) ?? null, `Request failed (${response.status})`);
  }
  return json as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
