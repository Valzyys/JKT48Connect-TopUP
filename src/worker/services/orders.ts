import { buildDest, findGame, validateAccount } from "../../shared/games";
import { AppError, type AppContext } from "../context";
import { changed, getOrderByRef, getOrderById, getPayment, logEvent, type OrderRow, type PaymentRow } from "../db";
import { ProviderCallError } from "../lib/http";
import { CLIENT_TOKEN_PATTERN, newOrderRef, sha256Hex, uuid } from "../lib/ids";
import { addSeconds, iso, parseProviderTimestamp } from "../lib/time";
import { catalogProduct } from "./catalog";
import { startFulfillment } from "./fulfillment";
import { cancelPayment, checkPaymentStatus, createPayment } from "./mypg";
import { checkInvoiceAmount, loadPricing, priceFor } from "./pricing";

/**
 * OrderService: guest orders and the MYPG payment state machine.
 *
 *   AWAITING_INVOICE -> INVOICE_CREATING -> UNPAID | INVOICE_FAILED
 *   UNPAID -> PAID | CANCEL_REQUESTED | REVIEW
 *   CANCEL_REQUESTED -> CANCELLED | EXPIRED | PAID
 *
 * Payment and fulfillment are separate columns. Only a verified PAID (matching
 * trx_id and amount) moves an order to PAID, and only that transition starts
 * fulfillment.
 */

export interface CreateOrderInput {
  game: string;
  productCode: string;
  userId: string;
  zoneId: string | null;
  clientToken: string;
}

const NICKNAME_REUSE_MS = 30 * 60 * 1000;
const INVOICE_LOCK_SECONDS = 90;
const EXPIRY_GRACE_MS = 5 * 60 * 1000;
const POST_CANCEL_WATCH_MS = 30 * 60 * 1000;
const MAX_CANCEL_ATTEMPTS = 5;
const INTERACTIVE_CHECK_MIN_MS = 5_000;

export async function hashToken(token: string): Promise<string> {
  return sha256Hex(`order-access:${token}`);
}

export async function authorizeOrder(ctx: AppContext, ref: string, token: string | null): Promise<OrderRow> {
  const order = await getOrderByRef(ctx.db, ref);
  // Same response for "no such order" and "wrong token": refs cannot be probed.
  if (!order || !token || !CLIENT_TOKEN_PATTERN.test(token) || order.access_hash !== (await hashToken(token))) {
    throw new AppError(404, "order_not_found", "Pesanan tidak ditemukan.");
  }
  return order;
}

export async function createOrder(ctx: AppContext, input: CreateOrderInput): Promise<OrderRow> {
  if (!CLIENT_TOKEN_PATTERN.test(input.clientToken)) throw new AppError(400, "invalid_token", "Sesi checkout tidak valid. Muat ulang halaman.");
  const game = findGame(input.game);
  if (!game) throw new AppError(404, "game_not_found", "Game tidak ditemukan.");
  const userId = input.userId.trim();
  const zoneId = game.zone ? (input.zoneId ?? "").trim() : null;
  const fieldErrors = validateAccount(game, userId, zoneId);
  if (Object.keys(fieldErrors).length) throw new AppError(422, "invalid_account", "Periksa data akun.", fieldErrors as Record<string, string>);
  const dest = buildDest(game, userId, zoneId);
  const accessHash = await hashToken(input.clientToken);

  // Idempotent: the same checkout token always resolves to the same order.
  const existing = await ctx.db.prepare("SELECT * FROM orders WHERE access_hash = ?").bind(accessHash).first<OrderRow>();
  if (existing) {
    if (existing.game_slug !== game.slug || existing.product_code !== input.productCode || existing.dest !== dest) {
      throw new AppError(409, "token_reused", "Sesi checkout ini sudah dipakai untuk pesanan lain. Muat ulang halaman.");
    }
    return existing;
  }

  const product = await catalogProduct(ctx.db, input.productCode);
  if (!product || product.product_type !== "topup" || product.game_slug !== game.slug || product.present !== 1 || product.is_available !== 1 || product.harga === null) {
    throw new AppError(422, "product_unavailable", "Nominal ini sedang tidak tersedia. Pilih nominal lain.");
  }

  // The account name is never taken from the browser: only a recent server-side check counts.
  let nickname: string | null = null;
  if (game.nicknameProduct) {
    const check = await ctx.db
      .prepare("SELECT nickname FROM nickname_checks WHERE product = ? AND dest = ? AND status = 'SUCCESS' AND created_at > ? ORDER BY created_at DESC LIMIT 1")
      .bind(game.nicknameProduct, dest, iso(ctx.now() - NICKNAME_REUSE_MS))
      .first<{ nickname: string | null }>();
    nickname = check?.nickname ?? null;
  }

  // Priced on the server with the current admin rules, then frozen on the order.
  const { price: sellPrice, source: priceSource } = priceFor(product.kode, product.harga, await loadPricing(ctx.db, ctx.config));
  const nowIso = iso(ctx.now());
  const id = uuid();
  const ref = newOrderRef();
  try {
    await ctx.db
      .prepare(
        `INSERT INTO orders (id, public_ref, access_hash, game_slug, product_code, product_label, user_id, zone_id, dest, nickname,
           provider_cost, sell_price, payment_status, fulfillment_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AWAITING_INVOICE', 'NOT_STARTED', ?, ?)`,
      )
      .bind(id, ref, accessHash, game.slug, product.kode, product.keterangan, userId, zoneId, dest, nickname, product.harga, sellPrice, nowIso, nowIso)
      .run();
  } catch (err) {
    // Lost a race against a concurrent submit with the same token.
    const raced = await ctx.db.prepare("SELECT * FROM orders WHERE access_hash = ?").bind(accessHash).first<OrderRow>();
    if (raced) return raced;
    throw err;
  }
  await logEvent(ctx.db, id, "order_created", { product: product.kode, cost: product.harga, price: sellPrice, priceSource }, nowIso);
  return (await getOrderById(ctx.db, id))!;
}

