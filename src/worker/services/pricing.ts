import type { Config } from "../env";

/**
 * PricingService: provider cost (OkeConnect `harga`) is never shown to guests.
 * Selling price = cost + percentage markup + flat markup, rounded up.
 */
export function sellingPrice(providerCost: number, pricing: Config["pricing"]): number {
  const raw = providerCost * (1 + pricing.markupPercent / 100) + pricing.markupFlat;
  const rounded = Math.ceil(raw / pricing.roundTo) * pricing.roundTo;
  return Math.max(rounded, providerCost);
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
