import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthClaims } from "@menu-studio/server-core";
import { createHash, randomBytes } from "node:crypto";
import { signLocalJwt, verifyLocalJwt } from "./jwt.ts";

export interface AuthVerifier {
  mode: "local" | "supabase";
  verify(token: string): Promise<AuthClaims | null>;
}

export function localVerifier(secret: string): AuthVerifier {
  return {
    mode: "local",
    verify: async (token) => {
      const claims = verifyLocalJwt(token, secret);
      return claims ? { sub: claims.sub, email: claims.email } : null;
    },
  };
}

/** Verifies Supabase access tokens (JWKS for asymmetric keys; Auth server otherwise). */
export function supabaseVerifier(url: string, anonKey: string): AuthVerifier {
  const client: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    mode: "supabase",
    verify: async (token) => {
      const { data, error } = await client.auth.getClaims(token);
      if (error || !data?.claims?.sub) return null;
      const email = typeof data.claims.email === "string" ? data.claims.email : null;
      return { sub: data.claims.sub, email };
    },
  };
}

/**
 * Magic links for local development. Links are printed to the API log and returned to the
 * caller (the dev UI shows them), standing in for Supabase's email delivery.
 */
export class LocalMagicLinks {
  private readonly tokens = new Map<string, { email: string; exp: number }>();
  private readonly secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  create(email: string, ttlMs = 15 * 60 * 1000): string {
    const token = randomBytes(24).toString("base64url");
    this.tokens.set(createHash("sha256").update(token).digest("hex"), { email: email.toLowerCase(), exp: Date.now() + ttlMs });
    return token;
  }

  consume(token: string): string | null {
    const key = createHash("sha256").update(token).digest("hex");
    const entry = this.tokens.get(key);
    this.tokens.delete(key);
    if (!entry || entry.exp < Date.now()) return null;
    return entry.email;
  }

  issue(user: { id: string; email: string | null }): string {
    return signLocalJwt({ sub: user.id, email: user.email }, this.secret);
  }
}
