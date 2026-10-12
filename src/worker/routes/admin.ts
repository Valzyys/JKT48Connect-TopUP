import { Hono } from "hono";
import { AppError, type AppContext } from "../context";
import { type CatalogRow, type FulfillmentRow, getFulfillment, getOrderById, getOrderByRef, getPayment, logEvent, type OrderRow, type PaymentRow, rateLimit } from "../db";
import { SESSION_TTL_MS, signSession, verifyPassword, verifySession } from "../lib/adminAuth";
import { safeEqual, sha256Hex } from "../lib/ids";
import { iso } from "../lib/time";
import { syncCatalog } from "../services/catalog";
import { checkFulfillment, retryFailedFulfillment, startFulfillment } from "../services/fulfillment";
import { checkPayment } from "../services/orders";
import { loadMargin, loadPricing, priceFor, ROUND_TO_OPTIONS, sellingPrice, validateMargin } from "../services/pricing";
import { customerStatus } from "../services/state";

type Vars = { Variables: { ctx: AppContext } };

/**
 * Administrative reconciliation. Every route except /login requires
 * `Authorization: Bearer <token>`, where the token is either ADMIN_TOKEN itself
 * (scripts) or a session from /login (the console). Provider responses shown
 * here are already balance-redacted; secrets are never returned.
 */
