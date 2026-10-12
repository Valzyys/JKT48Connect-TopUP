import type { CatalogMeta, GameSummary, ProductOffer } from "../../shared/api";
import { GAMES, type GameConfig } from "../../shared/games";
import type { CatalogRow } from "../db";
import type { Config } from "../env";
import { ProviderCallError } from "../lib/http";
import { iso } from "../lib/time";
import { fetchCatalog } from "./okeconnect";
import { loadPricing, priceFor, type PricingRules } from "./pricing";

/**
 * Catalog synchronisation and reads. The storefront always serves the latest
 * successful sync from D1. A failed sync is recorded and leaves the previous
 * data untouched: live data is never replaced with fabricated data.
 */

export interface SyncOutcome {
  ok: boolean;
  syncId: number;
  itemCount: number;
  invalidCount: number;
  error: string | null;
}

export async function syncCatalog(db: D1Database, config: Config, nowMs: number): Promise<SyncOutcome> {
  const startedAt = iso(nowMs);
  const run = await db.prepare("INSERT INTO catalog_syncs (started_at) VALUES (?) RETURNING id").bind(startedAt).first<{ id: number }>();
  const syncId = run!.id;

  let error: string | null = null;
  let result: Awaited<ReturnType<typeof fetchCatalog>> | null = null;
  try {
    result = await fetchCatalog(config);
    if (!result.ok) error = result.error;
  } catch (err) {
    error = err instanceof ProviderCallError ? err.message : err instanceof Error ? err.message : "Catalog sync failed";
  }

  if (!result || !result.ok) {
    await db.prepare("UPDATE catalog_syncs SET finished_at = ?, ok = 0, error = ? WHERE id = ?").bind(iso(Date.now()), error, syncId).run();
    return { ok: false, syncId, itemCount: 0, invalidCount: 0, error };
  }

  const upsert = db.prepare(
    `INSERT INTO catalog_products
       (kode, keterangan, produk, kategori, harga_raw, harga, status_raw, is_available, product_type, game_slug, present, last_sync_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT (kode) DO UPDATE SET
       keterangan = excluded.keterangan, produk = excluded.produk, kategori = excluded.kategori,
       harga_raw = excluded.harga_raw, harga = excluded.harga, status_raw = excluded.status_raw,
       is_available = excluded.is_available, product_type = excluded.product_type, game_slug = excluded.game_slug,
       present = 1, last_sync_id = excluded.last_sync_id, updated_at = excluded.updated_at`,
  );
  const statements = result.items.map((item) =>
    upsert.bind(
      item.kode,
      item.keterangan,
      item.produk,
      item.kategori,
      item.harga_raw,
      item.harga,
      item.status_raw,
      item.is_available ? 1 : 0,
      item.product_type,
      item.game_slug,
      syncId,
      startedAt,
    ),
  );
  // Products missing from this sync are kept for history but can no longer be sold.
  statements.push(db.prepare("UPDATE catalog_products SET present = 0, is_available = 0 WHERE last_sync_id IS NOT ? ").bind(syncId));
  statements.push(
    db
      .prepare("UPDATE catalog_syncs SET finished_at = ?, ok = 1, item_count = ?, invalid_count = ? WHERE id = ?")
      .bind(iso(Date.now()), result.items.length, result.invalid, syncId),
  );
  for (let i = 0; i < statements.length; i += 80) await db.batch(statements.slice(i, i + 80));
  return { ok: true, syncId, itemCount: result.items.length, invalidCount: result.invalid, error: null };
}

export async function catalogMeta(db: D1Database, config: Config, nowMs: number): Promise<CatalogMeta> {
  const lastOk = await db.prepare("SELECT finished_at FROM catalog_syncs WHERE ok = 1 ORDER BY id DESC LIMIT 1").first<{ finished_at: string }>();
  const last = await db.prepare("SELECT ok FROM catalog_syncs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1").first<{ ok: number }>();
  const syncedAt = lastOk?.finished_at ?? null;
  const tooOld = syncedAt ? nowMs - Date.parse(syncedAt) > config.catalogTtlSeconds * 1000 * 4 : true;
  return { syncedAt, available: syncedAt !== null, stale: syncedAt === null || last?.ok === 0 || tooOld };
}

