import type { Config } from "../env";
import { providerFetch } from "../lib/http";

/**
 * JKT48ConnectH2HService.
 *
 * Documented endpoints (base https://h2h.jkt48connect.com):
 *   GET /trx?product=&dest=&refID=        top-up, and nickname checks (CEKML, CEKFF, ...)
 *   GET /trx-check?product=&dest=&refID=  status of an earlier /trx with the same values
 *
 * Responses are plain text. HTTP 200 alone proves nothing: the business status
 * is read from the text, and anything unrecognised is reported as UNKNOWN so
 * the caller keeps the transaction uncertain and reconciles it.
 */

export type H2HStatus = "SUCCESS" | "PENDING" | "FAILED" | "UNKNOWN";

export interface H2HParsed {
  status: H2HStatus;
  sn: string | null;
  /** Provider text with the remaining balance redacted. Safe to persist, never shown to guests. */
  redacted: string;
  /** Why the parser refused to classify, when status is UNKNOWN. */
  note: string | null;
}

export interface NicknameParsed {
  status: "SUCCESS" | "FAILED" | "UNKNOWN";
  nickname: string | null;
  server: string | null;
  redacted: string;
  note: string | null;
}

export interface H2HRequest {
  product: string;
  dest: string;
  refID: string;
}

const BALANCE = /(Sisa\s+)?Saldo\s*:?\s*Rp\.?\s*[\d.,]+/gi;

/** The provider's remaining balance is operational data and never leaves the backend. */
export function redactBalance(text: string): string {
  return text.replace(BALANCE, (m, sisa: string | undefined) => `${sisa ? "Sisa " : ""}Saldo [disembunyikan]`);
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Uppercase SUKSES, as documented; "TIDAK SUKSES" is not a success.
const SUCCESS = /(?<!TIDAK\s)\bSUKSES\b/;
const FAILURE = /\bGAGAL\b/i;
const PENDING = /sedang\s+diproses|masih\s+dalam\s+antrean|dalam\s+antrean|proses\s+provider|mohon\s+tunggu/i;

/**
 * Checks the "<product> ke <dest>" subject and an optional "RefID: ..." against
 * what was sent. A response about a different transaction is never trusted.
 */
function subjectMismatch(text: string, expected: H2HRequest): string | null {
  const subject = /(\S+)\s+ke\s+([^\s:.]+)/i.exec(text);
  if (subject) {
    if (subject[1] !== expected.product) return `product mismatch (${subject[1]})`;
    if (subject[2] !== expected.dest) return "destination mismatch";
  }
  const ref = /RefID\s*:?\s*([A-Za-z0-9_-]+)/i.exec(text);
  if (ref && ref[1] !== expected.refID) return "refID mismatch";
  return null;
}

function extractSn(text: string): string | null {
  const m = /\bSN\s*:\s*(.+?)(?=\.\s+(?:Sisa\s+)?Saldo\b|\.\s*$|$)/i.exec(text);
  const sn = m?.[1]?.trim();
  return sn ? sn.slice(0, 200) : null;
}

function classify(text: string, expected: H2HRequest): H2HParsed {
  const t = normalise(text);
  const redacted = redactBalance(t);
  if (!t) return { status: "UNKNOWN", sn: null, redacted, note: "empty response" };
  const mismatch = subjectMismatch(t, expected);
  if (mismatch) return { status: "UNKNOWN", sn: null, redacted, note: mismatch };

  const success = SUCCESS.test(t);
  const failure = FAILURE.test(t);
  const pending = PENDING.test(t);
  const signals = [success, failure, pending].filter(Boolean).length;
  if (signals !== 1) {
    return { status: "UNKNOWN", sn: null, redacted, note: signals === 0 ? "no recognised status" : "conflicting statuses" };
  }
  if (success) return { status: "SUCCESS", sn: extractSn(t), redacted, note: null };
  if (pending) return { status: "PENDING", sn: null, redacted, note: null };
  return { status: "FAILED", sn: null, redacted, note: null };
}

/** Parses a /trx top-up response. */
export function parseTrxResponse(text: string, expected: H2HRequest): H2HParsed {
  return classify(text, expected);
}

/**
 * Parses a /trx-check response. Only SUKSES and the queued/processing wording
 * are documented; a GAGAL here is reported as FAILED but always lands in the
 * admin review queue, and anything else stays UNKNOWN.
 */
export function parseTrxCheckResponse(text: string, expected: H2HRequest): H2HParsed {
  return classify(text, expected);
}

/** Parses a nickname-check /trx response, e.g. "CEKML ke 123 SUKSES. a.n. ZeeJKT48 (Server: 1234). Sisa Saldo ..." */
export function parseNicknameResponse(text: string, expected: H2HRequest): NicknameParsed {
  const base = classify(text, expected);
  const t = normalise(text);
  if (base.status === "SUCCESS") {
    const m = /\ba\.n\.?\s*(.+?)(?:\s*\(\s*Server\s*:?\s*([^)]*?)\s*\))?(?=\.\s+(?:Sisa\s+)?Saldo\b|\.?\s*$)/i.exec(t);
    const nickname = m?.[1]?.trim().slice(0, 64) || null;
    const server = m?.[2]?.trim().slice(0, 32) || null;
    return { status: "SUCCESS", nickname, server, redacted: base.redacted, note: nickname ? null : "account name not present" };
  }
  if (base.status === "FAILED") return { status: "FAILED", nickname: null, server: null, redacted: base.redacted, note: null };
  // A nickname check never "pends" for the customer; treat it as unconfirmed.
  return { status: "UNKNOWN", nickname: null, server: null, redacted: base.redacted, note: base.note ?? "pending" };
}

function buildUrl(config: Config, path: "/trx" | "/trx-check", req: H2HRequest): string {
  const url = new URL(path, `${config.h2hBase}/`);
  url.searchParams.set("product", req.product);
  url.searchParams.set("dest", req.dest);
  url.searchParams.set("refID", req.refID);
  return url.toString();
}

export interface H2HRawResult {
  httpStatus: number;
  ok: boolean;
  text: string;
}

async function call(config: Config, path: "/trx" | "/trx-check", req: H2HRequest, timeoutMs: number): Promise<H2HRawResult> {
  const res = await providerFetch("H2H", buildUrl(config, path, req), { method: "GET", headers: { Accept: "text/plain" } }, timeoutMs);
  return { httpStatus: res.status, ok: res.ok, text: res.text };
}

/** Submits a top-up. Throws ProviderCallError on timeout/network: outcome unknown, never retried blindly. */
export function submitTopup(config: Config, req: H2HRequest): Promise<H2HRawResult> {
  return call(config, "/trx", req, 25_000);
}

export function checkTopup(config: Config, req: H2HRequest): Promise<H2HRawResult> {
  return call(config, "/trx-check", req, 15_000);
}

export function checkNickname(config: Config, req: H2HRequest): Promise<H2HRawResult> {
  return call(config, "/trx", req, 15_000);
}

export { buildUrl as buildH2HUrl };
