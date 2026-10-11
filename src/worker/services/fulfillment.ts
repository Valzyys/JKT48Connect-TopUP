import { type AppContext, backoffSeconds } from "../context";
import { changed, type FulfillmentRow, getFulfillment, getOrderById, logEvent } from "../db";
import { ProviderCallError } from "../lib/http";
import { newFulfillmentRef, uuid } from "../lib/ids";
import { addSeconds, iso } from "../lib/time";
import { checkTopup, type H2HParsed, parseTrxCheckResponse, parseTrxResponse, redactBalance, submitTopup } from "./h2h";

/**
 * H2H fulfillment state machine.
 *
 *   SUBMITTING -> SUCCESS | PROCESSING | FAILED | UNCERTAIN
 *   PROCESSING / UNCERTAIN -> (trx-check) SUCCESS | PROCESSING | FAILED | unchanged
 *
 * Invariants:
 * - The refID is persisted before /trx is called and reused for every /trx-check.
 * - /trx is called at most once per fulfillment row. Timeouts and unknown
 *   responses become UNCERTAIN and are reconciled through /trx-check only.
 * - At most one fulfillment is started per paid order (conditional update).
 * - A new attempt is only created by an explicit admin action after FAILED.
 */

const UNRESOLVED_REVIEW_AFTER_MS = 24 * 60 * 60 * 1000;
const STALE_SUBMIT_SECONDS = 120;

export async function startFulfillment(ctx: AppContext, orderId: string): Promise<FulfillmentRow | null> {
  const nowIso = iso(ctx.now());
  const lock = await ctx.db
    .prepare(
      `UPDATE orders SET fulfillment_status = 'SUBMITTING', updated_at = ?
       WHERE id = ? AND payment_status = 'PAID' AND fulfillment_status = 'NOT_STARTED' AND needs_review = 0`,
    )
    .bind(nowIso, orderId)
    .run();
  if (!changed(lock)) return null;

  const order = (await getOrderById(ctx.db, orderId))!;
  const prev = await ctx.db.prepare("SELECT COALESCE(MAX(attempt), 0) AS n FROM fulfillments WHERE order_id = ?").bind(orderId).first<{ n: number }>();
  const id = uuid();
  const refId = newFulfillmentRef();
  await ctx.db.batch([
    ctx.db
      .prepare(
        `INSERT INTO fulfillments (id, order_id, attempt, ref_id, product, dest, status, next_check_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTING', ?, ?, ?)`,
      )
      // If the Worker dies mid-request, the row becomes due for /trx-check after this delay.
      .bind(id, orderId, (prev?.n ?? 0) + 1, refId, order.product_code, order.dest, addSeconds(ctx.now(), STALE_SUBMIT_SECONDS), nowIso, nowIso),
    ctx.db.prepare("UPDATE orders SET current_fulfillment_id = ?, updated_at = ? WHERE id = ?").bind(id, nowIso, orderId),
  ]);
  await logEvent(ctx.db, orderId, "fulfillment_submitting", { refId, product: order.product_code }, nowIso);

  const row = (await getFulfillment(ctx.db, id))!;
  return submit(ctx, row);
}

async function submit(ctx: AppContext, f: FulfillmentRow): Promise<FulfillmentRow> {
  const req = { product: f.product, dest: f.dest, refID: f.ref_id };
  await ctx.db.prepare("UPDATE fulfillments SET submitted_at = ? WHERE id = ?").bind(iso(ctx.now()), f.id).run();
  let parsed: H2HParsed;
  try {
    const res = await submitTopup(ctx.config, req);
    parsed = res.ok ? parseTrxResponse(res.text, req) : { status: "UNKNOWN", sn: null, redacted: redactBalance(res.text.slice(0, 500)), note: `HTTP ${res.httpStatus}` };
  } catch (err) {
    // Timeout or network failure: the top-up may have gone through. Never resubmit.
    const note = err instanceof ProviderCallError ? `${err.kind}: ${err.message}` : "submit error";
    parsed = { status: "UNKNOWN", sn: null, redacted: "", note };
  }
  return apply(ctx, f, parsed, "trx");
}