/** True when the catalog is older than the TTL and no sync started recently (a crude lock). */
export async function catalogNeedsRefresh(db: D1Database, config: Config, nowMs: number): Promise<boolean> {
  const latest = await db.prepare("SELECT started_at, ok, finished_at FROM catalog_syncs ORDER BY id DESC LIMIT 1").first<{ started_at: string; ok: number; finished_at: string | null }>();
  if (!latest) return true;
  const age = nowMs - Date.parse(latest.started_at);
  if (!latest.finished_at && age < 60_000) return false; // another sync in flight
  const lastOk = await db.prepare("SELECT started_at FROM catalog_syncs WHERE ok = 1 ORDER BY id DESC LIMIT 1").first<{ started_at: string }>();
  if (!lastOk) return age > 60_000; // retry a failing first sync at most once a minute
  const okAge = nowMs - Date.parse(lastOk.started_at);
  return okAge > config.catalogTtlSeconds * 1000 && age > 60_000;
}

export async function catalogProduct(db: D1Database, kode: string): Promise<CatalogRow | null> {
  return db.prepare("SELECT * FROM catalog_products WHERE kode = ?").bind(kode).first<CatalogRow>();
}

export async function nicknameProductFor(db: D1Database, game: GameConfig): Promise<CatalogRow | null> {
  if (!game.nicknameProduct) return null;
  const row = await catalogProduct(db, game.nicknameProduct);
  return row && row.is_available === 1 && row.present === 1 && row.product_type === "nickname_check" ? row : null;
}

export function toOffer(row: CatalogRow, rules: PricingRules): ProductOffer | null {
  if (row.harga === null) return null;
  return { code: row.kode, label: row.keterangan, price: priceFor(row.kode, row.harga, rules).price, available: row.is_available === 1 };
}

/** Every storefront game with its sellable denominations, priced with the current rules. */
export async function gameSummaries(db: D1Database, config: Config, nowMs: number): Promise<GameSummary[]> {
  const rules = await loadPricing(db, config);
  const { results: rows } = await db
    .prepare("SELECT * FROM catalog_products WHERE product_type = 'topup' AND present = 1 AND game_slug IS NOT NULL ORDER BY harga ASC")
    .all<CatalogRow>();
  const nick = await db
    .prepare("SELECT kode FROM catalog_products WHERE product_type = 'nickname_check' AND present = 1 AND is_available = 1")
    .all<{ kode: string }>();
  const nickCodes = new Set(nick.results.map((r) => r.kode));
  const popular = await db
    .prepare("SELECT game_slug, COUNT(*) AS n FROM orders WHERE fulfillment_status = 'SUCCESS' AND created_at > ? GROUP BY game_slug")
    .bind(new Date(nowMs - 30 * 24 * 3600 * 1000).toISOString())
    .all<{ game_slug: string; n: number }>();
  return GAMES.map((g) => {
    const products = rows.filter((r) => r.game_slug === g.slug).map((r) => toOffer(r, rules)).filter((p): p is ProductOffer => p !== null);
    // Overrides can reorder prices, so sort by what the guest actually pays.
    products.sort((a, b) => a.price - b.price);
    const live = products.filter((p) => p.available);
    return {
      slug: g.slug,
      name: g.name,
      publisher: g.publisher,
      currency: g.currency,
      tagline: g.tagline,
      image: g.image,
      productCount: live.length,
      recentOrders: popular.results.find((r) => r.game_slug === g.slug)?.n ?? 0,
      startingPrice: live[0]?.price ?? null,
      nicknameCheck: g.nicknameProduct !== null && nickCodes.has(g.nicknameProduct),
      products,
    };
  });
}
