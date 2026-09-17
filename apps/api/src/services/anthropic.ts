import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AppError, finishAiUsage, startAiUsage, tooManyRequests, recentAiCalls, type Db, type Logger } from "@menu-studio/server-core";
import type { z } from "zod";
import { AI_FALLBACKS, AI_MODEL, costUsdMicros, ENDPOINTS, type AiEndpoint, type Effort } from "../config/ai.ts";

type ContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

export interface AiRequest {
  system: string;
  messages: MessageParam[];
  maxTokens: number;
  effort: Effort;
  schema: Record<string, unknown>;
  timeoutMs: number;
}

export interface AiResponse {
  text: string;
  /** Assistant content, echoed back unchanged when retrying. */
  content: unknown[];
  stopReason: string | null;
  model: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/** The only boundary to Claude. Tests inject a fake. */
export interface AiClient {
  complete(request: AiRequest): Promise<AiResponse>;
}

export class AnthropicAiClient implements AiClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    const stream = this.client.beta.messages.stream(
      {
        model: AI_MODEL,
        max_tokens: request.maxTokens,
        betas: [AI_FALLBACKS.beta],
        fallbacks: AI_FALLBACKS.mode,
        thinking: { type: "adaptive" },
        output_config: { effort: request.effort, format: { type: "json_schema", schema: request.schema } },
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: request.messages,
      },
      { timeout: request.timeoutMs },
    );
    const message = await stream.finalMessage();
    const text = message.content
      .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return {
      text,
      content: message.content,
      stopReason: message.stop_reason,
      model: message.model,
      usage: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cacheRead: message.usage.cache_read_input_tokens ?? 0,
        cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}

export type Conversion<D> = { ok: true; value: D } | { ok: false; issues: string[] };

export interface StructuredCall<W, D> {
  endpoint: AiEndpoint;
  prompt: { name: string; version: string; system: string };
  content: ContentBlockParam[];
  wire: z.ZodType<W>;
  /** Wire → domain conversion plus every semantic rule enforced in code. */
  convert: (wire: W) => Conversion<D> | Promise<Conversion<D>>;
  meter: { orgId: string; projectId: string | null; userId: string; requestId: string };
}

export interface StructuredResult<D> {
  value: D;
  attempts: number;
  model: string;
}

export class AiNotConfiguredError extends AppError {
  constructor() {
    super(503, "ai_not_configured", "AI features are not configured on this server (ANTHROPIC_API_KEY is missing).");
  }
}

const MAX_ATTEMPTS = 2;

function wireJsonSchema(wire: z.ZodType): Record<string, unknown> {
  return zodOutputFormat(wire as never).schema as Record<string, unknown>;
}

const schemaCache = new WeakMap<object, Record<string, unknown>>();
function cachedSchema(wire: z.ZodType): Record<string, unknown> {
  let schema = schemaCache.get(wire);
  if (!schema) {
    schema = wireJsonSchema(wire);
    schemaCache.set(wire, schema);
  }
  return schema;
}

/**
 * Structured call with metering, rate limiting, validation and one retry.
 *
 *   reserve usage row → call → JSON.parse → wire Zod → convert (domain Zod + rules)
 *   → on failure, append the model output and the issues, and try once more
 *   → on second failure, a typed error the UI turns into "try again".
 */
export async function runStructured<W, D>(deps: { ai: AiClient | null; db: Db; logger: Logger }, call: StructuredCall<W, D>): Promise<StructuredResult<D>> {
  if (!deps.ai) throw new AiNotConfiguredError();
  const settings = ENDPOINTS[call.endpoint];

  const recent = await deps.db.asService((q) => recentAiCalls(q, call.meter.orgId, call.endpoint, settings.rateLimit.windowSeconds));
  if (recent >= settings.rateLimit.calls) {
    throw tooManyRequests(`You've reached the limit of ${settings.rateLimit.calls} ${call.endpoint.replace("_", " ")} requests per hour. Please try again later.`);
  }

  const schema = cachedSchema(call.wire);
  const messages: MessageParam[] = [{ role: "user", content: call.content }];
  let lastIssues: string[] = [];
  let lastStop: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const usageId = await deps.db.asService((q) =>
      startAiUsage(q, {
        orgId: call.meter.orgId,
        projectId: call.meter.projectId,
        requestId: call.meter.requestId,
        endpoint: call.endpoint,
        promptName: call.prompt.name,
        promptVersion: call.prompt.version,
        model: AI_MODEL,
        attempt,
        createdBy: call.meter.userId,
      }),
    );
    const started = Date.now();
    let response: AiResponse;
    try {
      response = await deps.ai.complete({
        system: call.prompt.system,
        messages,
        maxTokens: settings.maxTokens,
        effort: settings.effort,
        schema,
        timeoutMs: settings.timeoutMs,
      });
    } catch (error) {
      const mapped = mapClientError(error);
      await deps.db.asService((q) =>
        finishAiUsage(q, usageId, {
          status: "failed",
          model: AI_MODEL,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsdMicros: 0,
          stopReason: null,
          errorCode: mapped.code,
          latencyMs: Date.now() - started,
        }),
      );
      deps.logger.warn("ai call failed", { endpoint: call.endpoint, attempt, code: mapped.code, error });
      throw mapped;
    }

    const cost = costUsdMicros(response.model, response.usage);
    const issues = await validate(response, call);
    await deps.db.asService((q) =>
      finishAiUsage(q, usageId, {
        status: issues.ok ? "succeeded" : "failed",
        model: response.model,
        inputTokens: response.usage.input,
        outputTokens: response.usage.output,
        cacheReadTokens: response.usage.cacheRead,
        cacheWriteTokens: response.usage.cacheWrite,
        costUsdMicros: cost,
        stopReason: response.stopReason,
        errorCode: issues.ok ? null : issues.code,
        latencyMs: Date.now() - started,
      }),
    );
    deps.logger.info("ai call", {
      endpoint: call.endpoint,
      prompt: `${call.prompt.name}@${call.prompt.version}`,
      model: response.model,
      attempt,
      ok: issues.ok,
      inputTokens: response.usage.input,
      outputTokens: response.usage.output,
      cacheReadTokens: response.usage.cacheRead,
      costUsdMicros: cost,
      ms: Date.now() - started,
    });

    if (issues.ok) return { value: issues.value, attempts: attempt, model: response.model };
    if (issues.code === "refusal") {
      throw new AppError(422, "ai_refused", "The AI declined this request. Try rephrasing it.");
    }
    lastIssues = issues.issues;
    lastStop = response.stopReason;
    messages.push({ role: "assistant", content: response.content as ContentBlockParam[] });
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `Your JSON did not pass validation. Fix every issue below and return the complete corrected JSON.\n\n${issues.issues
            .slice(0, 40)
            .map((i) => `- ${i}`)
            .join("\n")}`,
        },
      ],
    });
  }

  throw new AppError(422, "ai_invalid_output", "We couldn't get a valid result from the AI this time. Please try again.", {
    retryable: true,
    issues: [...lastIssues.slice(0, 10), ...(lastStop === "max_tokens" ? ["The response was cut off (max_tokens)."] : [])],
  });
}

