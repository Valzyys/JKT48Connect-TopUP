import { GAMES } from "../../shared/games";
import type { Config } from "../env";
import { isRecord, parseJson, providerFetch } from "../lib/http";

/**
 * OkeConnectCatalogService: reads the digital product catalog.
 *
 * Documented endpoint: GET https://www.okeconnect.com/harga/json?id=<id>&produk=digital
 * Documented response: a JSON array of { kode, keterangan, produk, kategori, harga, status }.
 */

export interface CatalogItem {
  kode: string;
  keterangan: string;
  produk: string;
  kategori: string;
  harga_raw: string;
  harga: number | null;
  status_raw: string;
  is_available: boolean;
  product_type: "topup" | "nickname_check" | "other";
  game_slug: string | null;
}

export type CatalogParseResult =
  | { ok: true; items: CatalogItem[]; invalid: number }
  | { ok: false; error: string };

const KODE_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;

/** Provider prices arrive as strings ("1420"). Only whole, non-negative rupiah are accepted. */
export function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const m = /^\s*(\d{1,12})(?:\.0+)?\s*$/.exec(value);
  return m ? Number(m[1]) : null;
}

/** `status: "1"` is the only documented active value; anything else is treated as unavailable. */
export function isActiveStatus(value: unknown): boolean {
  return value === "1" || value === 1;
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

const NICKNAME_CODES = new Set(GAMES.map((g) => g.nicknameProduct).filter((c): c is string => !!c));

export function classifyProduct(item: Pick<CatalogItem, "kode" | "keterangan" | "produk">): {
  product_type: CatalogItem["product_type"];
  game_slug: string | null;
} {
  const kode = item.kode.toUpperCase();
  // Nickname checks (CEKML, CEKFF, ...) are utility products, never denominations.
  if (NICKNAME_CODES.has(kode) || /^CEK/i.test(kode) || /cek\s+(nickname|nick|id)/i.test(item.keterangan) || /^cek\s/i.test(item.produk)) {
    const game = GAMES.find((g) => g.nicknameProduct === kode);
    return { product_type: "nickname_check", game_slug: game?.slug ?? null };
  }
  const game = GAMES.find((g) => g.produkPatterns.some((p) => new RegExp(p, "i").test(item.produk)));
  return game ? { product_type: "topup", game_slug: game.slug } : { product_type: "other", game_slug: null };
}

export function parseCatalog(text: string): CatalogParseResult {
  const json = parseJson(text);
  if (!Array.isArray(json)) return { ok: false, error: "Catalog response is not a JSON array" };
  const items: CatalogItem[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  for (const raw of json) {
    if (!isRecord(raw)) {
      invalid++;
      continue;
    }
    const kode = asText(raw.kode);
    const keterangan = asText(raw.keterangan);
    const produk = asText(raw.produk);
    const kategori = asText(raw.kategori);
    const hargaRaw = asText(raw.harga);
    const statusRaw = asText(raw.status);
    if (!kode || !KODE_PATTERN.test(kode) || keterangan === null || produk === null || kategori === null || hargaRaw === null || statusRaw === null || seen.has(kode)) {
      invalid++;
      continue;
    }
    seen.add(kode);
    const harga = parsePrice(raw.harga);
    const base = { kode, keterangan, produk };
    items.push({
      ...base,
      kategori,
      harga_raw: hargaRaw,
      harga,
      status_raw: statusRaw,
      // An unparseable price can never be sold, whatever the status says.
      is_available: isActiveStatus(raw.status) && harga !== null,
      ...classifyProduct(base),
    });
  }
  if (items.length === 0) return { ok: false, error: `Catalog contained no valid products (${invalid} invalid)` };
  return { ok: true, items, invalid };
}

export function catalogRequestUrl(config: Config): string {
  if (!config.catalogId) throw new Error("OKECONNECT_CATALOG_ID is not configured");
  const url = new URL(config.catalogUrl);
  url.searchParams.set("id", config.catalogId);
  url.searchParams.set("produk", config.catalogProduk);
  return url.toString();
}

export async function fetchCatalog(config: Config): Promise<CatalogParseResult> {
  const res = await providerFetch("OkeConnect", catalogRequestUrl(config), { method: "GET", headers: { Accept: "application/json" } }, 15_000);
  if (!res.ok) return { ok: false, error: `OkeConnect responded HTTP ${res.status}` };
  return parseCatalog(res.text);
}
