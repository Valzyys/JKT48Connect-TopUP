import { Hono } from "hono";
import { AppError, type AppContext } from "../context";
import { type CatalogRow, type FulfillmentRow, getFulfillment, getOrderById, getOrderByRef, getPayment, logEvent, type OrderRow, type PaymentRow } from "../db";
import { safeEqual } from "../lib/ids";
import { iso } from "../lib/time";
import { syncCatalog } from "../services/catalog";
import { checkFulfillment, retryFailedFulfillment, startFulfillment } from "../services/fulfillment";
import { checkPayment } from "../services/orders";
import { sellingPrice } from "../services/pricing";
import { customerStatus } from "../services/state";

type Vars = { Variables: { ctx: AppContext } };

/**
 * Administrative reconciliation. Every route requires `Authorization: Bearer <ADMIN_TOKEN>`.
 * Provider responses shown here are already balance-redacted; secrets are never returned.
 */
export const adminRoutes = new Hono<Vars>()
  .use("*", async (c, next) => {
    const expected = c.get("ctx").config.adminToken;
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!expected) throw new AppError(503, "admin_disabled", "ADMIN_TOKEN is not configured.");
    if (!token || !safeEqual(token, expected)) throw new AppError(401, "unauthorized", "Unauthorized.");
    c.header("Cache-Control", "no-store");
    await next();
  })

  .get("/orders", async (c) => {
    const ctx = c.get("ctx");
    const filter = c.req.query("filter") ?? "attention";
    const where =
      filter === "all"
        ? "1 = 1"
        : filter === "active"
          ? "payment_status IN ('UNPAID', 'CANCEL_REQUESTED', 'INVOICE_CREATING') OR fulfillment_status IN ('SUBMITTING', 'PROCESSING', 'UNCERTAIN')"
          : "needs_review = 1 OR fulfillment_status IN ('UNCERTAIN', 'FAILED') OR payment_status = 'REVIEW'";
    const { results } = await ctx.db.prepare(`SELECT * FROM orders WHERE ${where} ORDER BY updated_at DESC LIMIT 200`).all<OrderRow>();
    return c.json({
      orders: results.map((o) => ({
        ref: o.public_ref,
        game: o.game_slug,
        product: o.product_code,
        dest: o.dest,
        price: o.sell_price,
        cost: o.provider_cost,
        paymentStatus: o.payment_status,
        fulfillmentStatus: o.fulfillment_status,
        customerStatus: customerStatus(o),
        needsReview: o.needs_review === 1,
        reviewReason: o.review_reason,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      })),
    });
  })

  .get("/orders/:ref", async (c) => {
    const ctx = c.get("ctx");
    const order = await getOrderByRef(ctx.db, c.req.param("ref"));
    if (!order) throw new AppError(404, "order_not_found", "Order not found.");
    const payments = await ctx.db.prepare("SELECT * FROM payments WHERE order_id = ? ORDER BY created_at").bind(order.id).all<PaymentRow>();
    const fulfillments = await ctx.db.prepare("SELECT * FROM fulfillments WHERE order_id = ? ORDER BY attempt").bind(order.id).all<FulfillmentRow>();
    const events = await ctx.db.prepare("SELECT type, detail, created_at FROM order_events WHERE order_id = ? ORDER BY id").bind(order.id).all<{ type: string; detail: string | null; created_at: string }>();
    const { access_hash: _omit, ...safeOrder } = order;
    return c.json({
      order: { ...safeOrder, customerStatus: customerStatus(order) },
      payments: payments.results,
      fulfillments: fulfillments.results,
      events: events.results.map((e) => ({ ...e, detail: e.detail ? (JSON.parse(e.detail) as unknown) : null })),
    });
  })

  .post("/orders/:ref/reconcile", async (c) => {
    const ctx = c.get("ctx");
    const order = await getOrderByRef(ctx.db, c.req.param("ref"));
    if (!order) throw new AppError(404, "order_not_found", "Order not found.");
    await logEvent(ctx.db, order.id, "admin_reconcile", null, iso(ctx.now()));
    // Clear schedules so the checks run now instead of waiting for the backoff.
    await ctx.db.prepare("UPDATE payments SET next_check_at = NULL WHERE id = ?").bind(order.current_payment_id).run();
    const payment = await checkPayment(ctx, order.id);
    let fulfillment: FulfillmentRow | null = null;
    const fresh = (await getOrderById(ctx.db, order.id))!;
    if (fresh.current_fulfillment_id && ["SUBMITTING", "PROCESSING", "UNCERTAIN"].includes(fresh.fulfillment_status)) {
      await ctx.db.prepare("UPDATE fulfillments SET next_check_at = NULL WHERE id = ?").bind(fresh.current_fulfillment_id).run();
      fulfillment = await checkFulfillment(ctx, fresh.current_fulfillment_id);
    } else if (fresh.payment_status === "PAID" && fresh.fulfillment_status === "NOT_STARTED" && fresh.needs_review === 0) {
      fulfillment = await startFulfillment(ctx, order.id);
    }
    const after = (await getOrderById(ctx.db, order.id))!;
    return c.json({ payment, fulfillment: fulfillment?.status ?? null, paymentStatus: after.payment_status, fulfillmentStatus: after.fulfillment_status });
  })

  .post("/orders/:ref/retry-fulfillment", async (c) => {
    const ctx = c.get("ctx");
    const b = (await c.req.json().catch(() => ({}))) as { confirm?: string };
    if (b.confirm !== "RETRY") throw new AppError(400, "confirmation_required", 'Send {"confirm":"RETRY"} to start a new top-up attempt with a new refID.');
    const order = await getOrderByRef(ctx.db, c.req.param("ref"));
    if (!order) throw new AppError(404, "order_not_found", "Order not found.");
    const f = await retryFailedFulfillment(ctx, order.id);
    if (!f) throw new AppError(409, "not_retryable", "Only paid orders whose current fulfillment FAILED can be retried.");
    return c.json({ refId: f.ref_id, status: f.status });
  })

  .post("/orders/:ref/resolve", async (c) => {
    const ctx = c.get("ctx");
    const b = (await c.req.json().catch(() => ({}))) as { note?: string };
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : "";
    if (!note) throw new AppError(400, "note_required", "Describe how the order was resolved.");
    const order = await getOrderByRef(ctx.db, c.req.param("ref"));
    if (!order) throw new AppError(404, "order_not_found", "Order not found.");
    await ctx.db.prepare("UPDATE orders SET needs_review = 0, updated_at = ? WHERE id = ?").bind(iso(ctx.now()), order.id).run();
    await logEvent(ctx.db, order.id, "admin_resolved", { note, previousReason: order.review_reason }, iso(ctx.now()));
    return c.json({ ok: true });
  })

  .get("/orders/:ref/current", async (c) => {
    const ctx = c.get("ctx");
    const order = await getOrderByRef(ctx.db, c.req.param("ref"));
    if (!order) throw new AppError(404, "order_not_found", "Order not found.");
    return c.json({ payment: await getPayment(ctx.db, order.current_payment_id), fulfillment: await getFulfillment(ctx.db, order.current_fulfillment_id) });
  })

  .post("/catalog/sync", async (c) => {
    const ctx = c.get("ctx");
    if (!ctx.config.catalogId) throw new AppError(503, "catalog_unconfigured", "OKECONNECT_CATALOG_ID is not configured.");
    return c.json(await syncCatalog(ctx.db, ctx.config, ctx.now()));
  })

  .get("/catalog", async (c) => {
    const ctx = c.get("ctx");
    const { results } = await ctx.db.prepare("SELECT * FROM catalog_products ORDER BY product_type, game_slug, harga").all<CatalogRow>();
    const syncs = await ctx.db.prepare("SELECT * FROM catalog_syncs ORDER BY id DESC LIMIT 10").all();
    return c.json({
      products: results.map((r) => ({ ...r, sellPrice: r.harga !== null && r.product_type === "topup" ? sellingPrice(r.harga, ctx.config.pricing) : null })),
      syncs: syncs.results,
    });
  });
