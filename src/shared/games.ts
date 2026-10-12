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
  tagline: string;
  /**
   * The game's square app icon in /public/games (512px WebP), or null when we
   * have none yet; the poster then draws itself from the game's colour.
   */
  image: string | null;
}

export const GAMES: GameConfig[] = [
  // Order matters: a product joins the first game whose pattern matches its `produk`.
  {
    slug: "mobile-legends",
    name: "Mobile Legends",
    publisher: "Moonton",
    produkPatterns: ["mobile\\s*legends?"],
    userId: { label: "User ID", hint: "Angka di profil, sebelum tanda kurung.", pattern: "^\\d{4,16}$", inputMode: "numeric", maxLength: 16 },
    zone: { label: "Zone ID", hint: "Angka di dalam tanda kurung.", pattern: "^\\d{2,8}$", inputMode: "numeric", maxLength: 8 },
    currency: "Diamonds",
    nicknameProduct: "CEKML",
    tagline: "MOBA 5v5",
    image: "/games/mobile-legends.webp",
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
    tagline: "Battle royale",
    image: "/games/free-fire.webp",
  },
  {
    slug: "pubg-mobile",
    name: "PUBG Mobile",
    publisher: "Level Infinite",
    produkPatterns: ["^tpg game mobile pubg$"],
    userId: { label: "Character ID", hint: "Ada di profil, di bawah nama karakter.", pattern: "^\\d{5,15}$", inputMode: "numeric", maxLength: 15 },
    zone: null,
    currency: "UC",
    nicknameProduct: null,
    tagline: "Battle royale",
    image: "/games/pubg-mobile.webp",
  },
  {
    slug: "magic-chess-go-go",
    name: "Magic Chess: Go Go",
    publisher: "Moonton",
    produkPatterns: ["magic\\s*chess"],
    userId: { label: "User ID", hint: "Angka di profil, sebelum tanda kurung.", pattern: "^\\d{4,16}$", inputMode: "numeric", maxLength: 16 },
    zone: { label: "Zone ID", hint: "Angka di dalam tanda kurung.", pattern: "^\\d{2,8}$", inputMode: "numeric", maxLength: 8 },
    currency: "Diamonds",
    nicknameProduct: null,
    tagline: "Auto battler",
    image: null,
  },
  {
    slug: "honor-of-kings",
    name: "Honor of Kings",
    publisher: "Level Infinite",
    produkPatterns: ["honor\\s*of\\s*kings?"],
    userId: { label: "Player ID", hint: "Ada di profil, ketuk avatar untuk melihatnya.", pattern: "^\\d{6,24}$", inputMode: "numeric", maxLength: 24 },
    zone: null,
    currency: "Tokens",
    nicknameProduct: null,
    tagline: "MOBA 5v5",
    image: "/games/honor-of-kings.webp",
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
    tagline: "FPS",
    image: "/games/call-of-duty-mobile.webp",
  },
  {
    slug: "delta-force",
    name: "Delta Force",
    publisher: "TiMi Studio",
    produkPatterns: ["delta\\s*force"],
    userId: { label: "Player ID", hint: "Ada di profil pemain.", pattern: "^\\d{4,24}$", inputMode: "numeric", maxLength: 24 },
    zone: null,
    currency: "Delta Coins",
    nicknameProduct: null,
    tagline: "Tactical shooter",
    image: "/games/delta-force.webp",
  },
  {
    slug: "arena-breakout",
    name: "Arena Breakout",
    publisher: "Level Infinite",
    produkPatterns: ["arena\\s*breakout"],
    userId: { label: "Player ID", hint: "Ada di profil pemain.", pattern: "^\\d{4,24}$", inputMode: "numeric", maxLength: 24 },
    zone: null,
    currency: "Bonds",
    nicknameProduct: null,
    tagline: "Extraction shooter",
    image: null,
  },
  {
    slug: "blood-strike",
    name: "Blood Strike",
    publisher: "NetEase",
    produkPatterns: ["blood\\s*strike"],
    userId: { label: "User ID", hint: "Ada di profil pemain.", pattern: "^\\d{4,24}$", inputMode: "numeric", maxLength: 24 },
    zone: null,
    currency: "Gold",
    nicknameProduct: null,
    tagline: "FPS battle royale",
    image: "/games/blood-strike.webp",
  },
  {
    slug: "pubg-mobile-global",
    name: "PUBG Mobile Global",
    publisher: "Level Infinite",
    produkPatterns: ["pubg.*global"],
    userId: { label: "Character ID", hint: "Ada di profil, di bawah nama karakter.", pattern: "^\\d{5,15}$", inputMode: "numeric", maxLength: 15 },
    zone: null,
    currency: "UC",
    nicknameProduct: null,
    tagline: "Battle royale, server global",
    image: "/games/pubg-mobile.webp",
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
    tagline: "MOBA 5v5",
    image: null,
  },
  {
    slug: "lokapala",
    name: "Lokapala",
    publisher: "Anantarupa",
    produkPatterns: ["lokapala"],
    userId: { label: "User ID", hint: "Ada di profil pemain.", pattern: "^\\d{4,24}$", inputMode: "numeric", maxLength: 24 },
    zone: null,
    currency: "Citrine",
    nicknameProduct: null,
    tagline: "MOBA lokal",
    image: null,
  },
  {
    slug: "speed-drifter",
    name: "Speed Drifter",
    publisher: "Garena",
    produkPatterns: ["speed\\s*drifter"],
    userId: { label: "User ID", hint: "Ada di profil pemain.", pattern: "^\\d{4,24}$", inputMode: "numeric", maxLength: 24 },
    zone: null,
    currency: "Diamonds",
    nicknameProduct: null,
    tagline: "Racing",
    image: null,
  },
  {
    slug: "werewolf",
    name: "Werewolf",
    publisher: "Werewolf Online",
    produkPatterns: ["werewolf"],
    userId: { label: "User ID", hint: "Ada di profil pemain.", pattern: "^\\d{4,24}$", inputMode: "numeric", maxLength: 24 },
    zone: null,
    currency: "Diamonds",
    nicknameProduct: null,
    tagline: "Social deduction",
    image: null,
  },
  {
    slug: "point-blank",
    name: "Point Blank",
    publisher: "Zepetto",
    produkPatterns: ["point\\s*blank\\s*zepetto"],
    userId: { label: "PB ID", hint: "Nama login Point Blank (bukan nickname).", pattern: "^[A-Za-z0-9_.]{3,24}$", inputMode: "text", maxLength: 24 },
    zone: null,
    currency: "PB Cash",
    nicknameProduct: null,
    tagline: "FPS",
    image: null,
  },
  {
    slug: "zepeto",
    name: "ZEPETO",
    publisher: "Naver Z",
    produkPatterns: ["^tpg zepeto$"],
    userId: { label: "ZEPETO ID", hint: "Ada di profil, diawali tanda @ (tanpa @).", pattern: "^[A-Za-z0-9_.]{3,30}$", inputMode: "text", maxLength: 30 },
    zone: null,
    currency: "Zems",
    nicknameProduct: null,
    tagline: "Metaverse",
    image: null,
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
    errors.userId =
      game.userId.inputMode === "numeric"
        ? `${game.userId.label} tidak valid. Gunakan angka saja, ${game.userId.maxLength} digit maksimal.`
        : `${game.userId.label} tidak valid. Gunakan huruf, angka, titik, atau garis bawah.`;
  }
  if (game.zone) {
    if (!zoneId || !new RegExp(game.zone.pattern).test(zoneId)) {
      errors.zoneId = `${game.zone.label} tidak valid. Gunakan angka saja.`;
    }
  }
  return errors;
}
