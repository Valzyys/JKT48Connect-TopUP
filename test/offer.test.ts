import { describe, expect, it } from "vitest";
import { parseOffer } from "../src/client/lib/offer";

describe("denomination labels", () => {
  it("reads amount, bonus and unit from live catalog labels", () => {
    expect(parseOffer("12 (11+1) Diamond Mobile Legend", "Mobile Legends", "Diamonds")).toEqual({ kind: "amount", amount: 12, bonus: 1, unit: "Diamond" });
    expect(parseOffer("Honor of Kings 80 + 8 Tokens", "Honor of Kings", "Tokens")).toEqual({ kind: "amount", amount: 80, bonus: 8, unit: "Tokens" });
    expect(parseOffer("Arena Breakout 3.200 Bonds", "Arena Breakout", "Bonds")).toEqual({ kind: "amount", amount: 3200, bonus: null, unit: "Bonds" });
    expect(parseOffer("PUBG Mobile Global 385 UC", "PUBG Mobile Global", "UC")).toEqual({ kind: "amount", amount: 385, bonus: null, unit: "UC" });
    expect(parseOffer("40 AOV Game", "Arena of Valor", "Vouchers")).toEqual({ kind: "amount", amount: 40, bonus: null, unit: "Vouchers" });
  });

  it("keeps passes and bundles as named packs", () => {
    expect(parseOffer("Mobile Legend Twilight Pass", "Mobile Legends", "Diamonds")).toEqual({ kind: "pack", title: "Twilight Pass" });
    expect(parseOffer("1X Weekly Diamond Pass 220 (80+20/Hari)", "Mobile Legends", "Diamonds").kind).toBe("pack");
    expect(parseOffer("Membership Mingguan 50 Diamond", "Free Fire", "Diamonds").kind).toBe("pack");
  });
});
