import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncCatalog } from "../src/worker/services/catalog";
import { runReconcile } from "../src/worker/services/reconcile";
import { CLIENT_TOKEN, catalogRoute, isH2H, isMypg, json, makeHarness, mockFetch, type Route, text } from "./helpers";

/** A scriptable fake of the three providers. Every request is recorded. */
function providers() {
  const state = {
    createAmount: (requested: number) => requested + 412,
    paymentStatus: "UNPAID" as string,
    paidAmount: null as number | null,
    trxResponse: (q: URLSearchParams): Response | Promise<Response> =>
      text(`Transaksi ${q.get("product")} ke ${q.get("dest")} SUKSES. SN: 2610110982341234871. Sisa Saldo Rp 2.450.000`),
    trxCheckResponse: (q: URLSearchParams): Response =>
      text(`Cek status ${q.get("product")} ke ${q.get("dest")}: SUKSES. SN: 2610110982341234871. Sisa Saldo Rp 2.450.000`),
    nicknameResponse: (q: URLSearchParams): Response => text(`CEKML ke ${q.get("dest")} SUKSES. a.n. ZeeJKT48 (Server: 1234). Sisa Saldo Rp 2.449.999`),
    cancelResponse: () => json({ status: true, message: "Payment cancelled successfully" }),
    createCount: 0,
  };
  let invoiceAmount = 0;
  const routes: Route[] = [
    catalogRoute(),
    (url, init) => {
      if (!isMypg(url, "createpayment")) return null;
      state.createCount++;
      const form = new URLSearchParams(init.bodyText);
      expect(form.get("api_key")).toBe("test-mypg-key");
      invoiceAmount = state.createAmount(Number(form.get("amount")));
      const trx = `MY-20261011-${88492018 + state.createCount}`;
      return json({
        status: true,
        message: "Payment created successfully",
        data: { trx_id: trx, amount: invoiceAmount, qr_image: `https://yobasepay.net/qr/${trx}.png`, payment_url: `https://yobasepay.net/pay/${trx}`, expired_at: "2026-10-11 19:30:00" },
      });
    },
    (url, init) => {
      if (!isMypg(url, "checkstatus")) return null;
      const trx = new URLSearchParams(init.bodyText).get("trxid");
      if (state.paymentStatus === "PAID") {
        return json({ status: true, message: "Payment found", data: { trx_id: trx, status: "PAID", amount: state.paidAmount ?? invoiceAmount, paid_at: "2026-10-11 19:04:12" } });
      }
      return json({ status: true, message: "Payment pending", data: { trx_id: trx, status: state.paymentStatus, amount: invoiceAmount, expired_at: "2026-10-11 19:30:00" } });
    },
    (url) => (isMypg(url, "cancelpayment") ? state.cancelResponse() : null),
    (url) => {
      if (!isH2H(url, "/trx")) return null;
      return url.searchParams.get("product")?.startsWith("CEK") ? state.nicknameResponse(url.searchParams) : state.trxResponse(url.searchParams);
    },
    (url) => (isH2H(url, "/trx-check") ? state.trxCheckResponse(url.searchParams) : null),
  ];
  return { state, routes };
}

/**
 * Advances fake timers one second at a time until `isDone`. Between steps it
 * yields to real I/O (crypto.subtle.digest is not faked), so a provider
 * timeout armed after an async step is still reached.
 */
async function stepClock(isDone: () => boolean) {
  for (let i = 0; i < 120 && !isDone(); i++) {
    await vi.advanceTimersByTimeAsync(1_000);
    await new Promise((r) => setImmediate(r));
  }
}

let h: ReturnType<typeof makeHarness>;
let fake: ReturnType<typeof providers>;
let calls: ReturnType<typeof mockFetch>["calls"];

beforeEach(async () => {
  h = makeHarness();
  fake = providers();
  calls = mockFetch(fake.routes).calls;
  await syncCatalog(h.db, h.ctx.config, h.now());
});

afterEach(() => {
  vi.restoreAllMocks();
});

const orderBody = { game: "mobile-legends", productCode: "ML86", userId: "12345678", zoneId: "1234", clientToken: CLIENT_TOKEN };
const auth = { "x-order-token": CLIENT_TOKEN };

