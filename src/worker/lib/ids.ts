// Crockford base32 without I, L, O, U: unambiguous when read aloud or retyped.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return out;
}

/** Public order reference shown to guests, e.g. `JC-7K3FQ-W2P7Q9`. ~55 bits. */
export function newOrderRef(): string {
  return `JC-${randomCode(5)}-${randomCode(6)}`;
}

/** H2H fulfillment refID, e.g. `OC-9K3F8-W2P7Q` (format from the provider example). */
export function newFulfillmentRef(): string {
  return `OC-${randomCode(5)}-${randomCode(5)}`;
}

/** H2H nickname-check refID, e.g. `NK1728648102AB`. */
export function newNicknameRef(nowMs: number): string {
  return `NK${Math.floor(nowMs / 1000)}${randomCode(4)}`;
}

export function uuid(): string {
  return crypto.randomUUID();
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison for bearer tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export const ORDER_REF_PATTERN = /^JC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{6}$/;
export const CLIENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
