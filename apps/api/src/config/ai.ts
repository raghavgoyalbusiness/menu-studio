/**
 * The single place the Claude model is configured. Nothing else in the codebase names a model.
 */
export const AI_MODEL = process.env.AI_MODEL?.trim() || "claude-opus-5";

/**
 * Server-side refusal fallback: if a safety classifier declines a request, the API re-runs
 * it on Anthropic's recommended fallback model inside the same call.
 */
export const AI_FALLBACKS = { beta: "server-side-fallback-2026-07-01", mode: "default" } as const;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type AiEndpoint = "extract" | "draft" | "concepts" | "edit" | "translate" | "engineering" | "describe_reference";

export interface EndpointSettings {
  effort: Effort;
  maxTokens: number;
  timeoutMs: number;
  /** Per-organization rate limit. */
  rateLimit: { calls: number; windowSeconds: number };
}

export const ENDPOINTS: Record<AiEndpoint, EndpointSettings> = {
  extract: { effort: "high", maxTokens: 48_000, timeoutMs: 240_000, rateLimit: { calls: 30, windowSeconds: 3600 } },
  // Drafting is cheaper than extraction — no images, and no prices to cross-check — but it is
  // rate-limited harder, because a fresh draft is a thing to iterate on, not to spam.
  draft: { effort: "high", maxTokens: 24_000, timeoutMs: 180_000, rateLimit: { calls: 20, windowSeconds: 3600 } },
  concepts: { effort: "high", maxTokens: 48_000, timeoutMs: 240_000, rateLimit: { calls: 30, windowSeconds: 3600 } },
  edit: { effort: "medium", maxTokens: 16_000, timeoutMs: 120_000, rateLimit: { calls: 120, windowSeconds: 3600 } },
  translate: { effort: "medium", maxTokens: 48_000, timeoutMs: 240_000, rateLimit: { calls: 20, windowSeconds: 3600 } },
  engineering: { effort: "low", maxTokens: 6_000, timeoutMs: 60_000, rateLimit: { calls: 30, windowSeconds: 3600 } },
  describe_reference: { effort: "low", maxTokens: 4_000, timeoutMs: 60_000, rateLimit: { calls: 30, windowSeconds: 3600 } },
};

/** USD per million tokens. Micro-USD per token equals these numbers. */
export interface TokenPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const OPUS: TokenPrice = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };

export const PRICES: Record<string, TokenPrice> = {
  "claude-opus-5": OPUS,
  "claude-opus-4-8": OPUS,
  "claude-opus-4-7": OPUS,
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  "claude-fable-5-1": { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 },
};

export function costUsdMicros(model: string, usage: { input: number; output: number; cacheWrite: number; cacheRead: number }): number {
  const price = PRICES[model] ?? OPUS;
  return Math.round(usage.input * price.input + usage.output * price.output + usage.cacheWrite * price.cacheWrite + usage.cacheRead * price.cacheRead);
}