async function placeOrder() {
  const res = await h.request("/api/orders", { body: orderBody });
  expect(res.status).toBe(201);
  return res.body;
}

function count(path: "/trx" | "/trx-check", product = "ML86") {
  return calls.filter((c) => c.url.pathname === path && c.url.searchParams.get("product") === product).length;
}

describe("guest checkout", () => {
  it("lists games and denominations without login, never exposing provider cost", async () => {
    const games = await h.request("/api/games");
    expect(games.status).toBe(200);
    const ml = games.body.games.find((g: any) => g.slug === "mobile-legends");
    expect(ml).toMatchObject({ productCount: 2, nicknameCheck: true });
    const detail = await h.request("/api/games/mobile-legends");
    expect(detail.body.products.map((p: any) => p.code)).toEqual(["ML5", "ML86"]); // CEKML is not a denomination
    expect(JSON.stringify(detail.body)).not.toContain("21500");
  });

  it("creates an order and a QRIS invoice with a server-computed amount", async () => {
    const order = await placeOrder();
    expect(order).toMatchObject({ status: "WAITING_PAYMENT", price: 23100, account: { userId: "12345678", zoneId: "1234" } });
    expect(order.payment).toMatchObject({ requestedAmount: 23100, invoiceAmount: 23512, adjustment: 412, qrImage: "https://yobasepay.net/qr/MY-20261011-88492019.png" });
    const create = calls.find((c) => isMypg(c.url, "createpayment"))!;
    expect(new URLSearchParams(create.body).get("amount")).toBe("23100");
    expect(JSON.stringify(order)).not.toContain("test-mypg-key");
  });

  it("ignores a browser-supplied amount", async () => {
    const res = await h.request("/api/orders", { body: { ...orderBody, amount: 1, price: 1 } });
    expect(res.body.payment.requestedAmount).toBe(23100);
  });

  it("returns the same order and invoice when the checkout is retried or the page is refreshed", async () => {
    const first = await placeOrder();
    const again = await h.request("/api/orders", { body: orderBody });
    expect(again.body.ref).toBe(first.ref);
    for (let i = 0; i < 3; i++) await h.request(`/api/orders/${first.ref}`, { headers: auth });
    expect(fake.state.createCount).toBe(1);
  });

  it("rejects a reused checkout token for a different order", async () => {
    await placeOrder();
    const res = await h.request("/api/orders", { body: { ...orderBody, productCode: "ML5" } });
    expect(res.status).toBe(409);
  });

  it("validates the account and product on the server", async () => {
    const bad = await h.request("/api/orders", { body: { ...orderBody, zoneId: "" } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.zoneId).toBeTruthy();
    const wrongGame = await h.request("/api/orders", { body: { ...orderBody, productCode: "FF50" } });
    expect(wrongGame.status).toBe(422);
    const utility = await h.request("/api/orders", { body: { ...orderBody, productCode: "CEKML" } });
    expect(utility.status).toBe(422);
  });
});

describe("secure guest lookup", () => {
  it("requires the order token for the full view", async () => {
    const order = await placeOrder();
    expect((await h.request(`/api/orders/${order.ref}`)).status).toBe(404);
    expect((await h.request(`/api/orders/${order.ref}`, { headers: { "x-order-token": "x".repeat(40) } })).status).toBe(404);
    expect((await h.request(`/api/orders/${order.ref}`, { headers: auth })).status).toBe(200);
  });

  it("offers a reduced lookup by reference plus game ID, without payment details", async () => {
    const order = await placeOrder();
    const ok = await h.request("/api/orders/lookup", { body: { ref: order.ref, userId: "12345678", zoneId: "1234" } });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ref: order.ref, status: "WAITING_PAYMENT", account: { userIdMasked: "12****78" } });
    expect(JSON.stringify(ok.body)).not.toContain("yobasepay");
    const wrongZone = await h.request("/api/orders/lookup", { body: { ref: order.ref, userId: "12345678", zoneId: "9999" } });
    expect(wrongZone.status).toBe(404);
  });
});

