import { describe, expect, it } from "vitest";
import { catalogRequestUrl, classifyProduct, isActiveStatus, parseCatalog, parsePrice } from "../src/worker/services/okeconnect";
import { buildH2HUrl, parseNicknameResponse, parseTrxCheckResponse, parseTrxResponse, redactBalance } from "../src/worker/services/h2h";
import { parseCancelPayment, parseCheckStatus, parseCreatePayment } from "../src/worker/services/mypg";
import { checkInvoiceAmount, sellingPrice } from "../src/worker/services/pricing";
import { loadConfig } from "../src/worker/env";
import { CATALOG_FIXTURE, TEST_ENV_VARS } from "./helpers";

const config = loadConfig({ DB: {} as D1Database, ...TEST_ENV_VARS });

describe("OkeConnect catalog", () => {
  it("parses the documented array and preserves every field", () => {
    const result = parseCatalog(JSON.stringify(CATALOG_FIXTURE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(4);
    expect(result.items[1]).toMatchObject({
      kode: "ML86",
      keterangan: "Mobile Legends 86 Diamonds",
      produk: "TPG Diamond Mobile Legends",
      kategori: "Game",
      harga_raw: "21500",
      harga: 21500,
      status_raw: "1",
      is_available: true,
      product_type: "topup",
      game_slug: "mobile-legends",
    });
  });

  it("classifies CEKML as a nickname-check utility, not a denomination", () => {
    const result = parseCatalog(JSON.stringify(CATALOG_FIXTURE));
    if (!result.ok) throw new Error("parse failed");
    const cek = result.items.find((i) => i.kode === "CEKML")!;
    expect(cek.product_type).toBe("nickname_check");
    expect(cek.game_slug).toBe("mobile-legends");
    expect(classifyProduct({ kode: "PUBG60", keterangan: "PUBG 60 UC", produk: "TPG PUBG Mobile" }).product_type).toBe("other");
  });

  it("maps the live catalog's produk names to games and leaves vouchers and services unsold", () => {
    const cases: [string, string, string | null][] = [
      ["DML86", "TPG Diamond Mobile Legends", "mobile-legends"],
      ["FF100", "TPG Diamond Free Fire", "free-fire"],
      ["FFM1", "TPG Free Fire Membership", "free-fire"],
      ["PUBG250", "TPG Game Mobile PUBG", "pubg-mobile"],
      ["GPUBGM60", "TPG Game Mobile PUBG Global", "pubg-mobile-global"],
      ["MCG5", "TPG Magic Chess Go Go", "magic-chess-go-go"],
      ["HOK80", "TPG Honor of Kings", "honor-of-kings"],
      ["CODM26", "TPG Call Of Duty", "call-of-duty-mobile"],
      ["GGDF60", "TPG Delta Force", "delta-force"],
      ["AB6BB", "TPG Arena Breakout", "arena-breakout"],
      ["BSAF1", "TPG Blood Strike", "blood-strike"],
      ["AOV40", "TPG Arena of Valor", "arena-of-valor"],
      ["INLP11", "TPG Lokapala", "lokapala"],
      ["SPEED10", "TPG Diamond Speed Drifter", "speed-drifter"],
      ["INWW6", "TPG Werewolf", "werewolf"],
      ["PB10", "TPG Point Blank Zepetto", "point-blank"],
      ["ZPAF14", "TPG Zepeto", "zepeto"],
      // Voucher codes, other services and games with an undocumented destination stay unsold.
      ["PUBGV660", "TPG Game Vcr PUBG", null],
      ["VPB10", "TPG Game Vcr Point Blank", null],
      ["VGPI10", "TPG Google Play ID", null],
      ["LIFEAF65", "TPG Life After Credit", null],
      ["NSAF2", "TPG PUBG New State", null],
      ["DOKU10", "Top Up Saldo Doku", null],
    ];
    for (const [kode, produk, slug] of cases) {
      const c = classifyProduct({ kode, keterangan: kode, produk });
      expect([kode, c.game_slug]).toEqual([kode, slug]);
      expect(c.product_type).toBe(slug ? "topup" : "other");
    }
  });

  it("handles availability and invalid records conservatively", () => {
    const result = parseCatalog(
      JSON.stringify([
        { ...CATALOG_FIXTURE[0], status: "0" },
        { ...CATALOG_FIXTURE[1], harga: "abc" },
        { ...CATALOG_FIXTURE[2], kode: "" },
        "garbage",
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invalid).toBe(2);
    expect(result.items.find((i) => i.kode === "ML5")!.is_available).toBe(false);
    const badPrice = result.items.find((i) => i.kode === "ML86")!;
    expect(badPrice.harga).toBeNull();
    expect(badPrice.is_available).toBe(false); // an unparseable price is never sellable
  });

  it("rejects non-array and empty responses instead of wiping the catalog", () => {
    expect(parseCatalog('{"error":"x"}').ok).toBe(false);
    expect(parseCatalog("[]").ok).toBe(false);
    expect(parseCatalog("<html>").ok).toBe(false);
  });

  it("parses prices and statuses safely", () => {
    expect(parsePrice("1420")).toBe(1420);
    expect(parsePrice(6450)).toBe(6450);
    expect(parsePrice("21500.00")).toBe(21500);
    expect(parsePrice("-5")).toBeNull();
    expect(parsePrice("1.420")).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(isActiveStatus("1")).toBe(true);
    expect(isActiveStatus(1)).toBe(true);
    expect(isActiveStatus("0")).toBe(false);
    expect(isActiveStatus("2")).toBe(false);
  });

  it("builds the documented URL from configuration", () => {
    const url = new URL(catalogRequestUrl(config));
    expect(url.origin + url.pathname).toBe("https://www.okeconnect.com/harga/json");
    expect(url.searchParams.get("id")).toBe("test-catalog-id");
    expect(url.searchParams.get("produk")).toBe("digital");
  });
});

describe("Pricing", () => {
  it("separates provider cost from the selling price", () => {
    expect(sellingPrice(21500, { markupPercent: 5, markupFlat: 500, roundTo: 100 })).toBe(23100);
    expect(sellingPrice(1420, { markupPercent: 0, markupFlat: 0, roundTo: 1 })).toBe(1420);
  });

  it("applies the explicit invoice amount policy", () => {
    expect(checkInvoiceAmount(23000, 23412, 1000)).toEqual({ ok: true, adjustment: 412 });
    expect(checkInvoiceAmount(23000, 22999, 1000)).toMatchObject({ ok: false, reason: "below_requested" });
    expect(checkInvoiceAmount(23000, 24001, 1000)).toMatchObject({ ok: false, reason: "above_tolerance" });
  });
});

describe("H2H /trx", () => {
  const req = { product: "ML86", dest: "123456781234", refID: "OC-9K3F8-W2P7Q" };

  it("builds the documented URL with escaped parameters", () => {
    const url = new URL(buildH2HUrl(config, "/trx", { ...req, dest: "12&x=1" }));
    expect(url.origin + url.pathname).toBe("https://h2h.jkt48connect.com/trx");
    expect(url.searchParams.get("dest")).toBe("12&x=1");
    expect(url.searchParams.get("refID")).toBe("OC-9K3F8-W2P7Q");
  });

  it("parses the documented success response and extracts SN", () => {
    const parsed = parseTrxResponse("Transaksi ML86 ke 123456781234 SUKSES. SN: 2610110982341234871. Sisa Saldo Rp 2.450.000", req);
    expect(parsed.status).toBe("SUCCESS");
    expect(parsed.sn).toBe("2610110982341234871");
    expect(parsed.redacted).not.toContain("2.450.000");
  });

  it("parses the documented pending response", () => {
    const parsed = parseTrxResponse("Transaksi ML86 ke 123456781234 sedang diproses. Mohon tunggu beberapa saat. RefID: OC-9K3F8-W2P7Q", req);
    expect(parsed.status).toBe("PENDING");
  });

  it("parses the documented failure response", () => {
    expect(parseTrxResponse("Transaksi ML86 ke 123456781234 GAGAL. Nomor tujuan tidak valid atau gangguan server game.", req).status).toBe("FAILED");
  });

  it("never treats unrecognised or mismatched text as success", () => {
    expect(parseTrxResponse("OK", req).status).toBe("UNKNOWN");
    expect(parseTrxResponse("", req).status).toBe("UNKNOWN");
    expect(parseTrxResponse("Transaksi ML86 ke 999999 SUKSES. SN: 1", req)).toMatchObject({ status: "UNKNOWN", note: "destination mismatch" });
    expect(parseTrxResponse("Transaksi ML5 ke 123456781234 SUKSES. SN: 1", req).status).toBe("UNKNOWN");
    expect(parseTrxResponse("Transaksi ML86 ke 123456781234 sedang diproses. RefID: OC-OTHER", req).status).toBe("UNKNOWN");
    expect(parseTrxResponse("Transaksi ML86 ke 123456781234 TIDAK SUKSES", req).status).toBe("UNKNOWN");
    expect(parseTrxResponse("Transaksi ML86 ke 123456781234 SUKSES lalu GAGAL", req).status).toBe("UNKNOWN");
  });

  it("parses /trx-check success and queued responses", () => {
    const ok = parseTrxCheckResponse("Cek status ML86 ke 123456781234: SUKSES. SN: 2610110982341234871. Sisa Saldo Rp 2.450.000", req);
    expect(ok).toMatchObject({ status: "SUCCESS", sn: "2610110982341234871" });
    expect(parseTrxCheckResponse("Transaksi ML86 ke 123456781234 masih dalam antrean/proses provider.", req).status).toBe("PENDING");
    expect(parseTrxCheckResponse("Data tidak ditemukan", req).status).toBe("UNKNOWN");
  });

  it("redacts the provider balance in every form", () => {
    expect(redactBalance("x. Sisa Saldo Rp 2.450.000")).toBe("x. Sisa Saldo [disembunyikan]");
    expect(redactBalance("Saldo: Rp.1,234")).toBe("Saldo [disembunyikan]");
  });
});

describe("H2H nickname check", () => {
  const req = { product: "CEKML", dest: "123456781234", refID: "NK1728648102AB" };

  it("parses the documented response", () => {
    const parsed = parseNicknameResponse("CEKML ke 123456781234 SUKSES. a.n. ZeeJKT48 (Server: 1234). Sisa Saldo Rp 2.449.999", req);
    expect(parsed).toMatchObject({ status: "SUCCESS", nickname: "ZeeJKT48", server: "1234" });
    expect(parsed.redacted).not.toContain("2.449.999");
  });

  it("accepts success without the optional server and names with spaces", () => {
    expect(parseNicknameResponse("CEKML ke 123456781234 SUKSES. a.n. Zee Ashadi. Sisa Saldo Rp 10", req)).toMatchObject({ nickname: "Zee Ashadi", server: null });
    expect(parseNicknameResponse("CEKML ke 123456781234 SUKSES.", req)).toMatchObject({ status: "SUCCESS", nickname: null });
  });

  it("never fabricates a name on failure or unknown text", () => {
    expect(parseNicknameResponse("CEKML ke 123456781234 GAGAL. ID tidak ditemukan", req)).toMatchObject({ status: "FAILED", nickname: null });
    expect(parseNicknameResponse("a.n. Siapa", req)).toMatchObject({ status: "UNKNOWN", nickname: null });
  });
});

describe("MYPG", () => {
  const created = {
    status: true,
    message: "Payment created successfully",
    data: {
      trx_id: "MY-20261011-88492019",
      amount: 23412,
      qr_image: "https://yobasepay.net/qr/MY-20261011-88492019.png",
      payment_url: "https://yobasepay.net/pay/MY-20261011-88492019",
      expired_at: "2026-10-11 19:30:00",
    },
  };

  it("parses createpayment and keeps the returned amount", () => {
    expect(parseCreatePayment(JSON.stringify(created))).toEqual({
      ok: true,
      trxId: "MY-20261011-88492019",
      amount: 23412,
      qrImage: "https://yobasepay.net/qr/MY-20261011-88492019.png",
      paymentUrl: "https://yobasepay.net/pay/MY-20261011-88492019",
      expiredAtRaw: "2026-10-11 19:30:00",
      message: "Payment created successfully",
    });
  });

  it("rejects failed, malformed, or unsafe createpayment responses", () => {
    expect(parseCreatePayment(JSON.stringify({ status: false, message: "Invalid api key" }))).toMatchObject({ ok: false, reason: "rejected" });
    expect(parseCreatePayment("not json")).toMatchObject({ ok: false, reason: "malformed" });
    expect(parseCreatePayment(JSON.stringify({ status: true, data: { amount: 1 } }))).toMatchObject({ ok: false, reason: "malformed" });
    const unsafe = { ...created, data: { ...created.data, qr_image: "javascript:alert(1)", payment_url: "data:text/html,x" } };
    expect(parseCreatePayment(JSON.stringify(unsafe))).toMatchObject({ ok: false, reason: "malformed", trxId: "MY-20261011-88492019" });
  });

  const expected = { trxId: "MY-20261011-88492019", amount: 23412 };

  it("parses PAID only when trx_id and amount match", () => {
    const paid = { status: true, message: "Payment found", data: { trx_id: expected.trxId, status: "PAID", amount: 23412, paid_at: "2026-10-11 19:04:12" } };
    expect(parseCheckStatus(JSON.stringify(paid), expected)).toEqual({ kind: "PAID", amount: 23412, paidAtRaw: "2026-10-11 19:04:12", message: "Payment found" });
  });

  it("parses UNPAID", () => {
    const unpaid = { status: true, message: "Payment pending", data: { trx_id: expected.trxId, status: "UNPAID", amount: 23412, expired_at: "2026-10-11 19:30:00" } };
    expect(parseCheckStatus(JSON.stringify(unpaid), expected)).toMatchObject({ kind: "UNPAID", expiredAtRaw: "2026-10-11 19:30:00" });
  });

  it("flags amount and transaction mismatches", () => {
    const wrongAmount = { status: true, data: { trx_id: expected.trxId, status: "PAID", amount: 23000 } };
    expect(parseCheckStatus(JSON.stringify(wrongAmount), expected)).toMatchObject({ kind: "AMOUNT_MISMATCH", returnedAmount: 23000 });
    const wrongTrx = { status: true, data: { trx_id: "MY-OTHER", status: "PAID", amount: 23412 } };
    expect(parseCheckStatus(JSON.stringify(wrongTrx), expected)).toMatchObject({ kind: "TRX_MISMATCH" });
  });

  it("keeps undocumented statuses and malformed bodies out of the paid path", () => {
    const odd = { status: true, data: { trx_id: expected.trxId, status: "EXPIRED", amount: 23412 } };
    expect(parseCheckStatus(JSON.stringify(odd), expected)).toMatchObject({ kind: "UNDOCUMENTED", rawStatus: "EXPIRED" });
    expect(parseCheckStatus("<html>502</html>", expected).kind).toBe("INVALID");
    expect(parseCheckStatus(JSON.stringify({ status: false, message: "not found" }), expected).kind).toBe("INVALID");
  });

  it("parses cancelpayment", () => {
    expect(parseCancelPayment(JSON.stringify({ status: true, message: "Payment cancelled successfully" }))).toEqual({ confirmed: true, message: "Payment cancelled successfully" });
    expect(parseCancelPayment(JSON.stringify({ status: false, message: "Already paid" })).confirmed).toBe(false);
    expect(parseCancelPayment("").confirmed).toBe(false);
  });
});
