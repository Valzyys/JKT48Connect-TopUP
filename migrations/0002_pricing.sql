-- Admin-controlled pricing. Absent rows fall back to the PRICE_* vars in
-- wrangler.jsonc. Orders keep the price they were created with.

-- Key/value store; `pricing` holds {"markupPercent","markupFlat","roundTo"} as JSON.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Fixed selling price for one product. Ignored while it is below the current
-- provider cost, so a cost increase can never turn into a sale at a loss.
CREATE TABLE price_overrides (
  kode TEXT PRIMARY KEY,
  sell_price INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE pricing_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
