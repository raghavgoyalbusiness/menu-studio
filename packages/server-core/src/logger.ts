export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
}

/** Structured JSON logs, one line per event, with bound fields such as requestId. */
export function createLogger(service: string, bound: Record<string, unknown> = {}, minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info"): Logger {
  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    if (process.env.VITEST && level !== "error") return;
    const entry: Record<string, unknown> = { time: new Date().toISOString(), level, service, msg, ...bound };
    for (const [k, v] of Object.entries(fields ?? {})) entry[k] = serialize(v);
    const line = JSON.stringify(entry);
    if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (fields) => createLogger(service, { ...bound, ...fields }, minLevel),
  };
}