describe("payment verification and fulfillment", () => {
  it("fulfills once after a verified PAID and never exposes the provider balance", async () => {
    const order = await placeOrder();
    fake.state.paymentStatus = "PAID";
    const view = await h.request(`/api/orders/${order.ref}`, { headers: auth });
    expect(["PAID", "PROCESSING", "SUCCESS"]).toContain(view.body.status);
    await h.settle();

    const done = await h.request(`/api/orders/${order.ref}`, { headers: auth });
    expect(done.body).toMatchObject({ status: "SUCCESS", message: "Top-up berhasil.", fulfillment: { sn: "2610110982341234871" } });
    expect(JSON.stringify(done.body)).not.toMatch(/Saldo|2\.450\.000/);

    const trx = calls.filter((c) => isH2H(c.url, "/trx") && c.url.searchParams.get("product") === "ML86");
    expect(trx).toHaveLength(1);
    expect(trx[0]!.url.searchParams.get("dest")).toBe("123456781234");
    expect(trx[0]!.url.searchParams.get("refID")).toMatch(/^OC-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  });

  it("does not fulfill twice when PAID is received repeatedly", async () => {
    const order = await placeOrder();
    fake.state.paymentStatus = "PAID";
    await Promise.all([
      h.request(`/api/orders/${order.ref}`, { headers: auth }),
      h.request(`/api/orders/${order.ref}`, { headers: auth }),
    ]);
    h.advance(10);
    await h.request(`/api/orders/${order.ref}`, { headers: auth });
    h.advance(60);
    await runReconcile(h.ctx);
    await h.settle();
    expect(count("/trx")).toBe(1);
  });

  it("does not mark paid on an amount mismatch", async () => {
    const order = await placeOrder();
    fake.state.paymentStatus = "PAID";
    fake.state.paidAmount = 1000;
    const view = await h.request(`/api/orders/${order.ref}`, { headers: auth });
    await h.settle();
    expect(view.body.status).toBe("VERIFYING_PAYMENT");
    expect(count("/trx")).toBe(0);
  });

  it("keeps an undocumented MYPG status unpaid and flags it", async () => {
    const order = await placeOrder();
    fake.state.paymentStatus = "SETTLING";
    const view = await h.request(`/api/orders/${order.ref}`, { headers: auth });
    expect(view.body.status).toBe("WAITING_PAYMENT");
    const flagged = await h.db.prepare("SELECT needs_review, review_reason FROM orders").first<any>();
    expect(flagged).toMatchObject({ needs_review: 1, review_reason: "undocumented_payment_status:SETTLING" });
  });

  it("throttles status-page checks against MYPG", async () => {
    const order = await placeOrder();
    for (let i = 0; i < 5; i++) await h.request(`/api/orders/${order.ref}`, { headers: auth });
    expect(calls.filter((c) => isMypg(c.url, "checkstatus"))).toHaveLength(1);
    h.advance(6);
    await h.request(`/api/orders/${order.ref}`, { headers: auth });
    expect(calls.filter((c) => isMypg(c.url, "checkstatus"))).toHaveLength(2);
  });

  it("treats an H2H timeout as uncertain, never resubmits, and reconciles with the same refID", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const order = await placeOrder();
      fake.state.paymentStatus = "PAID";
      fake.state.trxResponse = () => new Promise<Response>(() => {}); // never answers
      await h.request(`/api/orders/${order.ref}`, { headers: auth });
      let done = false;
      const settled = h.settle().finally(() => (done = true));
      await stepClock(() => done);
      await settled;
    } finally {
      vi.useRealTimers();
    }
    const order = await h.db.prepare("SELECT public_ref, fulfillment_status FROM orders").first<any>();
    expect(order.fulfillment_status).toBe("UNCERTAIN");
    const uncertain = await h.request(`/api/orders/${order.public_ref}`, { headers: auth });
    expect(uncertain.body).toMatchObject({ status: "VERIFYING", message: "Status top-up sedang diverifikasi." });

    const refId = calls.find((c) => isH2H(c.url, "/trx") && c.url.searchParams.get("product") === "ML86")!.url.searchParams.get("refID");
    fake.state.trxCheckResponse = (q) => text(`Transaksi ${q.get("product")} ke ${q.get("dest")} masih dalam antrean/proses provider.`);
    h.advance(61);
    await runReconcile(h.ctx);
    expect((await h.db.prepare("SELECT fulfillment_status FROM orders").first<any>()).fulfillment_status).toBe("PROCESSING");

    fake.state.trxCheckResponse = (q) => text(`Cek status ${q.get("product")} ke ${q.get("dest")}: SUKSES. SN: 77. Sisa Saldo Rp 1`);
    h.advance(120);
    await runReconcile(h.ctx);
    expect((await h.db.prepare("SELECT fulfillment_status FROM orders").first<any>()).fulfillment_status).toBe("SUCCESS");

    expect(count("/trx")).toBe(1);
    const checks = calls.filter((c) => isH2H(c.url, "/trx-check"));
    expect(checks.length).toBe(2);
    for (const c of checks) {
      expect(c.url.searchParams.get("refID")).toBe(refId);
      expect(c.url.searchParams.get("dest")).toBe("123456781234");
    }
  });

  it("keeps an unrecognised /trx response uncertain instead of successful", async () => {
    const order = await placeOrder();
    fake.state.paymentStatus = "PAID";
    fake.state.trxResponse = () => text("OK");
    await h.request(`/api/orders/${order.ref}`, { headers: auth });
    await h.settle();
    const view = await h.request(`/api/orders/${order.ref}`, { headers: auth });
    expect(view.body.status).toBe("VERIFYING");
    expect(view.body.fulfillment).toBeNull();
  });

  it("routes an H2H failure to the review queue without retrying", async () => {
    const order = await placeOrder();
    fake.state.paymentStatus = "PAID";
    fake.state.trxResponse = (q) => text(`Transaksi ${q.get("product")} ke ${q.get("dest")} GAGAL. Nomor tujuan tidak valid atau gangguan server game.`);
    await h.request(`/api/orders/${order.ref}`, { headers: auth });
    await h.settle();
    h.advance(300);
    await runReconcile(h.ctx);
    const view = await h.request(`/api/orders/${order.ref}`, { headers: auth });
    expect(view.body).toMatchObject({ status: "FAILED", message: "Top-up gagal diproses. Transaksi sedang ditangani sesuai prosedur." });
    expect(count("/trx")).toBe(1);
    expect((await h.db.prepare("SELECT needs_review FROM orders").first<any>()).needs_review).toBe(1);
  });
});

