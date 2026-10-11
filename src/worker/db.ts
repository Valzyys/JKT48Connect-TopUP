export type PaymentStatus =
  | "AWAITING_INVOICE"
  | "INVOICE_CREATING"
  | "INVOICE_FAILED"
  | "UNPAID"
  | "PAID"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "EXPIRED"
  | "REVIEW";

export type FulfillmentStatus = "NOT_STARTED" | "SUBMITTING" | "PROCESSING" | "SUCCESS" | "FAILED" | "UNCERTAIN";

export interface OrderRow {
  id: string;
  public_ref: string;
  access_hash: string;
  game_slug: string;
  product_code: string;
  product_label: string;
  user_id: string;
  zone_id: string | null;
  dest: string;
  nickname: string | null;
  provider_cost: number;
  sell_price: number;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  needs_review: number;
  review_reason: string | null;
  current_payment_id: string | null;
  current_fulfillment_id: string | null;
  invoice_lock_until: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentRowStatus = "CREATING" | "UNPAID" | "PAID" | "CANCEL_REQUESTED" | "CANCELLED" | "FAILED" | "MISMATCH" | "REVIEW";

export interface PaymentRow {
  id: string;
  order_id: string;
  mypg_trx_id: string | null;
  requested_amount: number;
  invoice_amount: number | null;
  qr_image: string | null;
  payment_url: string | null;
  expired_at_raw: string | null;
  expires_at: string | null;
  provider_status: string | null;
  paid_at_raw: string | null;
  last_message: string | null;
  status: PaymentRowStatus;
  check_count: number;
  last_checked_at: string | null;
  next_check_at: string | null;
  cancel_attempts: number;
  cancel_requested_at: string | null;
  cancel_confirmed_at: string | null;
  cancel_message: string | null;
  created_at: string;
  updated_at: string;
}

export type FulfillmentRowStatus = "SUBMITTING" | "PROCESSING" | "SUCCESS" | "FAILED" | "UNCERTAIN";

export interface FulfillmentRow {
  id: string;
  order_id: string;
  attempt: number;
  ref_id: string;
  product: string;
  dest: string;
  status: FulfillmentRowStatus;
  sn: string | null;
  last_response: string | null;
  check_count: number;
  last_checked_at: string | null;
  next_check_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogRow {
  kode: string;
  keterangan: string;
  produk: string;
  kategori: string;
  harga_raw: string;
  harga: number | null;
  status_raw: string;
  is_available: number;
  product_type: "topup" | "nickname_check" | "other";
  game_slug: string | null;
  present: number;
  last_sync_id: number | null;
  updated_at: string;
}

export async function getOrderByRef(db: D1Database, ref: string): Promise<OrderRow | null> {
  return db.prepare("SELECT * FROM orders WHERE public_ref = ?").bind(ref).first<OrderRow>();
}

export async function getOrderById(db: D1Database, id: string): Promise<OrderRow | null> {
  return db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
}

export async function getPayment(db: D1Database, id: string | null): Promise<PaymentRow | null> {
  if (!id) return null;
  return db.prepare("SELECT * FROM payments WHERE id = ?").bind(id).first<PaymentRow>();
}

export async function getFulfillment(db: D1Database, id: string | null): Promise<FulfillmentRow | null> {
  if (!id) return null;
  return db.prepare("SELECT * FROM fulfillments WHERE id = ?").bind(id).first<FulfillmentRow>();
}

export async function logEvent(db: D1Database, orderId: string, type: string, detail: Record<string, unknown> | null, at: string): Promise<void> {
  await db
    .prepare("INSERT INTO order_events (order_id, type, detail, created_at) VALUES (?, ?, ?, ?)")
    .bind(orderId, type, detail ? JSON.stringify(detail) : null, at)
    .run();
}

export function changed(result: D1Result): boolean {
  return (result.meta?.changes ?? 0) > 0;
}

/** Fixed-window counter. Returns false once `limit` is exceeded within the window. */
export async function rateLimit(db: D1Database, key: string, limit: number, windowSeconds: number, nowMs: number): Promise<boolean> {
  const windowStart = Math.floor(nowMs / 1000 / windowSeconds) * windowSeconds;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 0) <= limit;
}
