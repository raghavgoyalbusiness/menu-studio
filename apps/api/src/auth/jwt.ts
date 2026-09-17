import { createHmac, timingSafeEqual } from "node:crypto";

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export interface LocalJwtClaims {
  sub: string;
  email: string | null;
  role: "authenticated";
  aud: "authenticated";
  iat: number;
  exp: number;
}

/** HS256 JWT in the same shape Supabase issues, for local development auth. */
export function signLocalJwt(claims: { sub: string; email: string | null }, secret: string, ttlSeconds = 60 * 60 * 24 * 7, now = Date.now()): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const iat = Math.floor(now / 1000);
  const payload: LocalJwtClaims = { sub: claims.sub, email: claims.email, role: "authenticated", aud: "authenticated", iat, exp: iat + ttlSeconds };
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyLocalJwt(token: string, secret: string, now = Date.now()): LocalJwtClaims | null {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url"));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: string };
    if (parsedHeader.alg !== "HS256") return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<LocalJwtClaims>;
    if (typeof claims.sub !== "string" || typeof claims.exp !== "number" || claims.exp * 1000 < now) return null;
    return { sub: claims.sub, email: claims.email ?? null, role: "authenticated", aud: "authenticated", iat: claims.iat ?? 0, exp: claims.exp };
  } catch {
    return null;
  }
}