async function apply(ctx: AppContext, f: FulfillmentRow, parsed: H2HParsed, source: "trx" | "trx-check"): Promise<FulfillmentRow> {
  const nowMs = ctx.now();
  const nowIso = iso(nowMs);
  const checks = source === "trx-check" ? f.check_count + 1 : f.check_count;
  const next = addSeconds(nowMs, backoffSeconds(checks));
  const response = parsed.redacted ? parsed.redacted.slice(0, 1000) : f.last_response;

  let status = f.status;
  let orderStatus: string | null = null;
  let review: string | null = null;
  switch (parsed.status) {
    case "SUCCESS":
      status = "SUCCESS";
      orderStatus = "SUCCESS";
      break;
    case "PENDING":
      status = "PROCESSING";
      orderStatus = "PROCESSING";
      break;
    case "FAILED":
      status = "FAILED";
      orderStatus = "FAILED";
      review = source === "trx" ? "fulfillment_failed" : "fulfillment_failed_on_check";
      break;
    case "UNKNOWN":
      // Keep PROCESSING when the provider already acknowledged it; otherwise uncertain.
      if (f.status === "SUBMITTING") {
        status = "UNCERTAIN";
        orderStatus = "UNCERTAIN";
      }
      break;
  }
  const terminal = status === "SUCCESS" || status === "FAILED";

  const update = await ctx.db
    .prepare(
      `UPDATE fulfillments SET status = ?, sn = COALESCE(?, sn), last_response = ?, check_count = ?, last_checked_at = ?,
         next_check_at = ?, completed_at = CASE WHEN ? THEN ? ELSE completed_at END, updated_at = ?
       WHERE id = ? AND status NOT IN ('SUCCESS', 'FAILED')`,
    )
    .bind(status, parsed.sn, response, checks, source === "trx-check" ? nowIso : f.last_checked_at, terminal ? null : next, terminal ? 1 : 0, nowIso, nowIso, f.id)
    .run();
  if (!changed(update)) return (await getFulfillment(ctx.db, f.id))!;

  if (orderStatus) {
    await ctx.db
      .prepare(
        `UPDATE orders SET fulfillment_status = ?, needs_review = CASE WHEN ? IS NULL THEN needs_review ELSE 1 END,
           review_reason = COALESCE(?, review_reason), updated_at = ?
         WHERE id = ? AND current_fulfillment_id = ? AND fulfillment_status NOT IN ('SUCCESS', 'FAILED')`,
      )
      .bind(orderStatus, review, review, nowIso, f.order_id, f.id)
      .run();
  }
  await logEvent(
    ctx.db,
    f.order_id,
    `fulfillment_${source === "trx" ? "submitted" : "checked"}`,
    { refId: f.ref_id, parsed: parsed.status, status, sn: parsed.sn, note: parsed.note, response: parsed.redacted.slice(0, 300) },
    nowIso,
  );

  if (!terminal && f.submitted_at && nowMs - Date.parse(f.submitted_at) > UNRESOLVED_REVIEW_AFTER_MS) {
    await ctx.db
      .prepare("UPDATE orders SET needs_review = 1, review_reason = 'fulfillment_unresolved_24h', updated_at = ? WHERE id = ? AND needs_review = 0")
      .bind(nowIso, f.order_id)
      .run();
  }
  return (await getFulfillment(ctx.db, f.id))!;
}

/**
 * Reconciles a pending or uncertain fulfillment through /trx-check with the
 * original product, dest and refID. A lease on next_check_at keeps concurrent
 * callers (cron, status page) from checking the same row at once.
 */
export async function checkFulfillment(ctx: AppContext, fulfillmentId: string): Promise<FulfillmentRow | null> {
  const nowMs = ctx.now();
  const lease = await ctx.db
    .prepare(
      `UPDATE fulfillments SET next_check_at = ? WHERE id = ? AND status IN ('SUBMITTING', 'PROCESSING', 'UNCERTAIN')
       AND (next_check_at IS NULL OR next_check_at <= ?)`,
    )
    .bind(addSeconds(nowMs, 60), fulfillmentId, iso(nowMs))
    .run();
  if (!changed(lease)) return null;
  const f = (await getFulfillment(ctx.db, fulfillmentId))!;
  const req = { product: f.product, dest: f.dest, refID: f.ref_id };
  try {
    const res = await checkTopup(ctx.config, req);
    const parsed: H2HParsed = res.ok
      ? parseTrxCheckResponse(res.text, req)
      : { status: "UNKNOWN", sn: null, redacted: redactBalance(res.text.slice(0, 500)), note: `HTTP ${res.httpStatus}` };
    return apply(ctx, f, parsed, "trx-check");
  } catch (err) {
    const note = err instanceof ProviderCallError ? `${err.kind}: ${err.message}` : "check error";
    const checks = f.check_count + 1;
    await ctx.db
      .prepare("UPDATE fulfillments SET check_count = ?, last_checked_at = ?, next_check_at = ?, updated_at = ? WHERE id = ?")
      .bind(checks, iso(nowMs), addSeconds(nowMs, backoffSeconds(checks)), iso(nowMs), f.id)
      .run();
    await logEvent(ctx.db, f.order_id, "fulfillment_check_error", { refId: f.ref_id, note }, iso(nowMs));
    return getFulfillment(ctx.db, f.id);
  }
}

/** Admin-only: after a definitive FAILED, start a new attempt with a new refID. */
export async function retryFailedFulfillment(ctx: AppContext, orderId: string): Promise<FulfillmentRow | null> {
  const nowIso = iso(ctx.now());
  const reset = await ctx.db
    .prepare(
      `UPDATE orders SET fulfillment_status = 'NOT_STARTED', needs_review = 0, review_reason = NULL, updated_at = ?
       WHERE id = ? AND payment_status = 'PAID' AND fulfillment_status = 'FAILED'`,
    )
    .bind(nowIso, orderId)
    .run();
  if (!changed(reset)) return null;
  await logEvent(ctx.db, orderId, "admin_retry_fulfillment", null, nowIso);
  return startFulfillment(ctx, orderId);
}
