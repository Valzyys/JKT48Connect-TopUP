import { vi } from "vitest";
import type { AppContext } from "../src/worker/context";
import { type Env, loadConfig } from "../src/worker/env";
import { buildApp } from "../src/worker/index";
import { createTestDb } from "./d1-shim";

/** Documented OkeConnect example records, used as fixtures only. */
export const CATALOG_FIXTURE = [
  { kode: "ML5", keterangan: "Mobile Legends 5 Diamonds", produk: "TPG Diamond Mobile Legends", kategori: "Game", harga: "1420", status: "1" },
  { kode: "ML86", keterangan: "Mobile Legends 86 Diamonds", produk: "TPG Diamond Mobile Legends", kategori: "Game", harga: "21500", status: "1" },
  { kode: "FF50", keterangan: "Free Fire 50 Diamonds", produk: "TPG Diamond Free Fire", kategori: "Game", harga: "6450", status: "1" },
  { kode: "CEKML", keterangan: "Cek Nickname Mobile Legends", produk: "Cek Produk Digital H2H", kategori: "Game", harga: "1", status: "1" },
];

export const TEST_ENV_VARS = {
  MYPG_API_KEY: "test-mypg-key",
  OKECONNECT_CATALOG_ID: "test-catalog-id",
  ADMIN_TOKEN: "test-admin-token-0123456789abcdef",
};

export type Route = (url: URL, init: RequestInit & { bodyText: string }) => Response | Promise<Response> | null | undefined;

export interface FetchCall {
  url: URL;
  method: string;
  body: string;
}

/**
 * Replaces global fetch. Routes are tried in order; an unmatched request fails
 * the test, so no real provider is ever contacted.
 */
export function mockFetch(routes: Route[]) {
  const calls: FetchCall[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const bodyText = typeof init.body === "string" ? init.body : "";
    calls.push({ url, method: init.method ?? "GET", body: bodyText });
    const answer = (async () => {
      for (const route of routes) {
        const res = await route(url, { ...init, bodyText });
        if (res) return res;
      }
      throw new Error(`Unexpected fetch in test: ${init.method ?? "GET"} ${url.origin}${url.pathname}`);
    })();
    // Like real fetch, reject when the caller aborts (used for timeout tests).
    const signal = init.signal;
    if (!signal) return answer;
    return Promise.race([
      answer,
      new Promise<Response>((_, reject) => {
        if (signal.aborted) reject(new DOMException("Aborted", "AbortError"));
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
    ]);
  });
  return { calls, spy };
}

export function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function isMypg(url: URL, action: string): boolean {
  return url.origin === "https://yobasepay.net" && url.pathname === "/api_my" && url.searchParams.get("action") === action;
}

export function isH2H(url: URL, path: "/trx" | "/trx-check"): boolean {
  return url.origin === "https://h2h.jkt48connect.com" && url.pathname === path;
}

export function catalogRoute(): Route {
  return (url) => (url.hostname === "www.okeconnect.com" ? json(CATALOG_FIXTURE) : null);
}

export function makeHarness(start = Date.parse("2026-10-11T11:55:00Z")) {
  let nowMs = start;
  const db = createTestDb();
  const env: Env = { DB: db, ...TEST_ENV_VARS };
  const deferred: Promise<unknown>[] = [];
  const ctx: AppContext = {
    db,
    config: loadConfig(env),
    now: () => nowMs,
    defer: (p) => {
      deferred.push(p);
    },
  };
  const app = buildApp(() => nowMs);
  const executionCtx = {
    waitUntil: (p: Promise<unknown>) => {
      deferred.push(p);
    },
    passThroughOnException: () => {},
    props: {},
  };
  return {
    db,
    env,
    ctx,
    advance: (seconds: number) => {
      nowMs += seconds * 1000;
    },
    now: () => nowMs,
    async settle() {
      while (deferred.length) await Promise.allSettled(deferred.splice(0));
    },
    async request(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
      const req = new Request(`https://topup.test${path}`, {
        method: init.method ?? (init.body ? "POST" : "GET"),
        headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7", ...init.headers },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      const res = await app.fetch(req, env, executionCtx as unknown as ExecutionContext);
      return { status: res.status, body: (await res.json()) as any };
    },
  };
}

export const CLIENT_TOKEN = "tok_0123456789abcdefghijklmnopqrstuvwxyzABCD";
