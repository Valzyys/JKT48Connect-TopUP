import { type Margin, ROUND_TO_OPTIONS, sellingPrice } from "../../shared/pricing";
import type { Config } from "../env";

/**
 * PricingService. Provider cost (OkeConnect `harga`) is never shown to guests.
 *
 * Selling price, in order of precedence:
 *   1. an admin override for the product, when it is not below the current cost;
 *   2. cost + percentage markup + flat markup, rounded up to `roundTo`.
 * Global rules come from the `settings` table, falling back to the PRICE_* vars.
 */

export { ROUND_TO_OPTIONS, sellingPrice, type Margin };

export interface PricingRules extends Margin {
  overrides: Map<string, number>;
}

export type PriceSource = "margin" | "override" | "override_below_cost";

export function priceFor(kode: string, providerCost: number, rules: PricingRules): { price: number; source: PriceSource } {
  const override = rules.overrides.get(kode);
  if (override !== undefined) {
    if (override >= providerCost) return { price: override, source: "override" };
    return { price: sellingPrice(providerCost, rules), source: "override_below_cost" };
  }
  return { price: sellingPrice(providerCost, rules), source: "margin" };
}

/** Validates admin input; returns field errors keyed like the request body. */
export function validateMargin(input: Record<string, unknown>): { margin?: Margin; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const pct = Number(input.markupPercent);
  const flat = Number(input.markupFlat);
  const round = Number(input.roundTo);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100 || Math.abs(Math.round(pct * 100) - pct * 100) > 1e-9) errors.markupPercent = "Isi 0 sampai 100, maksimal 2 desimal.";
  if (!Number.isInteger(flat) || flat < 0 || flat > 1_000_000) errors.markupFlat = "Isi bilangan bulat 0 sampai 1.000.000.";
  if (!(ROUND_TO_OPTIONS as readonly number[]).includes(round)) errors.roundTo = `Pilih salah satu: ${ROUND_TO_OPTIONS.join(", ")}.`;
  return Object.keys(errors).length ? { errors } : { margin: { markupPercent: pct, markupFlat: flat, roundTo: round }, errors };
}

function parseMargin(json: string): Margin | null {
  try {
    const { margin } = validateMargin(JSON.parse(json) as Record<string, unknown>);
    return margin ?? null;
  } catch {
    return null;
  }
}

export async function loadMargin(db: D1Database, config: Config): Promise<{ margin: Margin; source: "admin" | "default"; updatedAt: string | null }> {
  const row = await db.prepare("SELECT value, updated_at FROM settings WHERE key = 'pricing'").first<{ value: string; updated_at: string }>();
  const stored = row ? parseMargin(row.value) : null;
  return stored ? { margin: stored, source: "admin", updatedAt: row!.updated_at } : { margin: config.pricing, source: "default", updatedAt: null };
}

export async function loadPricing(db: D1Database, config: Config): Promise<PricingRules> {
  const [{ margin }, overrides] = await Promise.all([
    loadMargin(db, config),
    db.prepare("SELECT kode, sell_price FROM price_overrides").all<{ kode: string; sell_price: number }>(),
  ]);
  return { ...margin, overrides: new Map(overrides.results.map((r) => [r.kode, r.sell_price])) };
}

export type InvoiceAmountCheck =
  | { ok: true; adjustment: number }
  | { ok: false; reason: "below_requested" | "above_tolerance"; adjustment: number };

/**
 * Explicit policy for the amount MYPG returns on createpayment. The documented
 * example asks for 23000 and gets 23412; the reason is undocumented (fee or
 * unique code). The difference is accepted only when it is non-negative and
 * within MYPG_MAX_AMOUNT_DELTA, and is always shown to the guest.
 */
export function checkInvoiceAmount(requested: number, returned: number, maxDelta: number): InvoiceAmountCheck {
  const adjustment = returned - requested;
  if (adjustment < 0) return { ok: false, reason: "below_requested", adjustment };
  if (adjustment > maxDelta) return { ok: false, reason: "above_tolerance", adjustment };
  return { ok: true, adjustment };
}
