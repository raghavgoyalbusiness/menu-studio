import { createLogger, LocalStorage, type Db, type JobSender, type QueueName } from "@menu-studio/server-core";
import type { LayoutSpec } from "@menu-studio/shared";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.ts";
import { LocalMagicLinks, localVerifier } from "../src/auth/verifier.ts";
import { ApiEnv } from "../src/config/env.ts";
import type { AppDeps } from "../src/deps.ts";
import type { AiClient, AiRequest, AiResponse } from "../src/services/anthropic.ts";
import type { BillingProvider, BillingWebhookEvent, CheckoutRequest } from "../src/services/billing/provider.ts";

export const SECRET = "test-secret-0123456789abcdef";

export type AiHandler = (request: AiRequest) => unknown;

/** Scripted Claude: each call pops the next handler; objects are returned as JSON text. */
export class FakeAi implements AiClient {
  readonly calls: AiRequest[] = [];
  private readonly queue: AiHandler[] = [];

  push(...handlers: (AiHandler | object | string)[]): void {
    for (const h of handlers) this.queue.push(typeof h === "function" ? (h as AiHandler) : () => h);
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    this.calls.push(structuredClone(request));
    const handler = this.queue.shift();
    if (!handler) throw new Error("FakeAi: no scripted response left");
    const out = handler(request);
    if (out instanceof Error) throw out;
    const text = typeof out === "string" ? out : JSON.stringify(out);
    return {
      text,
      content: [{ type: "text", text }],
      stopReason: "end_turn",
      model: "claude-opus-5",
      usage: { input: 1200, output: 800, cacheRead: 300, cacheWrite: 0 },
    };
  }
}

export class FakeJobs implements JobSender {
  readonly sent: { queue: QueueName; data: object }[] = [];
  send(queue: QueueName, data: object): Promise<string | null> {
    this.sent.push({ queue, data });
    return Promise.resolve(`job-${this.sent.length}`);
  }
}

export class FakeBilling implements BillingProvider {
  readonly configured = true;
  readonly id: "stripe" | "razorpay";
  next: BillingWebhookEvent | null = null;
  readonly checkouts: CheckoutRequest[] = [];
  constructor(id: "stripe" | "razorpay") {
    this.id = id;
  }
  createCheckout(request: CheckoutRequest) {
    this.checkouts.push(request);
    return Promise.resolve({ url: `https://pay.example/${this.id}/${request.plan}`, customerId: `cus_${request.orgId.slice(0, 6)}` });
  }
  createPortal() {
    return Promise.resolve({ url: "https://pay.example/portal" });
  }
  parseWebhook(_raw: string, headers: Record<string, string | undefined>) {
    return Promise.resolve(headers["x-test-signature"] === "valid" ? this.next : null);
  }
}

export async function buildTestApp(db: Db) {
  const env = ApiEnv.parse({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://unused",
    LOCAL_JWT_SECRET: SECRET,
    PRINT_TOKEN_SECRET: SECRET,
    WEB_URL: "http://web.test",
    API_URL: "http://api.test",
    MENU_URL: "http://menu.test",
  });
  const ai = new FakeAi();
  const jobs = new FakeJobs();
  const billing = { stripe: new FakeBilling("stripe"), razorpay: new FakeBilling("razorpay") };
  const storageDir = await mkdtemp(join(tmpdir(), "menu-studio-storage-"));
  const deps: AppDeps = {
    env,
    db,
    storage: new LocalStorage(storageDir, env.API_URL, SECRET),
    jobs,
    ai,
    auth: localVerifier(SECRET),
    magicLinks: new LocalMagicLinks(SECRET),
    billing,
    logger: createLogger("api-test"),
  };
  const app = createApp(deps);

  const request = async (method: string, path: string, options: { token?: string; body?: unknown; form?: FormData; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { ...options.headers };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    let body: BodyInit | undefined;
    if (options.form) body = options.form;
    else if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }
    const res = await app.request(path, { method, headers, body });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json: json as never, headers: res.headers };
  };

  const signIn = async (email: string): Promise<string> => {
    const link = await request("POST", "/auth/local/magic-link", { body: { email } });
    const token = new URL((link.json as { devLink: string }).devLink).searchParams.get("token");
    const verified = await request("POST", "/auth/local/verify", { body: { token } });
    return (verified.json as { accessToken: string }).accessToken;
  };

  return { app, deps, ai, jobs, billing, request, signIn, env };
}

/** Shape a LayoutSpec as the concepts wire format Claude returns. */
export function specToWire(spec: LayoutSpec) {
  return {
    conceptName: spec.conceptName,
    rationale: spec.rationale,
    archetype: spec.archetype,
    tokens: {
      fontPairingId: spec.tokens.fontPairingId,
      paletteId: spec.tokens.paletteId,
      ornamentStyle: spec.tokens.ornamentStyle,
      density: spec.tokens.density,
      iconSet: spec.tokens.iconSet,
      pricePlacement: spec.tokens.pricePlacement,
      priceStyle: spec.tokens.priceStyle,
      textCase: spec.tokens.textCase,
      backgroundTexture: spec.tokens.backgroundTexture,
      bodyScale: spec.tokens.bodyScale,
    },
    pages: spec.pages.map((p) => ({
      blocks: p.blocks.map((b) => ({
        type: b.type,
        sectionRef: b.sectionRef ?? null,
        itemRefs: b.itemRefs ?? null,
        noteRef: b.noteRef === undefined ? null : typeof b.noteRef === "number" ? `footer:${b.noteRef}` : b.noteRef,
        gridArea: b.gridArea,
        emphasis: b.emphasis,
        styleOverrides: null,
      })),
    })),
    matrix: spec.matrix ? { xAxis: spec.matrix.xAxis, yAxis: spec.matrix.yAxis, placements: spec.matrix.placements.map((p) => ({ itemId: p.itemId, x: p.x, y: p.y })) } : null,
    journey: spec.journey ?? null,
  };
}
