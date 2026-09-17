/**
 * Short-lived HMAC tokens that let the export worker open the print route without a
 * user session. Uses Web Crypto so it runs in Node, the worker and the browser.
 */

export interface PrintTokenClaims {
  projectId: string;
  versionId: string;
  purpose: "print" | "publish";
  /** Unix seconds. */
  exp: number;
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function key(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signPrintToken(
  claims: Omit<PrintTokenClaims, "exp">,
  secret: string,
  ttlSeconds = 300,
  now = Date.now(),
): Promise<string> {
  const payload: PrintTokenClaims = { ...claims, exp: Math.floor(now / 1000) + ttlSeconds };
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", await key(secret), encoder.encode(body)));
  return `${body}.${base64url(signature)}`;
}

export async function verifyPrintToken(token: string, secret: string, now = Date.now()): Promise<PrintTokenClaims | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  let valid = false;
  try {
    valid = await globalThis.crypto.subtle.verify("HMAC", await key(secret), fromBase64url(signature), encoder.encode(body));
  } catch {
    return null;
  }
  if (!valid) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as Partial<PrintTokenClaims>;
    if (
      typeof claims.projectId !== "string" ||
      typeof claims.versionId !== "string" ||
      (claims.purpose !== "print" && claims.purpose !== "publish") ||
      typeof claims.exp !== "number"
    ) {
      return null;
    }
    if (claims.exp * 1000 < now) return null;
    return { projectId: claims.projectId, versionId: claims.versionId, purpose: claims.purpose, exp: claims.exp };
  } catch {
    return null;
  }
}
