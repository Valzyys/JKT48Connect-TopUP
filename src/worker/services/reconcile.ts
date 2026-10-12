import type { AppContext } from "../context";
import { getOrderById, getPayment, logEvent } from "../db";
import { iso } from "../lib/time";
import { catalogNeedsRefresh, syncCatalog } from "./catalog";
import { checkFulfillment, startFulfillment } from "./fulfillment";
import { checkPayment, requestCancel } from "./orders";

/**
 * Scheduled reconciliation (cron, every minute). Each step is bounded so a
 * provider outage cannot turn into a burst of requests.
 */
export interface ReconcileReport {
  catalog: "skipped" | "ok" | "failed";
  paymentsChecked: number;
  cancelsRetried: number;
  fulfillmentsStarted: number;
  fulfillmentsChecked: number;
  staleInvoicesReleased: number;
}

export async function runReconcile(ctx: AppContext): Promise<ReconcileReport> {
  const report: ReconcileReport = { catalog: "skipped", paymentsChecked: 0, cancelsRetried: 0, fulfillmentsStarted: 0, fulfillmentsChecked: 0, staleInvoicesReleased: 0 };
  const nowIso = iso(ctx.now());

  if (ctx.config.catalogId && (await catalogNeedsRefresh(ctx.db, ctx.config, ctx.now()))) {
    report.catalog = (await syncCatalog(ctx.db, ctx.config, ctx.now())).ok ? "ok" : "failed";
  }

  // Invoice creation that never finished (Worker evicted mid-call): let the guest retry.
  const stale = await ctx.db
    .prepare("SELECT id FROM orders WHERE payment_status = 'INVOICE_CREATING' AND invoice_lock_until < ? LIMIT 20")
    .bind(nowIso)
    .all<{ id: string }>();
  for (const { id } of stale.results) {
    const res = await ctx.db
      .prepare("UPDATE orders SET payment_status = 'INVOICE_FAILED', invoice_lock_until = NULL, updated_at = ? WHERE id = ? AND payment_status = 'INVOICE_CREATING' AND invoice_lock_until < ?")
      .bind(nowIso, id, nowIso)
      .run();
    if ((res.meta?.changes ?? 0) > 0) {
      await ctx.db.prepare("UPDATE payments SET status = 'FAILED', last_message = 'creation interrupted', updated_at = ? WHERE order_id = ? AND status = 'CREATING'").bind(nowIso, id).run();
      await logEvent(ctx.db, id, "invoice_creation_interrupted", null, nowIso);
      report.staleInvoicesReleased++;
    }
  }

  if (ctx.config.mypgApiKey) {
    const due = await ctx.db
      .prepare(
        `SELECT order_id, status FROM payments
         WHERE (status IN ('UNPAID', 'CANCEL_REQUESTED') OR (status = 'CANCELLED' AND cancel_confirmed_at > ?))
           AND (next_check_at IS NULL OR next_check_at <= ?)
         ORDER BY next_check_at LIMIT 25`,
      )
      .bind(iso(ctx.now() - 30 * 60_000), nowIso)
      .all<{ order_id: string; status: string }>();
    for (const row of due.results) {
      const outcome = await checkPayment(ctx, row.order_id);
      if (outcome !== "skipped") report.paymentsChecked++;
      if (row.status === "CANCEL_REQUESTED") {
        const order = await getOrderById(ctx.db, row.order_id);
        const payment = order ? await getPayment(ctx.db, order.current_payment_id) : null;
        if (order?.payment_status === "CANCEL_REQUESTED" && payment) {
          const expired = payment.expires_at !== null && ctx.now() > Date.parse(payment.expires_at);
          await requestCancel(ctx, row.order_id, expired ? "expired" : "customer", { skipPrecheck: true });
          report.cancelsRetried++;
        }
      }
    }
  }

  // Paid orders whose fulfillment never started (e.g. deferred work was dropped).
  const paid = await ctx.db
    .prepare("SELECT id FROM orders WHERE payment_status = 'PAID' AND fulfillment_status = 'NOT_STARTED' AND needs_review = 0 LIMIT 10")
    .all<{ id: string }>();
  for (const { id } of paid.results) {
    if (await startFulfillment(ctx, id)) report.fulfillmentsStarted++;
  }

  const fulfillments = await ctx.db
    .prepare("SELECT id FROM fulfillments WHERE status IN ('SUBMITTING', 'PROCESSING', 'UNCERTAIN') AND next_check_at <= ? ORDER BY next_check_at LIMIT 25")
    .bind(nowIso)
    .all<{ id: string }>();
  for (const { id } of fulfillments.results) {
    if (await checkFulfillment(ctx, id)) report.fulfillmentsChecked++;
  }

  return report;
}