describe("invoice creation", () => {
  it("rejects an invoice amount outside the policy and discards it", async () => {
    fake.state.createAmount = (r) => r + 5000;
    const res = await h.request("/api/orders", { body: orderBody });
    expect(res.body).toMatchObject({ status: "PAYMENT_ERROR", canRetryPayment: true, payment: { qrImage: null } });
    expect(calls.some((c) => isMypg(c.url, "cancelpayment"))).toBe(true);
  });

  it("does not show a payment when createpayment times out, and allows an explicit retry", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let res;
    try {
      const original = fake.routes[1]!;
      fake.routes[1] = (url, init) => (isMypg(url, "createpayment") ? new Promise<Response>(() => {}) : original(url, init));
      let done = false;
      const pending = h.request("/api/orders", { body: orderBody }).finally(() => (done = true));
      // Step the clock until the request settles: the timeout is armed only once fetch starts.
      await stepClock(() => done);
      res = await pending;
      fake.routes[1] = original;
    } finally {
      vi.useRealTimers();
    }
    expect(res.body).toMatchObject({ status: "PAYMENT_ERROR", payment: null });
    const retry = await h.request(`/api/orders/${res.body.ref}/payment`, { method: "POST", headers: auth });
    expect(retry.body.status).toBe("WAITING_PAYMENT");
  });
});

