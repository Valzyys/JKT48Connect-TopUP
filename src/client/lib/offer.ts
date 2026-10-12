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
