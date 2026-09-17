const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export type IdPrefix = "sec" | "itm" | "blk" | "pg";

/** Short document-internal id: prefix + 8 base36 chars. */
export function shortId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let out = `${prefix}_`;
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Mint an id that is not already in `taken`. */
export function uniqueShortId(prefix: IdPrefix, taken: ReadonlySet<string>): string {
  for (;;) {
    const id = shortId(prefix);
    if (!taken.has(id)) return id;
  }
}

export function uuid(): string {
  return globalThis.crypto.randomUUID();
}