describe("cancellation and expiry", () => {
  it("only cancels after MYPG confirms", async () => {
    const order = await placeOrder();
    fake.state.cancelResponse = () => json({ status: false, message: "Try again" });
    const pending = await h.request(`/api/orders/${order.ref}/cancel`, { method: "POST", headers: auth });
    expect(pending.body.status).toBe("CANCELLING");
    fake.state.cancelResponse = () => json({ status: true, message: "Payment cancelled successfully" });
    h.advance(6);
    const done = await h.request(`/api/orders/${order.ref}/cancel`, { method: "POST", headers: auth });
    expect(done.body).toMatchObject({ status: "CANCELLED", canCancel: false });
  });

  it("does not cancel an order that is already paid", async () => {
    const order = await placeOrder();
    fake.state.paymentStatus = "PAID";
    const res = await h.request(`/api/orders/${order.ref}/cancel`, { method: "POST", headers: auth });
    await h.settle();
    expect(res.body.status).not.toBe("CANCELLED");
    expect(calls.some((c) => isMypg(c.url, "cancelpayment"))).toBe(false);
  });

  it("expires an unpaid invoice through a confirmed cancellation", async () => {
    const order = await placeOrder();
    // expired_at 19:30 +07:00 = 12:30Z; harness starts at 11:55Z.
    h.advance(45 * 60);
    await runReconcile(h.ctx);
    const view = await h.request(`/api/orders/${order.ref}`, { headers: auth });
    expect(view.body).toMatchObject({ status: "EXPIRED", message: "Pembayaran kedaluwarsa." });
  });

  it("sends a late payment after cancellation to review instead of fulfilling", async () => {
    const order = await placeOrder();
    await h.request(`/api/orders/${order.ref}/cancel`, { method: "POST", headers: auth });
    fake.state.paymentStatus = "PAID";
    h.advance(90);
    await runReconcile(h.ctx);
    await h.settle();
    const row = await h.db.prepare("SELECT payment_status, review_reason FROM orders").first<any>();
    expect(row).toMatchObject({ payment_status: "REVIEW", review_reason: "paid_after_cancellation" });
    expect(count("/trx")).toBe(0);
  });
});

describe("nickname check", () => {
  it("returns the provider's account name and caches it", async () => {
    const body = { game: "mobile-legends", userId: "12345678", zoneId: "1234" };
    const first = await h.request("/api/nickname-check", { body });
    expect(first.body).toEqual({ status: "found", nickname: "ZeeJKT48", server: "1234" });
    await h.request("/api/nickname-check", { body });
    expect(count("/trx", "CEKML")).toBe(1);
    const sent = calls.find((c) => c.url.searchParams.get("product") === "CEKML")!;
    expect(sent.url.searchParams.get("refID")).toMatch(/^NK\d+[0-9A-Z]{4}$/);
    // The verified name is attached to the order by the server.
    const order = await placeOrder();
    expect(order.account.nickname).toBe("ZeeJKT48");
  });

  it("never fabricates a name when the check fails", async () => {
    fake.state.nicknameResponse = (q) => text(`CEKML ke ${q.get("dest")} GAGAL. ID tidak ditemukan`);
    const res = await h.request("/api/nickname-check", { body: { game: "mobile-legends", userId: "12345678", zoneId: "1234" } });
    expect(res.body.status).toBe("not_found");
    expect(res.body.nickname).toBeUndefined();
  });

  it("is unavailable for games without an active check product", async () => {
    const res = await h.request("/api/nickname-check", { body: { game: "free-fire", userId: "1234567890" } });
    expect(res.body.status).toBe("unavailable");
    expect(count("/trx", "CEKFF")).toBe(0);
  });
});

describe("storefront activity", () => {
  it("lists completed top-ups without account identifiers and ranks games by them", async () => {
    const order = await placeOrder();
    fake.state.paymentStatus = "PAID";
    await h.request(`/api/orders/${order.ref}`, { headers: auth });
    await h.settle();
    const activity = await h.request("/api/activity");
    expect(activity.body.items).toHaveLength(1);
    expect(activity.body.items[0]).toMatchObject({ game: "Mobile Legends", gameSlug: "mobile-legends", product: "Mobile Legends 86 Diamonds" });
    expect(JSON.stringify(activity.body)).not.toMatch(/12345678|1234567|JC-|OC-/);
    const games = await h.request("/api/games");
    expect(games.body.games.find((g: any) => g.slug === "mobile-legends").recentOrders).toBe(1);
  });

  it("does not list unfinished orders", async () => {
    await placeOrder();
    expect((await h.request("/api/activity")).body.items).toEqual([]);
  });
});