export const adminRoutes = new Hono<Vars>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (c.req.path.endsWith("/admin/login")) return next();
    const ctx = c.get("ctx");
    const expected = ctx.config.adminToken;
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!expected) throw new AppError(503, "admin_disabled", "ADMIN_TOKEN is not configured.");
    const ok = !!token && (safeEqual(token, expected) || (await verifySession(expected, token, ctx.now())));
    if (!ok) throw new AppError(401, "unauthorized", "Sesi admin berakhir. Masuk lagi.");
    await next();
  })

  // Email + password sign-in. Rate limited per client and per email, because
  // every attempt is a password guess.
  .post("/login", async (c) => {
    const ctx = c.get("ctx");
    const { adminToken, adminEmail, adminPasswordHash } = ctx.config;
    if (!adminToken || !adminEmail || !adminPasswordHash) {
      throw new AppError(503, "admin_disabled", "Login admin belum dikonfigurasi (ADMIN_TOKEN, ADMIN_EMAIL, ADMIN_PASSWORD_HASH).");
    }
    const body = (await c.req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const now = ctx.now();
    const client = await sha256Hex(c.req.header("cf-connecting-ip") ?? "unknown");
    const allowed = (await rateLimit(ctx.db, `login:c:${client}`, 5, 900, now)) && (await rateLimit(ctx.db, `login:e:${await sha256Hex(email)}`, 10, 900, now));
    if (!allowed) throw new AppError(429, "rate_limited", "Terlalu banyak percobaan. Coba lagi 15 menit lagi.");
    // Verify the password even for a wrong email, so timing does not reveal which part failed.
    const passwordOk = await verifyPassword(password, adminPasswordHash);
    if (!passwordOk || !safeEqual(email, adminEmail)) throw new AppError(401, "invalid_login", "Email atau password salah.");
    const expiresAt = now + SESSION_TTL_MS;
    return c.json({ token: await signSession(adminToken, expiresAt), expiresAt: iso(expiresAt) });
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
    const rules = await loadPricing(ctx.db, ctx.config);
    const { results } = await ctx.db.prepare("SELECT * FROM catalog_products ORDER BY product_type, game_slug, harga").all<CatalogRow>();
    const syncs = await ctx.db.prepare("SELECT * FROM catalog_syncs ORDER BY id DESC LIMIT 10").all();
    return c.json({
      products: results.map((r) => {
        const priced = r.harga !== null && r.product_type === "topup" ? priceFor(r.kode, r.harga, rules) : null;
        return {
          ...r,
          sellPrice: priced?.price ?? null,
          priceSource: priced?.source ?? null,
          marginPrice: r.harga !== null && r.product_type === "topup" ? sellingPrice(r.harga, rules) : null,
          override: rules.overrides.get(r.kode) ?? null,
        };
      }),
      syncs: syncs.results,
    });
  })

  .get("/pricing", async (c) => {
    const ctx = c.get("ctx");
    const current = await loadMargin(ctx.db, ctx.config);
    const audit = await ctx.db.prepare("SELECT action, detail, created_at FROM pricing_audit ORDER BY id DESC LIMIT 20").all<{ action: string; detail: string; created_at: string }>();
    return c.json({
      ...current,
      defaults: ctx.config.pricing,
      roundToOptions: ROUND_TO_OPTIONS,
      audit: audit.results.map((a) => ({ ...a, detail: JSON.parse(a.detail) as unknown })),
    });
  })

  .put("/pricing", async (c) => {
    const ctx = c.get("ctx");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const { margin, errors } = validateMargin(body);
    if (!margin) throw new AppError(422, "invalid_margin", "Periksa isian margin.", errors);
    const at = iso(ctx.now());
    const before = (await loadMargin(ctx.db, ctx.config)).margin;
    await ctx.db.batch([
      ctx.db
        .prepare("INSERT INTO settings (key, value, updated_at) VALUES ('pricing', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(JSON.stringify(margin), at),
      ctx.db.prepare("INSERT INTO pricing_audit (action, detail, created_at) VALUES ('margin', ?, ?)").bind(JSON.stringify({ before, after: margin }), at),
    ]);
    return c.json({ margin, source: "admin", updatedAt: at });
  })

  .put("/pricing/overrides/:kode", async (c) => {
    const ctx = c.get("ctx");
    const kode = c.req.param("kode");
    const body = (await c.req.json().catch(() => ({}))) as { sellPrice?: unknown };
    const product = await ctx.db.prepare("SELECT * FROM catalog_products WHERE kode = ?").bind(kode).first<CatalogRow>();
    if (!product || product.product_type !== "topup" || product.harga === null) throw new AppError(404, "product_not_found", "Produk top-up tidak ditemukan.");
    const price = Number(body.sellPrice);
    if (!Number.isInteger(price) || price <= 0 || price > 100_000_000) {
      throw new AppError(422, "invalid_price", "Harga harus bilangan bulat rupiah.", { sellPrice: "Isi harga dalam rupiah, tanpa titik." });
    }
    if (price < product.harga) {
      throw new AppError(422, "below_cost", "Harga di bawah modal.", { sellPrice: `Minimal ${product.harga} (modal saat ini).` });
    }
    const at = iso(ctx.now());
    const prev = await ctx.db.prepare("SELECT sell_price FROM price_overrides WHERE kode = ?").bind(kode).first<{ sell_price: number }>();
    await ctx.db.batch([
      ctx.db
        .prepare("INSERT INTO price_overrides (kode, sell_price, updated_at) VALUES (?, ?, ?) ON CONFLICT (kode) DO UPDATE SET sell_price = excluded.sell_price, updated_at = excluded.updated_at")
        .bind(kode, price, at),
      ctx.db
        .prepare("INSERT INTO pricing_audit (action, detail, created_at) VALUES ('override_set', ?, ?)")
        .bind(JSON.stringify({ kode, before: prev?.sell_price ?? null, after: price, cost: product.harga }), at),
    ]);
    return c.json({ kode, sellPrice: price });
  })

  .delete("/pricing/overrides/:kode", async (c) => {
    const ctx = c.get("ctx");
    const kode = c.req.param("kode");
    const prev = await ctx.db.prepare("SELECT sell_price FROM price_overrides WHERE kode = ?").bind(kode).first<{ sell_price: number }>();
    if (!prev) return c.json({ kode, removed: false });
    const at = iso(ctx.now());
    await ctx.db.batch([
      ctx.db.prepare("DELETE FROM price_overrides WHERE kode = ?").bind(kode),
      ctx.db.prepare("INSERT INTO pricing_audit (action, detail, created_at) VALUES ('override_removed', ?, ?)").bind(JSON.stringify({ kode, before: prev.sell_price }), at),
    ]);
    return c.json({ kode, removed: true });
  });
