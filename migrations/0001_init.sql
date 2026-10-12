-- JKT48Connect TopUp: initial schema.
-- All timestamps are ISO-8601 UTC strings produced by the application, except
-- columns suffixed `_raw` which hold provider-supplied values verbatim.

-- Latest successfully synchronised OkeConnect catalog. Every documented field
-- (kode, keterangan, produk, kategori, harga, status) is preserved verbatim.
CREATE TABLE catalog_products (
  kode TEXT PRIMARY KEY,
  keterangan TEXT NOT NULL,
  produk TEXT NOT NULL,
  kategori TEXT NOT NULL,
  harga_raw TEXT NOT NULL,
  harga INTEGER,                       -- parsed provider cost, NULL when unparseable
  status_raw TEXT NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 0,
  product_type TEXT NOT NULL,          -- topup | nickname_check | other
  game_slug TEXT,
  present INTEGER NOT NULL DEFAULT 1,  -- 0 when absent from the latest successful sync
  last_sync_id INTEGER,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_catalog_game ON catalog_products (game_slug, product_type);

CREATE TABLE catalog_syncs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  ok INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  public_ref TEXT NOT NULL UNIQUE,
  -- SHA-256 of the guest's client token. Doubles as the idempotency key for
  -- order creation, so a retried checkout returns the same order.
  access_hash TEXT NOT NULL UNIQUE,
  game_slug TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_label TEXT NOT NULL,
  user_id TEXT NOT NULL,
  zone_id TEXT,
  dest TEXT NOT NULL,
  nickname TEXT,
  provider_cost INTEGER NOT NULL,
  sell_price INTEGER NOT NULL,
  payment_status TEXT NOT NULL,
  fulfillment_status TEXT NOT NULL,
  needs_review INTEGER NOT NULL DEFAULT 0,
  review_reason TEXT,
  current_payment_id TEXT,
  current_fulfillment_id TEXT,
  invoice_lock_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_orders_review ON orders (needs_review, updated_at);
CREATE INDEX idx_orders_status ON orders (payment_status, fulfillment_status);

-- MYPG QRIS invoices. One order can have several attempts (e.g. creation
-- failed and the guest retried) but at most one is current.
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id),
  mypg_trx_id TEXT UNIQUE,
  requested_amount INTEGER NOT NULL,
  invoice_amount INTEGER,
  qr_image TEXT,
  payment_url TEXT,
  expired_at_raw TEXT,
  expires_at TEXT,                     -- derived UTC instant used for scheduling
  provider_status TEXT,
  paid_at_raw TEXT,
  last_message TEXT,
  status TEXT NOT NULL,                -- CREATING | UNPAID | PAID | CANCEL_REQUESTED | CANCELLED | FAILED | MISMATCH | REVIEW
  check_count INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,
  next_check_at TEXT,
  cancel_attempts INTEGER NOT NULL DEFAULT 0,
  cancel_requested_at TEXT,
  cancel_confirmed_at TEXT,
  cancel_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_payments_due ON payments (status, next_check_at);
CREATE INDEX idx_payments_order ON payments (order_id);

-- H2H fulfillment attempts. The refID is persisted before /trx is called and
-- reused unchanged for every /trx-check.
CREATE TABLE fulfillments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id),
  attempt INTEGER NOT NULL,
  ref_id TEXT NOT NULL UNIQUE,
  product TEXT NOT NULL,
  dest TEXT NOT NULL,
  status TEXT NOT NULL,                -- SUBMITTING | PROCESSING | SUCCESS | FAILED | UNCERTAIN
  sn TEXT,
  last_response TEXT,                  -- provider text with balance redacted
  check_count INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,
  next_check_at TEXT,
  submitted_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (order_id, attempt)
);
CREATE INDEX idx_fulfillments_due ON fulfillments (status, next_check_at);

CREATE TABLE nickname_checks (
  id TEXT PRIMARY KEY,
  ref_id TEXT NOT NULL UNIQUE,
  game_slug TEXT NOT NULL,
  product TEXT NOT NULL,
  dest TEXT NOT NULL,
  status TEXT NOT NULL,                -- SUCCESS | FAILED | UNKNOWN | ERROR
  nickname TEXT,
  server TEXT,
  response TEXT,                       -- provider text with balance redacted
  ip_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_nickname_lookup ON nickname_checks (product, dest, created_at);

-- Append-only audit trail for diagnosis and admin reconciliation.
CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  type TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_events_order ON order_events (order_id, id);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
