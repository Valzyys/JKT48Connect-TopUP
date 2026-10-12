/**
 * Turns an OkeConnect product label into what a denomination tile shows.
 *
 * Live labels look like "12 (11+1) Diamond Mobile Legend", "Honor of Kings
 * 80 + 8 Tokens", "COD Mobile 26 CP", "40 AOV Game" or "Starlight Membership".
 * Amount packs become { kind: "amount" } with the number, an optional bonus and
 * the unit; anything else (passes, memberships, bundles) is a "pack" shown by
 * its name. The game's own name is stripped wherever it appears.
 */
export type Offer =
  | { kind: "amount"; amount: number; bonus: number | null; unit: string }
  | { kind: "pack"; title: string };

// Ways the catalog spells game names inside labels, longest first.
const ALIASES = [
  "pubg mobile global",
  "pubg mobile",
  "magic chess go go",
  "mobile legends",
  "mobile legend",
  "honor of kings",
  "honor of king",
  "cod mobile",
  "call of duty mobile",
  "aov game",
  "arena of valor",
  "arena breakout",
  "blood strike",
  "speed drifter",
  "free fire",
  "lokapala",
  "werewolf",
  "zepeto",
  "top up",
];

const NUM = "(\\d[\\d.,]*)";
const AMOUNT = new RegExp(`^${NUM}(?=\\s|\\(|\\+|$)\\s*(?:\\(\\s*${NUM}\\s*\\+\\s*${NUM}\\s*\\)|\\+\\s*${NUM})?\\s*(.*)$`, "i");

function toNumber(s: string): number {
  return Number(s.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
}

export function parseOffer(label: string, gameName: string, currency: string): Offer {
  let text = ` ${label} `;
  for (const alias of [gameName.toLowerCase().replace(/[:]/g, ""), ...ALIASES]) {
    text = text.replace(new RegExp(`\\s${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s)`, "gi"), " ");
  }
  text = text.replace(/\s+/g, " ").trim();
  const m = AMOUNT.exec(text);
  if (!m) return { kind: "pack", title: text || label.trim() };
  const [, amountRaw, , inParens, plus, rest] = m;
  const bonusRaw = inParens ?? plus ?? null;
  const unit = (rest ?? "").trim() || currency;
  return { kind: "amount", amount: toNumber(amountRaw!), bonus: bonusRaw ? toNumber(bonusRaw) : null, unit };
}

export type CategoryId = "amount" | "pass" | "levelup" | "bundle" | "other";

const CATEGORY_ORDER: CategoryId[] = ["amount", "pass", "levelup", "bundle", "other"];

/** Which tab an offer belongs to; each game ends up with only the tabs its catalog fills. */
export function categoryOf(offer: Offer): CategoryId {
  if (offer.kind === "amount") return "amount";
  const t = offer.title.toLowerCase();
  if (/level\s*up/.test(t)) return "levelup";
  if (/pass|member|weekly|mingguan|bulanan|monthly|card|starlight|twilight|booyah/.test(t)) return "pass";
  if (/bundle|paket|pilihan|supplies|kotak|percobaan|genesis|reshape|premium|coupon|kupon/.test(t)) return "bundle";
  return "other";
}

export function categoryLabel(id: CategoryId, currency: string): string {
  return { amount: currency, pass: "Pass & membership", levelup: "Level Up Pass", bundle: "Bundle", other: "Lainnya" }[id];
}

export function sortCategories(ids: Iterable<CategoryId>): CategoryId[] {
  const set = new Set(ids);
  return CATEGORY_ORDER.filter((id) => set.has(id));
}
