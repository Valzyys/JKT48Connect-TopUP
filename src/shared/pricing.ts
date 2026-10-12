/** Margin rule shared by the Worker (authoritative) and the admin preview. */
export interface Margin {
  markupPercent: number;
  markupFlat: number;
  roundTo: number;
}

export const ROUND_TO_OPTIONS = [1, 50, 100, 500, 1000] as const;

/** cost + percentage markup + flat markup, rounded up to `roundTo`, never below cost. */
export function sellingPrice(providerCost: number, margin: Margin): number {
  const raw = providerCost * (1 + margin.markupPercent / 100) + margin.markupFlat;
  const rounded = Math.ceil(raw / margin.roundTo) * margin.roundTo;
  return Math.max(rounded, providerCost);
}
