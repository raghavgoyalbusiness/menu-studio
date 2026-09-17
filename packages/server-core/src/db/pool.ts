import pg from "pg";

export type Queryable = Pick<pg.PoolClient, "query">;

export interface AuthClaims {
  sub: string;
  email?: string | null;
}

export interface Db {
  pool: pg.Pool;
  /**
   * Run `fn` in a transaction as the `authenticated` role with the user's JWT claims set,
   * so every Supabase RLS policy applies exactly as it would through PostgREST.
   */
  asUser<T>(claims: AuthClaims, fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Run `fn` in a transaction as the connection owner (bypasses RLS). Server-only paths. */
  asService<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// jsonb and json are parsed by default; keep bigint as string and convert at the edge.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => value);

export function createDb(connectionString: string, options: { max?: number } = {}): Db {
  if (/:6543\b/.test(connectionString)) {
    throw new Error("DATABASE_URL points at Supabase's transaction pooler (6543). Use the session pooler or a direct connection.");
  }
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10, idleTimeoutMillis: 30_000 });
  pool.on("error", () => {
    // Idle client errors (e.g. database restarts) surface on the next query.
  });

  async function transaction<T>(setup: (client: pg.PoolClient) => Promise<void>, fn: (q: Queryable) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await setup(client);
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    pool,
    asUser: (claims, fn) =>
      transaction(async (client) => {
        const jwt = JSON.stringify({ sub: claims.sub, email: claims.email ?? null, role: "authenticated", aud: "authenticated" });
        await client.query(
          "select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', 'authenticated', true)",
          [jwt, claims.sub],
        );
        await client.query("set local role authenticated");
      }, fn),
    asService: (fn) => transaction(async () => undefined, fn),
    close: () => pool.end(),
  };
}

/** Postgres error codes the API maps to HTTP responses. */
export const PG = {
  insufficientPrivilege: "42501",
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  raiseException: "P0001",
} as const;

export function pgErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

export async function waitForDatabase(db: Db, timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      await db.pool.query("select 1");
      return;
    } catch (error) {
      if (Date.now() - started > timeoutMs) throw error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