async function validate<W, D>(
  response: AiResponse,
  call: StructuredCall<W, D>,
): Promise<{ ok: true; value: D } | { ok: false; code: string; issues: string[] }> {
  if (response.stopReason === "refusal") return { ok: false, code: "refusal", issues: ["refused"] };
  if (response.stopReason === "max_tokens") {
    return { ok: false, code: "max_tokens", issues: ["The response hit the length limit. Be more concise: shorter descriptions and rationale."] };
  }
  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch {
    return { ok: false, code: "invalid_json", issues: ["The response was not valid JSON."] };
  }
  const wire = call.wire.safeParse(json);
  if (!wire.success) {
    return { ok: false, code: "wire_schema", issues: wire.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  const converted = await call.convert(wire.data);
  if (!converted.ok) return { ok: false, code: "domain_rules", issues: converted.issues };
  return { ok: true, value: converted.value };
}

function mapClientError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError || (error instanceof Error && error.name === "AbortError")) {
    return new AppError(504, "ai_timeout", "The AI took too long to respond. Please try again.", { retryable: true });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AppError(503, "ai_busy", "The AI service is busy right now. Please try again in a minute.", { retryable: true });
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AppError(503, "ai_not_configured", "The AI service rejected our credentials. Check ANTHROPIC_API_KEY.");
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AppError(502, "ai_bad_request", "The AI service rejected the request.", { retryable: false });
  }
  if (error instanceof Anthropic.APIError || error instanceof Anthropic.APIConnectionError) {
    return new AppError(503, "ai_unavailable", "The AI service is unavailable right now. Please try again.", { retryable: true });
  }
  return new AppError(500, "ai_error", "Something went wrong talking to the AI.", { retryable: true });
}