describe("catalog outages", () => {
  it("keeps serving the last successful catalog and marks it stale", async () => {
    vi.restoreAllMocks();
    mockFetch([(url) => (url.hostname === "www.okeconnect.com" ? text("Service Unavailable", 503) : null)]);
    const outcome = await syncCatalog(h.db, h.ctx.config, h.now());
    expect(outcome.ok).toBe(false);
    const games = await h.request("/api/games");
    expect(games.body.catalog).toMatchObject({ available: true, stale: true });
    expect(games.body.games.find((g: any) => g.slug === "mobile-legends").productCount).toBe(2);
  });
});

describe("admin pricing", () => {
  const admin = { authorization: "Bearer test-admin-token-0123456789abcdef" };
  const ml86 = async () => (await h.request("/api/games/mobile-legends")).body.products.find((p: any) => p.code === "ML86").price;

  it("changes storefront and new-order prices without touching existing orders", async () => {
    const before = await placeOrder();
    expect(before.price).toBe(23100);
    const res = await h.request("/api/admin/pricing", { method: "PUT", headers: admin, body: { markupPercent: 10, markupFlat: 0, roundTo: 1000 } });
    expect(res.status).toBe(200);
    expect(await ml86()).toBe(24000); // 21500 * 1.10 = 23650, rounded up to 24000
    const after = await h.request("/api/orders", { body: { ...orderBody, clientToken: "tok_" + "z".repeat(40) } });
    expect(after.body.price).toBe(24000);
    expect((await h.request(`/api/orders/${before.ref}`, { headers: auth })).body.price).toBe(23100);
  });

  it("applies a per-product override and refuses one below cost", async () => {
    const low = await h.request("/api/admin/pricing/overrides/ML86", { method: "PUT", headers: admin, body: { sellPrice: 21000 } });
    expect(low.status).toBe(422);
    expect(low.body.error.code).toBe("below_cost");
    const ok = await h.request("/api/admin/pricing/overrides/ML86", { method: "PUT", headers: admin, body: { sellPrice: 22500 } });
    expect(ok.status).toBe(200);
    expect(await ml86()).toBe(22500);
    expect((await placeOrder()).price).toBe(22500);
    await h.request("/api/admin/pricing/overrides/ML86", { method: "DELETE", headers: admin });
    expect(await ml86()).toBe(23100);
  });

  it("ignores an override once the provider cost rises above it", async () => {
    await h.request("/api/admin/pricing/overrides/ML86", { method: "PUT", headers: admin, body: { sellPrice: 22000 } });
    await h.db.prepare("UPDATE catalog_products SET harga = 22100 WHERE kode = 'ML86'").run();
    expect(await ml86()).toBeGreaterThanOrEqual(22100);
    const catalog = await h.request("/api/admin/catalog", { headers: admin });
    expect(catalog.body.products.find((p: any) => p.kode === "ML86").priceSource).toBe("override_below_cost");
  });

  it("validates margin input and keeps an audit trail", async () => {
    const bad = await h.request("/api/admin/pricing", { method: "PUT", headers: admin, body: { markupPercent: -1, markupFlat: 1.5, roundTo: 7 } });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(["markupFlat", "markupPercent", "roundTo"]);
    await h.request("/api/admin/pricing", { method: "PUT", headers: admin, body: { markupPercent: 0.07, markupFlat: 250, roundTo: 50 } });
    const state = await h.request("/api/admin/pricing", { headers: admin });
    expect(state.body).toMatchObject({ source: "admin", margin: { markupPercent: 0.07, markupFlat: 250, roundTo: 50 } });
    expect(state.body.audit[0]).toMatchObject({ action: "margin" });
    expect((await h.request("/api/admin/pricing", { method: "PUT", body: { markupPercent: 1, markupFlat: 0, roundTo: 1 } })).status).toBe(401);
  });
});

describe("admin", () => {
  it("requires the admin token", async () => {
    expect((await h.request("/api/admin/orders")).status).toBe(401);
    const ok = await h.request("/api/admin/orders?filter=all", { headers: { authorization: "Bearer test-admin-token-0123456789abcdef" } });
    expect(ok.status).toBe(200);
  });
});
