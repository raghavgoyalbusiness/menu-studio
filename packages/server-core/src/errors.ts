import type { PlanId } from "@menu-studio/shared";

/** Typed application errors. The API maps them to HTTP responses in one place. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly issues: string[] | undefined;
  readonly upgradeTo: PlanId | undefined;

  constructor(status: number, code: string, message: string, extra: { retryable?: boolean; issues?: string[]; upgradeTo?: PlanId } = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.retryable = extra.retryable ?? false;
    this.issues = extra.issues;
    this.upgradeTo = extra.upgradeTo;
  }
}

export const notFound = (what: string) => new AppError(404, "not_found", `${what} not found`);
export const forbidden = (message = "You do not have access to this") => new AppError(403, "forbidden", message);
export const badRequest = (message: string, issues?: string[]) => new AppError(400, "bad_request", message, issues ? { issues } : {});
export const conflict = (code: string, message: string) => new AppError(409, code, message, { retryable: true });
export const unauthorized = (message = "Please sign in") => new AppError(401, "unauthorized", message);
export const paymentRequired = (message: string, upgradeTo: PlanId) => new AppError(402, "plan_limit", message, { upgradeTo });
export const tooManyRequests = (message: string) => new AppError(429, "rate_limited", message, { retryable: true });
