import { Hono } from "hono";
import type { GameDetailResponse, GamesResponse, OrderView } from "../../shared/api";
import { buildDest, findGame } from "../../shared/games";
import { AppError, type AppContext } from "../context";
import { getFulfillment, getOrderById, getOrderByRef, getPayment, rateLimit } from "../db";
import { ORDER_REF_PATTERN, sha256Hex } from "../lib/ids";
import { catalogMeta, gameProducts, gameSummaries, toOffer } from "../services/catalog";
import { checkFulfillment } from "../services/fulfillment";
import { lookupNickname } from "../services/nickname";
import { authorizeOrder, checkPayment, createOrder, ensureInvoice, requestCancel } from "../services/orders";
import { toLookupView, toOrderView } from "../services/state";

type Vars = { Variables: { ctx: AppContext; clientKey: string } };

async function body(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const data = await c.req.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new AppError(400, "invalid_body", "Permintaan tidak valid.");
  return data as Record<string, unknown>;
}

function text(value: unknown, max = 64): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function requireProvidersConfigured(ctx: AppContext) {
  if (!ctx.config.mypgApiKey) throw new AppError(503, "payments_unavailable", "Pembayaran sedang tidak tersedia. Coba lagi nanti.");
}

async function orderView(ctx: AppContext, orderId: string): Promise<OrderView> {
  const order = (await getOrderById(ctx.db, orderId))!;
  return toOrderView(order, await getPayment(ctx.db, order.current_payment_id), await getFulfillment(ctx.db, order.current_fulfillment_id));
}

export const publicRoutes = new Hono<Vars>()
  .get("/games", async (c) => {
    const ctx = c.get("ctx");
    const res: GamesResponse = { catalog: await catalogMeta(ctx.db, ctx.config, ctx.now()), games: await gameSummaries(ctx.db, ctx.config) };
    c.header("Cache-Control", "public, max-age=30");
    return c.json(res);
  })

  .get("/games/:slug", async (c) => {
    const ctx = c.get("ctx");
    const game = findGame(c.req.param("slug"));
    if (!game) throw new AppError(404, "game_not_found", "Game tidak ditemukan.");
    const summary = (await gameSummaries(ctx.db, ctx.config)).find((g) => g.slug === game.slug)!;
    const products = (await gameProducts(ctx.db, game.slug)).map((r) => toOffer(r, ctx.config)).filter((p) => p !== null);
    const res: GameDetailResponse = {
      catalog: await catalogMeta(ctx.db, ctx.config, ctx.now()),
      game: { ...summary, userId: game.userId, zone: game.zone },
      products,
    };
    c.header("Cache-Control", "public, max-age=30");
    return c.json(res);
  })

  .post("/nickname-check", async (c) => {
    const ctx = c.get("ctx");
    const b = await body(c);
    const result = await lookupNickname(ctx, { game: text(b.game), userId: text(b.userId, 32), zoneId: text(b.zoneId, 16) || null, clientKey: c.get("clientKey") });
    return c.json(result);
  })

  .post("/orders", async (c) => {
    const ctx = c.get("ctx");
    requireProvidersConfigured(ctx);
    const b = await body(c);
    if (!(await rateLimit(ctx.db, `order:${await sha256Hex(c.get("clientKey"))}`, 20, 600, ctx.now()))) {
      throw new AppError(429, "rate_limited", "Terlalu banyak pesanan dalam waktu singkat. Coba lagi nanti.");
    }
    const order = await createOrder(ctx, {
      game: text(b.game),
      productCode: text(b.productCode, 40),
      userId: text(b.userId, 32),
      zoneId: text(b.zoneId, 16) || null,
      clientToken: text(b.clientToken, 128),
    });
    // Creates the QRIS invoice once; a retried request reuses it.
    await ensureInvoice(ctx, order.id);
    return c.json(await orderView(ctx, order.id), 201);
  })

  .get("/orders/:ref", async (c) => {
    const ctx = c.get("ctx");
    const order = await authorizeOrder(ctx, c.req.param("ref"), c.req.header("x-order-token") ?? null);
    // Server-side verification on view: throttled, and never trusts the browser.
    if (order.payment_status === "UNPAID" || order.payment_status === "CANCEL_REQUESTED") {
      await checkPayment(ctx, order.id, { interactive: true });
    }
    const fresh = (await getOrderById(ctx.db, order.id))!;
    if ((fresh.fulfillment_status === "PROCESSING" || fresh.fulfillment_status === "UNCERTAIN") && fresh.current_fulfillment_id) {
      // Only runs when the backoff schedule says the check is due.
      ctx.defer(checkFulfillment(ctx, fresh.current_fulfillment_id));
    }
    c.header("Cache-Control", "no-store");
    return c.json(await orderView(ctx, order.id));
  })

  .post("/orders/:ref/payment", async (c) => {
    const ctx = c.get("ctx");
    requireProvidersConfigured(ctx);
    const order = await authorizeOrder(ctx, c.req.param("ref"), c.req.header("x-order-token") ?? null);
    if (order.payment_status !== "INVOICE_FAILED" && order.payment_status !== "AWAITING_INVOICE") {
      return c.json(await orderView(ctx, order.id));
    }
    await ensureInvoice(ctx, order.id);
    return c.json(await orderView(ctx, order.id));
  })

  .post("/orders/:ref/cancel", async (c) => {
    const ctx = c.get("ctx");
    const order = await authorizeOrder(ctx, c.req.param("ref"), c.req.header("x-order-token") ?? null);
    if (order.payment_status === "UNPAID" || order.payment_status === "CANCEL_REQUESTED") {
      await requestCancel(ctx, order.id, "customer");
    } else if (order.payment_status === "AWAITING_INVOICE" || order.payment_status === "INVOICE_FAILED") {
      // No invoice exists, so nothing can be paid: cancel locally.
      await ctx.db
        .prepare("UPDATE orders SET payment_status = 'CANCELLED', updated_at = ? WHERE id = ? AND payment_status IN ('AWAITING_INVOICE', 'INVOICE_FAILED')")
        .bind(new Date(ctx.now()).toISOString(), order.id)
        .run();
    }
    return c.json(await orderView(ctx, order.id));
  })

  .post("/orders/lookup", async (c) => {
    const ctx = c.get("ctx");
    const b = await body(c);
    if (!(await rateLimit(ctx.db, `lookup:${await sha256Hex(c.get("clientKey"))}`, 15, 600, ctx.now()))) {
      throw new AppError(429, "rate_limited", "Terlalu banyak percobaan. Coba lagi dalam 10 menit.");
    }
    const ref = text(b.ref, 20).toUpperCase();
    const userId = text(b.userId, 32);
    const zoneId = text(b.zoneId, 16) || null;
    const notFound = new AppError(404, "order_not_found", "Pesanan tidak ditemukan. Periksa nomor pesanan dan ID game.");
    if (!ORDER_REF_PATTERN.test(ref) || !userId) throw notFound;
    const order = await getOrderByRef(ctx.db, ref);
    const game = order ? findGame(order.game_slug) : undefined;
    // Both the reference and the account must match; zone is checked when the game has one.
    if (!order || !game || order.user_id !== userId || (game.zone && order.dest !== buildDest(game, userId, zoneId))) throw notFound;
    return c.json(toLookupView(order));
  });
