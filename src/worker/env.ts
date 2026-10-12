export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;

  TOPUP_H2H_BASE?: string;
  MYPG_BASE?: string;
  OKECONNECT_CATALOG_URL?: string;
  OKECONNECT_CATALOG_PRODUK?: string;

  PRICE_MARKUP_PERCENT?: string;
  PRICE_MARKUP_FLAT?: string;
  PRICE_ROUND_TO?: string;
  MYPG_MAX_AMOUNT_DELTA?: string;
  MYPG_TIME_OFFSET?: string;
  MYPG_DEFAULT_TTL_MINUTES?: string;
  CATALOG_TTL_SECONDS?: string;

  // Secrets: configured with `wrangler secret put`, never committed.
  MYPG_API_KEY?: string;
  OKECONNECT_CATALOG_ID?: string;
  ADMIN_TOKEN?: string;
}

export interface Config {
  h2hBase: string;
  mypgBase: string;
  mypgApiKey: string | null;
  catalogUrl: string;
  catalogId: string | null;
  catalogProduk: string;
  catalogTtlSeconds: number;
  pricing: { markupPercent: number; markupFlat: number; roundTo: number };
  mypgMaxAmountDelta: number;
  mypgTimeOffset: string;
  mypgDefaultTtlMinutes: number;
  adminToken: string | null;
}

function num(value: string | undefined, fallback: number, min = 0): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

function secret(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function httpsBase(value: string | undefined, fallback: string): string {
  const v = (value ?? fallback).trim().replace(/\/+$/, "");
  const url = new URL(v);
  if (url.protocol !== "https:") throw new Error(`Provider base must use HTTPS: ${url.origin}`);
  return v;
}

/** Single place where all provider configuration is read. */
export function loadConfig(env: Env): Config {
  const offset = (env.MYPG_TIME_OFFSET ?? "+07:00").trim();
  return {
    h2hBase: httpsBase(env.TOPUP_H2H_BASE, "https://h2h.jkt48connect.com"),
    mypgBase: httpsBase(env.MYPG_BASE, "https://yobasepay.net/api_my"),
    mypgApiKey: secret(env.MYPG_API_KEY),
    catalogUrl: httpsBase(env.OKECONNECT_CATALOG_URL, "https://www.okeconnect.com/harga/json"),
    catalogId: secret(env.OKECONNECT_CATALOG_ID),
    catalogProduk: (env.OKECONNECT_CATALOG_PRODUK ?? "digital").trim() || "digital",
    catalogTtlSeconds: num(env.CATALOG_TTL_SECONDS, 900, 60),
    pricing: {
      markupPercent: num(env.PRICE_MARKUP_PERCENT, 5),
      markupFlat: Math.round(num(env.PRICE_MARKUP_FLAT, 500)),
      roundTo: Math.max(1, Math.round(num(env.PRICE_ROUND_TO, 100, 1))),
    },
    mypgMaxAmountDelta: Math.round(num(env.MYPG_MAX_AMOUNT_DELTA, 1000)),
    mypgTimeOffset: /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : "+07:00",
    mypgDefaultTtlMinutes: num(env.MYPG_DEFAULT_TTL_MINUTES, 30, 1),
    adminToken: secret(env.ADMIN_TOKEN),
  };
}