/**
 * Requests a QRIS invoice for an order unless one already exists or is being
 * created. Safe to call on every page load: the conditional lock means a
 * refresh never produces a second invoice.
 */
export async function ensureInvoice(ctx: AppContext, orderId: string): Promise<void> {
  const nowMs = ctx.now();
  const nowIso = iso(nowMs);
  const lock = await ctx.db
    .prepare(
      `UPDATE orders SET payment_status = 'INVOICE_CREATING', invoice_lock_until = ?, updated_at = ?
       WHERE id = ? AND fulfillment_status = 'NOT_STARTED'
         AND (payment_status IN ('AWAITING_INVOICE', 'INVOICE_FAILED') OR (payment_status = 'INVOICE_CREATING' AND invoice_lock_until < ?))`,
    )
    .bind(addSeconds(nowMs, INVOICE_LOCK_SECONDS), nowIso, orderId, nowIso)
    .run();
  if (!changed(lock)) return;

  const order = (await getOrderById(ctx.db, orderId))!;
  const paymentId = uuid();
  const requested = order.sell_price; // server-side price, never a browser-supplied amount
  await ctx.db.batch([
    ctx.db
      .prepare("INSERT INTO payments (id, order_id, requested_amount, status, created_at, updated_at) VALUES (?, ?, ?, 'CREATING', ?, ?)")
      .bind(paymentId, orderId, requested, nowIso, nowIso),
    ctx.db.prepare("UPDATE orders SET current_payment_id = ? WHERE id = ?").bind(paymentId, orderId),
  ]);

  const fail = async (paymentStatus: "FAILED" | "MISMATCH", detail: Record<string, unknown>, review: string | null, trxId: string | null = null, invoiceAmount: number | null = null) => {
    const at = iso(ctx.now());
    await ctx.db.batch([
      ctx.db
        .prepare("UPDATE payments SET status = ?, mypg_trx_id = ?, invoice_amount = ?, last_message = ?, updated_at = ? WHERE id = ?")
        .bind(paymentStatus, trxId, invoiceAmount, String(detail.message ?? "").slice(0, 300), at, paymentId),
      ctx.db
        .prepare(
          `UPDATE orders SET payment_status = 'INVOICE_FAILED', invoice_lock_until = NULL,
             needs_review = CASE WHEN ? IS NULL THEN needs_review ELSE 1 END, review_reason = COALESCE(?, review_reason), updated_at = ?
           WHERE id = ? AND payment_status = 'INVOICE_CREATING'`,
        )
        .bind(review, review, at, orderId),
    ]);
    await logEvent(ctx.db, orderId, "invoice_failed", detail, at);
    // An invoice the guest never saw is cancelled so it cannot be paid by mistake.
    if (trxId) {
      const cancel = await cancelPayment(ctx.config, trxId).catch((e: unknown) => ({ confirmed: false, message: e instanceof Error ? e.message : "cancel error" }));
      await logEvent(ctx.db, orderId, cancel.confirmed ? "invoice_discarded" : "invoice_discard_unconfirmed", { trxId, message: cancel.message }, iso(ctx.now()));
    }
  };

  let parsed;
  try {
    parsed = await createPayment(ctx.config, requested);
  } catch (err) {
    const message = err instanceof ProviderCallError ? `${err.kind}: ${err.message}` : err instanceof Error ? err.message : "createpayment error";
    // Outcome unknown. No trx_id came back, so no QR was shown and nothing can be paid.
    await fail("FAILED", { message, requested }, null);
    return;
  }
  if (!parsed.ok) {
    await fail("FAILED", { message: parsed.message, reason: parsed.reason, requested }, null, parsed.reason === "malformed" ? parsed.trxId : null);
    return;
  }
  const amountCheck = checkInvoiceAmount(requested, parsed.amount, ctx.config.mypgMaxAmountDelta);
  if (!amountCheck.ok) {
    await fail("MISMATCH", { message: `Invoice amount ${parsed.amount} rejected (${amountCheck.reason})`, requested, returned: parsed.amount }, "invoice_amount_mismatch", parsed.trxId, parsed.amount);
    return;
  }

  const expiresMs = parseProviderTimestamp(parsed.expiredAtRaw, ctx.config.mypgTimeOffset) ?? ctx.now() + ctx.config.mypgDefaultTtlMinutes * 60_000;
  const at = iso(ctx.now());
  await ctx.db.batch([
    ctx.db
      .prepare(
        `UPDATE payments SET mypg_trx_id = ?, invoice_amount = ?, qr_image = ?, payment_url = ?, expired_at_raw = ?, expires_at = ?,
           status = 'UNPAID', provider_status = 'UNPAID', last_message = ?, next_check_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(parsed.trxId, parsed.amount, parsed.qrImage, parsed.paymentUrl, parsed.expiredAtRaw, iso(expiresMs), parsed.message, addSeconds(ctx.now(), 15), at, paymentId),
    ctx.db
      .prepare("UPDATE orders SET payment_status = 'UNPAID', invoice_lock_until = NULL, updated_at = ? WHERE id = ? AND payment_status = 'INVOICE_CREATING'")
      .bind(at, orderId),
  ]);
  await logEvent(ctx.db, orderId, "invoice_created", { trxId: parsed.trxId, requested, invoiceAmount: parsed.amount, adjustment: amountCheck.adjustment, expiredAt: parsed.expiredAtRaw }, at);
}

function nextPaymentCheck(nowMs: number, payment: PaymentRow): string {
  const age = nowMs - Date.parse(payment.created_at);
  const seconds = age < 10 * 60_000 ? 15 : age < 60 * 60_000 ? 60 : 300;
  return addSeconds(nowMs, seconds);
}

export type PaymentCheckOutcome = "skipped" | "paid" | "unpaid" | "review" | "error" | "undocumented";

/**
 * Server-side payment verification through MYPG checkstatus. `interactive`
 * marks checks triggered by the guest's status page: they may run ahead of the
 * schedule but never more than once per 5 seconds per order.
 */
export async function checkPayment(ctx: AppContext, orderId: string, opts: { interactive?: boolean } = {}): Promise<PaymentCheckOutcome> {
  const order = await getOrderById(ctx.db, orderId);
  if (!order) return "skipped";
  const payment = await getPayment(ctx.db, order.current_payment_id);
  if (!payment || !payment.mypg_trx_id || payment.invoice_amount === null) return "skipped";
  const nowMs = ctx.now();
  const watchingCancelled = payment.status === "CANCELLED" && payment.cancel_confirmed_at !== null && nowMs - Date.parse(payment.cancel_confirmed_at) < POST_CANCEL_WATCH_MS;
  if (payment.status !== "UNPAID" && payment.status !== "CANCEL_REQUESTED" && !watchingCancelled) return "skipped";

  const lease = await ctx.db
    .prepare(
      `UPDATE payments SET next_check_at = ?, last_checked_at = ? WHERE id = ? AND status = ?
       AND ((next_check_at IS NULL OR next_check_at <= ?) OR (? = 1 AND (last_checked_at IS NULL OR last_checked_at <= ?)))`,
    )
    .bind(addSeconds(nowMs, 30), iso(nowMs), payment.id, payment.status, iso(nowMs), opts.interactive ? 1 : 0, iso(nowMs - INTERACTIVE_CHECK_MIN_MS))
    .run();
  if (!changed(lease)) return "skipped";

  const expected = { trxId: payment.mypg_trx_id, amount: payment.invoice_amount };
  let result;
  try {
    result = await checkPaymentStatus(ctx.config, expected);
  } catch (err) {
    // A failed check is not evidence of anything: keep the state, try later.
    const message = err instanceof ProviderCallError ? `${err.kind}: ${err.message}` : "checkstatus error";
    await ctx.db
      .prepare("UPDATE payments SET check_count = check_count + 1, last_message = ?, next_check_at = ?, updated_at = ? WHERE id = ?")
      .bind(message, nextPaymentCheck(nowMs, payment), iso(nowMs), payment.id)
      .run();
    return "error";
  }

  const at = iso(ctx.now());
  await ctx.db
    .prepare("UPDATE payments SET check_count = check_count + 1, last_message = ?, next_check_at = ?, updated_at = ? WHERE id = ?")
    .bind(result.message.slice(0, 300), nextPaymentCheck(nowMs, payment), at, payment.id)
    .run();

  switch (result.kind) {
    case "PAID":
      return markPaid(ctx, order, payment, result.paidAtRaw);
    case "UNPAID": {
      const expiresMs = parseProviderTimestamp(result.expiredAtRaw, ctx.config.mypgTimeOffset) ?? (payment.expires_at ? Date.parse(payment.expires_at) : null);
      await ctx.db
        .prepare("UPDATE payments SET provider_status = 'UNPAID', expired_at_raw = COALESCE(?, expired_at_raw), expires_at = ? WHERE id = ?")
        .bind(result.expiredAtRaw, expiresMs !== null ? iso(expiresMs) : payment.expires_at, payment.id)
        .run();
      if (payment.status === "UNPAID" && expiresMs !== null && nowMs > expiresMs + EXPIRY_GRACE_MS) {
        await requestCancel(ctx, orderId, "expired", { skipPrecheck: true });
      }
      return "unpaid";
    }
    case "UNDOCUMENTED":
      await ctx.db.prepare("UPDATE payments SET provider_status = ? WHERE id = ?").bind(result.rawStatus, payment.id).run();
      await ctx.db
        .prepare("UPDATE orders SET needs_review = 1, review_reason = COALESCE(review_reason, ?), updated_at = ? WHERE id = ?")
        .bind(`undocumented_payment_status:${result.rawStatus}`, at, orderId)
        .run();
      await logEvent(ctx.db, orderId, "payment_status_undocumented", { trxId: payment.mypg_trx_id, status: result.rawStatus, message: result.message }, at);
      return "undocumented";
    case "TRX_MISMATCH":
    case "AMOUNT_MISMATCH": {
      const reason = result.kind === "TRX_MISMATCH" ? "payment_trx_mismatch" : "payment_amount_mismatch";
      await ctx.db.batch([
        ctx.db.prepare("UPDATE payments SET status = 'REVIEW', updated_at = ? WHERE id = ?").bind(at, payment.id),
        ctx.db
          .prepare(
            `UPDATE orders SET payment_status = 'REVIEW', needs_review = 1, review_reason = ?, updated_at = ?
             WHERE id = ? AND payment_status IN ('UNPAID', 'CANCEL_REQUESTED', 'CANCELLED', 'EXPIRED')`,
          )
          .bind(reason, at, orderId),
      ]);
      await logEvent(ctx.db, orderId, reason, { expected, result }, at);
      return "review";
    }
    case "INVALID":
      if (payment.last_message !== result.message) {
        await logEvent(ctx.db, orderId, "payment_check_invalid", { trxId: payment.mypg_trx_id, message: result.message }, at);
      }
      return "error";
  }
}

async function markPaid(ctx: AppContext, order: OrderRow, payment: PaymentRow, paidAtRaw: string | null): Promise<PaymentCheckOutcome> {
  const at = iso(ctx.now());
  const [, orderUpdate] = await ctx.db.batch([
    ctx.db
      .prepare("UPDATE payments SET status = 'PAID', provider_status = 'PAID', paid_at_raw = ?, updated_at = ? WHERE id = ? AND status IN ('UNPAID', 'CANCEL_REQUESTED', 'CANCELLED')")
      .bind(paidAtRaw, at, payment.id),
    ctx.db
      .prepare("UPDATE orders SET payment_status = 'PAID', updated_at = ? WHERE id = ? AND payment_status IN ('UNPAID', 'CANCEL_REQUESTED')")
      .bind(at, order.id),
  ]);
  if (orderUpdate && changed(orderUpdate)) {
    await logEvent(ctx.db, order.id, "payment_confirmed", { trxId: payment.mypg_trx_id, amount: payment.invoice_amount, paidAt: paidAtRaw }, at);
    ctx.defer(startFulfillment(ctx, order.id));
    return "paid";
  }
  const current = (await getOrderById(ctx.db, order.id))!;
  if (current.payment_status === "CANCELLED" || current.payment_status === "EXPIRED") {
    // Paid after a confirmed cancellation: money arrived, so a human decides (fulfil or refund).
    await ctx.db
      .prepare("UPDATE orders SET payment_status = 'REVIEW', needs_review = 1, review_reason = 'paid_after_cancellation', updated_at = ? WHERE id = ? AND payment_status IN ('CANCELLED', 'EXPIRED')")
      .bind(at, order.id)
      .run();
    await logEvent(ctx.db, order.id, "paid_after_cancellation", { trxId: payment.mypg_trx_id }, at);
    return "review";
  }
  return current.payment_status === "PAID" ? "paid" : "skipped";
}

/**
 * Cancels the current QRIS invoice. The order only becomes CANCELLED/EXPIRED
 * once MYPG confirms; until then it stays CANCEL_REQUESTED and the invoice is
 * still honoured if paid. Safe to call repeatedly.
 */
export async function requestCancel(ctx: AppContext, orderId: string, reason: "customer" | "expired", opts: { skipPrecheck?: boolean } = {}): Promise<void> {
  if (!opts.skipPrecheck) {
    // Never cancel something that is already paid: look first.
    await checkPayment(ctx, orderId, { interactive: true });
  }
  const order = await getOrderById(ctx.db, orderId);
  if (!order || (order.payment_status !== "UNPAID" && order.payment_status !== "CANCEL_REQUESTED")) return;
  const payment = await getPayment(ctx.db, order.current_payment_id);
  if (!payment?.mypg_trx_id || (payment.status !== "UNPAID" && payment.status !== "CANCEL_REQUESTED")) return;
  if (payment.cancel_attempts >= MAX_CANCEL_ATTEMPTS) {
    await ctx.db
      .prepare("UPDATE orders SET needs_review = 1, review_reason = COALESCE(review_reason, 'cancel_unconfirmed'), updated_at = ? WHERE id = ?")
      .bind(iso(ctx.now()), orderId)
      .run();
    return;
  }

  const at = iso(ctx.now());
  await ctx.db.batch([
    ctx.db
      .prepare(
        `UPDATE payments SET status = 'CANCEL_REQUESTED', cancel_requested_at = COALESCE(cancel_requested_at, ?), cancel_attempts = cancel_attempts + 1, updated_at = ?
         WHERE id = ? AND status IN ('UNPAID', 'CANCEL_REQUESTED')`,
      )
      .bind(at, at, payment.id),
    ctx.db
      .prepare("UPDATE orders SET payment_status = 'CANCEL_REQUESTED', updated_at = ? WHERE id = ? AND payment_status IN ('UNPAID', 'CANCEL_REQUESTED')")
      .bind(at, orderId),
  ]);
  await logEvent(ctx.db, orderId, "cancel_requested", { reason, trxId: payment.mypg_trx_id, attempt: payment.cancel_attempts + 1 }, at);

  let result;
  try {
    result = await cancelPayment(ctx.config, payment.mypg_trx_id);
  } catch (err) {
    await logEvent(ctx.db, orderId, "cancel_uncertain", { message: err instanceof Error ? err.message : "cancel error" }, iso(ctx.now()));
    return;
  }
  const done = iso(ctx.now());
  if (!result.confirmed) {
    await ctx.db.prepare("UPDATE payments SET cancel_message = ?, updated_at = ? WHERE id = ?").bind(result.message, done, payment.id).run();
    await logEvent(ctx.db, orderId, "cancel_not_confirmed", { message: result.message }, done);
    return;
  }
  await ctx.db.batch([
    ctx.db
      .prepare(
        `UPDATE payments SET status = 'CANCELLED', cancel_confirmed_at = ?, cancel_message = ?, next_check_at = ?, updated_at = ?
         WHERE id = ? AND status = 'CANCEL_REQUESTED'`,
      )
      // Keep watching briefly: a payment made just before the cancel still has to be caught.
      .bind(done, result.message, addSeconds(ctx.now(), 60), done, payment.id),
    ctx.db
      .prepare("UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ? AND payment_status = 'CANCEL_REQUESTED'")
      .bind(reason === "expired" ? "EXPIRED" : "CANCELLED", done, orderId),
  ]);
  await logEvent(ctx.db, orderId, "cancel_confirmed", { reason, message: result.message }, done);
}
