import type { NicknameResult } from "../../shared/api";
import { buildDest, findGame, validateAccount } from "../../shared/games";
import { AppError, type AppContext } from "../context";
import { rateLimit } from "../db";
import { ProviderCallError } from "../lib/http";
import { newNicknameRef, sha256Hex, uuid } from "../lib/ids";
import { iso } from "../lib/time";
import { nicknameProductFor } from "./catalog";
import { checkNickname, parseNicknameResponse } from "./h2h";

/**
 * Game nickname check through H2H /trx with a CEK* product. Each check costs
 * the provider price of that product, so results are cached per destination
 * and requests are rate limited per client and per destination.
 * This is never a purchase and never touches orders.
 */

const CACHE_MS = 30 * 60 * 1000;

export async function lookupNickname(
  ctx: AppContext,
  input: { game: string; userId: string; zoneId: string | null; clientKey: string },
): Promise<NicknameResult> {
  const game = findGame(input.game);
  if (!game) throw new AppError(404, "game_not_found", "Game tidak ditemukan.");
  const userId = input.userId.trim();
  const zoneId = game.zone ? (input.zoneId ?? "").trim() : null;
  const errors = validateAccount(game, userId, zoneId);
  if (Object.keys(errors).length) throw new AppError(422, "invalid_account", "Periksa data akun.", errors as Record<string, string>);

  const product = await nicknameProductFor(ctx.db, game);
  if (!product || !game.nicknameProduct) {
    return { status: "unavailable", message: `Cek nama akun belum tersedia untuk ${game.name}. Pastikan ID sudah benar sebelum membayar.` };
  }
  const dest = buildDest(game, userId, zoneId);
  const nowMs = ctx.now();

  const cached = await ctx.db
    .prepare("SELECT status, nickname, server FROM nickname_checks WHERE product = ? AND dest = ? AND status IN ('SUCCESS', 'FAILED') AND created_at > ? ORDER BY created_at DESC LIMIT 1")
    .bind(game.nicknameProduct, dest, iso(nowMs - CACHE_MS))
    .first<{ status: string; nickname: string | null; server: string | null }>();
  if (cached) return toResult(cached.status, cached.nickname, cached.server);

  const clientHash = (await sha256Hex(`nick:${input.clientKey}`)).slice(0, 32);
  const allowed =
    (await rateLimit(ctx.db, `nick:c:${clientHash}`, 10, 600, nowMs)) && (await rateLimit(ctx.db, `nick:d:${game.nicknameProduct}:${dest}`, 4, 600, nowMs));
  if (!allowed) throw new AppError(429, "rate_limited", "Terlalu banyak pengecekan. Coba lagi dalam 10 menit.");

  // refID is stored before the call, like every other H2H operation.
  const id = uuid();
  const refId = newNicknameRef(nowMs);
  await ctx.db
    .prepare("INSERT INTO nickname_checks (id, ref_id, game_slug, product, dest, status, created_at) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)")
    .bind(id, refId, game.slug, game.nicknameProduct, dest, iso(nowMs))
    .run();

  const req = { product: game.nicknameProduct, dest, refID: refId };
  try {
    const res = await checkNickname(ctx.config, req);
    const parsed = res.ok ? parseNicknameResponse(res.text, req) : null;
    const status = parsed?.status ?? "UNKNOWN";
    await ctx.db
      .prepare("UPDATE nickname_checks SET status = ?, nickname = ?, server = ?, response = ? WHERE id = ?")
      .bind(status, parsed?.nickname ?? null, parsed?.server ?? null, parsed ? parsed.redacted.slice(0, 500) : `HTTP ${res.httpStatus}`, id)
      .run();
    return toResult(status, parsed?.nickname ?? null, parsed?.server ?? null);
  } catch (err) {
    const note = err instanceof ProviderCallError ? err.kind : "error";
    await ctx.db.prepare("UPDATE nickname_checks SET status = 'ERROR', response = ? WHERE id = ?").bind(note, id).run();
    return { status: "unavailable", message: "Cek nama akun sedang tidak bisa dihubungi. Coba lagi sebentar lagi." };
  }
}

function toResult(status: string, nickname: string | null, server: string | null): NicknameResult {
  if (status === "SUCCESS") return { status: "found", nickname, server };
  if (status === "FAILED") return { status: "not_found", message: "Akun tidak ditemukan. Periksa kembali ID dan server." };
  return { status: "unavailable", message: "Nama akun belum bisa dipastikan. Periksa ID sebelum membayar." };
}
