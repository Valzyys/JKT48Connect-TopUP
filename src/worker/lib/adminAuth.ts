/**
 * Admin sign-in: an email and a password checked against a PBKDF2 hash kept as
 * a Worker secret, then a short-lived session token signed with ADMIN_TOKEN.
 * The password itself is never stored or committed; `npm run admin:hash`
 * produces the hash (scripts/admin-hash.mjs uses the same format).
 *
 * Stored hash format: pbkdf2-sha256$<iterations>$<salt base64>$<hash base64>
 */

const enc = new TextEncoder();
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
// Workers caps PBKDF2 at 100k iterations.
const MAX_ITERATIONS = 100_000;

function b64(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function b64url(bytes: ArrayBuffer): string {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Constant-time comparison of two byte arrays. */
function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string, iterations = MAX_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(await pbkdf2(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  const iterations = Number(iter);
  if (scheme !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS || !salt || !hash) return false;
  try {
    return same(await pbkdf2(password, unb64(salt), iterations), unb64(hash));
  } catch {
    return false;
  }
}

async function hmac(key: string, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(message));
}

/** `s1.<expiry ms>.<signature>`; the signature covers the expiry. */
export async function signSession(key: string, expiresAt: number): Promise<string> {
  return `s1.${expiresAt}.${b64url(await hmac(key, `admin-session:${expiresAt}`))}`;
}

export async function verifySession(key: string, token: string, nowMs: number): Promise<boolean> {
  const [version, exp, sig] = token.split(".");
  const expiresAt = Number(exp);
  if (version !== "s1" || !Number.isSafeInteger(expiresAt) || !sig || expiresAt <= nowMs) return false;
  const expected = b64url(await hmac(key, `admin-session:${expiresAt}`));
  return same(enc.encode(sig), enc.encode(expected));
}
