import type { Config } from "../env";
import { isRecord, parseJson, providerFetch } from "../lib/http";

/**
 * MYPGPaymentService: QRIS invoices.
 *
 * Documented operations (base https://yobasepay.net/api_my), all POST with
 * application/x-www-form-urlencoded:
 *   ?action=createpayment   api_key, amount
 *   ?action=checkstatus     api_key, trxid
 *   ?action=cancelpayment   api_key, trxid
 *
 * Only PAID and UNPAID are documented payment statuses. Anything else is
 * reported as UNDOCUMENTED and never changes an order to paid or failed.
 */

export type CreatePaymentParsed =
  | {
      ok: true;
      trxId: string;
      amount: number;
      qrImage: string | null;
      paymentUrl: string | null;
      expiredAtRaw: string | null;
      message: string;
    }
  | { ok: false; reason: "rejected" | "malformed"; message: string; trxId: string | null };

export type CheckStatusParsed =
  | { kind: "PAID"; amount: number; paidAtRaw: string | null; message: string }
  | { kind: "UNPAID"; amount: number | null; expiredAtRaw: string | null; message: string }
  | { kind: "UNDOCUMENTED"; rawStatus: string; message: string }
  | { kind: "TRX_MISMATCH"; returnedTrxId: string; message: string }
  | { kind: "AMOUNT_MISMATCH"; returnedAmount: number | null; expectedAmount: number; message: string }
  | { kind: "INVALID"; message: string };

export interface CancelParsed {
  confirmed: boolean;
  message: string;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function amount(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value === "string" && /^\d{1,12}$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

/** Only absolute http(s) URLs are accepted, so a QR image can never be a script or data URL. */
function safeUrl(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function message(json: Record<string, unknown>): string {
  return (str(json.message) ?? "").slice(0, 300);
}

export function parseCreatePayment(text: string): CreatePaymentParsed {
  const json = parseJson(text);
  if (!isRecord(json) || typeof json.status !== "boolean") {
    return { ok: false, reason: "malformed", message: "Unexpected createpayment response", trxId: null };
  }
  const data = isRecord(json.data) ? json.data : null;
  const trxId = data ? str(data.trx_id) : null;
  if (json.status !== true) return { ok: false, reason: "rejected", message: message(json) || "Payment was not created", trxId };
  const amt = data ? amount(data.amount) : null;
  if (!data || !trxId || amt === null) {
    return { ok: false, reason: "malformed", message: "createpayment response is missing trx_id or amount", trxId };
  }
  const qrImage = safeUrl(data.qr_image);
  const paymentUrl = safeUrl(data.payment_url);
  if (!qrImage && !paymentUrl) {
    return { ok: false, reason: "malformed", message: "createpayment response has neither qr_image nor payment_url", trxId };
  }
  return { ok: true, trxId, amount: amt, qrImage, paymentUrl, expiredAtRaw: str(data.expired_at), message: message(json) };
}

/** Validates a checkstatus response against the stored invoice before it is trusted. */
export function parseCheckStatus(text: string, expected: { trxId: string; amount: number }): CheckStatusParsed {
  const json = parseJson(text);
  if (!isRecord(json) || typeof json.status !== "boolean") return { kind: "INVALID", message: "Unexpected checkstatus response" };
  if (json.status !== true) return { kind: "INVALID", message: message(json) || "Payment status unavailable" };
  const data = isRecord(json.data) ? json.data : null;
  if (!data) return { kind: "INVALID", message: "checkstatus response has no data" };
  const trxId = str(data.trx_id);
  if (!trxId) return { kind: "INVALID", message: "checkstatus response has no trx_id" };
  if (trxId !== expected.trxId) return { kind: "TRX_MISMATCH", returnedTrxId: trxId, message: "Returned trx_id does not match the invoice" };
  const status = str(data.status);
  const amt = amount(data.amount);
  if (status === "PAID") {
    if (amt !== expected.amount) {
      return { kind: "AMOUNT_MISMATCH", returnedAmount: amt, expectedAmount: expected.amount, message: "Paid amount does not match the invoice" };
    }
    return { kind: "PAID", amount: amt, paidAtRaw: str(data.paid_at), message: message(json) };
  }
  if (status === "UNPAID") return { kind: "UNPAID", amount: amt, expiredAtRaw: str(data.expired_at), message: message(json) };
  return { kind: "UNDOCUMENTED", rawStatus: (status ?? String(data.status)).slice(0, 40), message: message(json) };
}

export function parseCancelPayment(text: string): CancelParsed {
  const json = parseJson(text);
  if (!isRecord(json) || typeof json.status !== "boolean") return { confirmed: false, message: "Unexpected cancelpayment response" };
  return { confirmed: json.status === true, message: message(json) };
}

function requireKey(config: Config): string {
  if (!config.mypgApiKey) throw new Error("MYPG_API_KEY is not configured");
  return config.mypgApiKey;
}

async function post(config: Config, action: string, fields: Record<string, string>, timeoutMs: number) {
  const url = new URL(config.mypgBase);
  url.searchParams.set("action", action);
  const body = new URLSearchParams({ api_key: requireKey(config), ...fields });
  return providerFetch(
    "MYPG",
    url.toString(),
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: body.toString() },
    timeoutMs,
  );
}

export async function createPayment(config: Config, requestedAmount: number): Promise<CreatePaymentParsed> {
  const res = await post(config, "createpayment", { amount: String(requestedAmount) }, 15_000);
  if (!res.ok && !res.text) return { ok: false, reason: "malformed", message: `MYPG responded HTTP ${res.status}`, trxId: null };
  return parseCreatePayment(res.text);
}

export async function checkPaymentStatus(config: Config, expected: { trxId: string; amount: number }): Promise<CheckStatusParsed> {
  const res = await post(config, "checkstatus", { trxid: expected.trxId }, 10_000);
  if (!res.ok && !res.text) return { kind: "INVALID", message: `MYPG responded HTTP ${res.status}` };
  return parseCheckStatus(res.text, expected);
}

export async function cancelPayment(config: Config, trxId: string): Promise<CancelParsed> {
  const res = await post(config, "cancelpayment", { trxid: trxId }, 10_000);
  if (!res.ok && !res.text) return { confirmed: false, message: `MYPG responded HTTP ${res.status}` };
  return parseCancelPayment(res.text);
}
