import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

export type Bucket = "uploads" | "exports" | "assets";
export const BUCKETS: Bucket[] = ["uploads", "exports", "assets"];

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
}

export interface Storage {
  put(bucket: Bucket, key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(bucket: Bucket, key: string): Promise<StoredObject | null>;
  signedUrl(bucket: Bucket, key: string, expiresInSeconds: number, downloadName?: string): Promise<string>;
  remove(bucket: Bucket, keys: string[]): Promise<void>;
}

function safeKey(key: string): string {
  const normalized = normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.startsWith("/") || normalized.includes("..")) throw new Error(`Unsafe storage key: ${key}`);
  return normalized;
}

function signature(secret: string, bucket: string, key: string, exp: number, download: string): string {
  return createHmac("sha256", secret).update(`${bucket}\n${key}\n${exp}\n${download}`).digest("base64url");
}

/** Filesystem storage for local development. Signed URLs are served by the API's /files route. */
export class LocalStorage implements Storage {
  private readonly dir: string;
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(dir: string, baseUrl: string, secret: string) {
    this.dir = dir;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.secret = secret;
  }

  private path(bucket: Bucket, key: string): string {
    return join(this.dir, bucket, safeKey(key));
  }

  async put(bucket: Bucket, key: string, body: Uint8Array, contentType: string): Promise<void> {
    const file = this.path(bucket, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  }

  async get(bucket: Bucket, key: string): Promise<StoredObject | null> {
    const file = this.path(bucket, key);
    try {
      const [body, meta] = await Promise.all([readFile(file), readFile(`${file}.meta.json`, "utf8").catch(() => "{}")]);
      const contentType = (JSON.parse(meta) as { contentType?: string }).contentType ?? "application/octet-stream";
      return { body: new Uint8Array(body), contentType };
    } catch {
      return null;
    }
  }

  async signedUrl(bucket: Bucket, key: string, expiresInSeconds: number, downloadName = ""): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const sig = signature(this.secret, bucket, key, exp, downloadName);
    const params = new URLSearchParams({ exp: String(exp), sig });
    if (downloadName) params.set("download", downloadName);
    return `${this.baseUrl}/files/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}?${params.toString()}`;
  }

  verify(bucket: string, key: string, exp: number, sig: string, downloadName = ""): boolean {
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
    const expected = Buffer.from(signature(this.secret, bucket, key, exp, downloadName));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async remove(bucket: Bucket, keys: string[]): Promise<void> {
    await Promise.all(keys.flatMap((k) => [rm(this.path(bucket, k), { force: true }), rm(`${this.path(bucket, k)}.meta.json`, { force: true })]));
  }
}

/** Supabase Storage with the service role. Buckets are private; access is by signed URL. */
export class SupabaseStorage implements Storage {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async put(bucket: Bucket, key: string, body: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).upload(safeKey(key), body, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }

  async get(bucket: Bucket, key: string): Promise<StoredObject | null> {
    const { data, error } = await this.client.storage.from(bucket).download(safeKey(key));
    if (error || !data) return null;
    return { body: new Uint8Array(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
  }

  async signedUrl(bucket: Bucket, key: string, expiresInSeconds: number, downloadName?: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(safeKey(key), expiresInSeconds, downloadName ? { download: downloadName } : undefined);
    if (error || !data) throw new Error(`Could not sign URL: ${error?.message ?? "unknown"}`);
    return data.signedUrl;
  }

  async remove(bucket: Bucket, keys: string[]): Promise<void> {
    if (!keys.length) return;
    const { error } = await this.client.storage.from(bucket).remove(keys.map(safeKey));
    if (error) throw new Error(`Storage remove failed: ${error.message}`);
  }
}
