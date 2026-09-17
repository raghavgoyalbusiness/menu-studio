import { AppError, pgErrorCode, PG, unauthorized } from "@menu-studio/server-core";
import type { ApiErrorBody } from "@menu-studio/shared";
import type { Context, ErrorHandler, MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../deps.ts";

export function requestContext(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header("x-request-id");
    const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    const logger = deps.logger.child({ requestId });
    c.set("requestId", requestId);
    c.set("logger", logger);
    c.header("x-request-id", requestId);
    const started = Date.now();
    await next();
    logger.info("request", { method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - started });
  };
}

export function requireUser(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw unauthorized();
    const claims = await deps.auth.verify(token);
    if (!claims) throw unauthorized("Your session has expired. Please sign in again.");
    c.set("user", { sub: claims.sub, email: claims.email ?? null });
    await next();
  };
}

export function errorHandler(): ErrorHandler<AppEnv> {
  return (error, c) => {
    const logger = c.get("logger");
    let status = 500;
    let body: ApiErrorBody = { error: { code: "internal", message: "Something went wrong on our side. Please try again." } };

    if (error instanceof AppError) {
      status = error.status;
      body = { error: { code: error.code, message: error.message } };
      if (error.retryable) body.error.retryable = true;
      if (error.issues) body.error.issues = error.issues;
      if (error.upgradeTo) body.error.upgradeTo = error.upgradeTo;
    } else if (error instanceof z.ZodError) {
      status = 400;
      body = { error: { code: "bad_request", message: "The request was not valid", issues: error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`) } };
    } else if (pgErrorCode(error) === PG.insufficientPrivilege) {
      status = 403;
      body = { error: { code: "forbidden", message: "You do not have permission to do that." } };
    } else if (pgErrorCode(error) === PG.uniqueViolation) {
      status = 409;
      body = { error: { code: "conflict", message: "That already exists." } };
    } else if (pgErrorCode(error) === PG.checkViolation || pgErrorCode(error) === "22P02") {
      status = 400;
      body = { error: { code: "bad_request", message: "The request contained an invalid value." } };
    }

    if (status >= 500) logger?.error("unhandled error", { error });
    else logger?.warn("request failed", { code: body.error.code, status, message: body.error.message });
    return c.json(body, status as 400);
  };
}

export async function jsonBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError(400, "bad_request", "Expected a JSON body");
  }
  return schema.parse(raw);
}

export const UUID = z.string().uuid();

export function param(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value || !UUID.safeParse(value).success) throw new AppError(404, "not_found", "Not found");
  return value;
}
