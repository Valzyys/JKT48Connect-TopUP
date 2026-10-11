/**
 * Mapping layer between OkeConnect catalog records and storefront games.
 *
 * A catalog product belongs to a game when its `produk` field matches one of
 * the game's patterns. Products that match no game are kept in the catalog
 * (visible to admins) but never offered for sale, because their destination
 * format is unknown.
 *
 * `nicknameProduct` names the H2H nickname-check code documented for the game.
 * Nickname checking is offered only when that code is also present and active
 * in the synchronised catalog.
 */
export interface GameField {
  label: string;
  hint: string;
  pattern: string; // RegExp source, shared with the browser for inline validation
  inputMode: "numeric" | "text";
  maxLength: number;
}

export interface GameConfig {
  slug: string;
  name: string;
  publisher: string;
  produkPatterns: string[]; // case-insensitive RegExp sources matched against `produk`
  userId: GameField;
  zone: GameField | null;
  currency: string; // in-game currency name, used in copy
  nicknameProduct: string | null;
  hue: number; // OKLCH hue for the game's tile tint
}

export const GAMES: GameConfig[] = [
  {
    slug: "mobile-legends",
    name: "Mobile Legends",
    publisher: "Moonton",
    produkPatterns: ["mobile\\s*legends?"],
    userId: { label: "User ID", hint: "Angka di profil, sebelum tanda kurung.", pattern: "^\\d{4,16}$", inputMode: "numeric", maxLength: 16 },
    zone: { label: "Zone ID", hint: "Angka di dalam tanda kurung.", pattern: "^\\d{2,8}$", inputMode: "numeric", maxLength: 8 },
    currency: "Diamonds",
    nicknameProduct: "CEKML",
    hue: 250,
  },
  {
    slug: "free-fire",
    name: "Free Fire",
    publisher: "Garena",
    produkPatterns: ["free\\s*fire"],
    userId: { label: "Player ID", hint: "Ada di halaman profil, di bawah nama.", pattern: "^\\d{6,16}$", inputMode: "numeric", maxLength: 16 },
    zone: null,
    currency: "Diamonds",
    nicknameProduct: "CEKFF",
    hue: 45,
  },
  {
    slug: "call-of-duty-mobile",
    name: "Call of Duty Mobile",
    publisher: "Activision",
    produkPatterns: ["call\\s*of\\s*duty", "\\bcodm\\b"],
    userId: { label: "Open ID", hint: "Ada di Settings, tab Legal and Privacy.", pattern: "^\\d{6,24}$", inputMode: "numeric", maxLength: 24 },
    zone: null,
    currency: "CP",
    nicknameProduct: "CEKCODM",
    hue: 145,
  },
  {
    slug: "arena-of-valor",
    name: "Arena of Valor",
    publisher: "Garena",
    produkPatterns: ["arena\\s*of\\s*valor", "\\baov\\b"],
    userId: { label: "Player ID", hint: "Ada di halaman profil pemain.", pattern: "^\\d{6,24}$", inputMode: "numeric", maxLength: 24 },
    zone: null,
    currency: "Vouchers",
    nicknameProduct: "CEKAOV",
    hue: 15,
  },
];

export function findGame(slug: string): GameConfig | undefined {
  return GAMES.find((g) => g.slug === slug);
}

/**
 * Destination string sent to H2H. Games with a zone use the documented
 * format: user ID immediately followed by the zone ID (123456781234).
 */
export function buildDest(game: GameConfig, userId: string, zoneId: string | null): string {
  return game.zone ? `${userId}${zoneId ?? ""}` : userId;
}

export function validateAccount(
  game: GameConfig,
  userId: string,
  zoneId: string | null,
): { userId?: string; zoneId?: string } {
  const errors: { userId?: string; zoneId?: string } = {};
  if (!new RegExp(game.userId.pattern).test(userId)) {
    errors.userId = `${game.userId.label} tidak valid. Gunakan angka saja, ${game.userId.maxLength} digit maksimal.`;
  }
  if (game.zone) {
    if (!zoneId || !new RegExp(game.zone.pattern).test(zoneId)) {
      errors.zoneId = `${game.zone.label} tidak valid. Gunakan angka saja.`;
    }
  }
  return errors;
}
