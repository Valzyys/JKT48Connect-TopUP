import { Coins, Crosshair, Crown, Diamond, Lightning, MoonStars, Sparkle, Star, Ticket } from "@phosphor-icons/react";
import { gsap, useGSAP } from "./motion";

/**
 * Each game gets its own colour, so the page tells you at a glance which game
 * you are buying for. `ink` is the text colour that stays readable on `color`;
 * `deep` is the darker end of the poster gradient.
 */
export interface GameTheme {
  color: string;
  deep: string;
  ink: string;
  mono: string;
  Icon: typeof Diamond;
}

const THEMES: Record<string, GameTheme> = {
  "mobile-legends": { color: "#2348d8", deep: "#0d1b6b", ink: "#ffffff", mono: "ML", Icon: Diamond },
  "free-fire": { color: "#f46a0c", deep: "#8a2400", ink: "#1b0f05", mono: "FF", Icon: Diamond },
  "call-of-duty-mobile": { color: "#f2c230", deep: "#5c4300", ink: "#151309", mono: "CODM", Icon: Coins },
  "arena-of-valor": { color: "#5b3df5", deep: "#1f0f74", ink: "#ffffff", mono: "AOV", Icon: Ticket },
  "pubg-mobile": { color: "#f2a900", deep: "#5a3c00", ink: "#1a1203", mono: "PUBG", Icon: Coins },
  "pubg-mobile-global": { color: "#e8b93f", deep: "#4d3a07", ink: "#1a1406", mono: "PUBG", Icon: Coins },
  "magic-chess-go-go": { color: "#8b3fe6", deep: "#2c0b63", ink: "#ffffff", mono: "MCGG", Icon: Crown },
  "honor-of-kings": { color: "#c8963e", deep: "#4a2e05", ink: "#1c1205", mono: "HOK", Icon: Coins },
  "delta-force": { color: "#2f7a55", deep: "#0c2a1c", ink: "#ffffff", mono: "DF", Icon: Crosshair },
  "arena-breakout": { color: "#6f7f2c", deep: "#232a0a", ink: "#ffffff", mono: "AB", Icon: Crosshair },
  "blood-strike": { color: "#d3222f", deep: "#4f060c", ink: "#ffffff", mono: "BS", Icon: Lightning },
  lokapala: { color: "#0f9d94", deep: "#03342f", ink: "#ffffff", mono: "LP", Icon: Sparkle },
  "speed-drifter": { color: "#ff4f8b", deep: "#6b0a2f", ink: "#ffffff", mono: "SD", Icon: Lightning },
  werewolf: { color: "#4a4fb0", deep: "#14164a", ink: "#ffffff", mono: "WW", Icon: MoonStars },
  "point-blank": { color: "#33414f", deep: "#0d1217", ink: "#ffffff", mono: "PB", Icon: Crosshair },
  zepeto: { color: "#3fb4f0", deep: "#08425f", ink: "#071822", mono: "ZPT", Icon: Star },
};

export const BRAND: GameTheme = { color: "#c8102e", deep: "#5e0012", ink: "#ffffff", mono: "JC", Icon: Diamond };

export function themeFor(slug: string | null | undefined): GameTheme {
  return (slug && THEMES[slug]) || BRAND;
}

/**
 * Puts the game colour on the document root, where the header, hero and pay
 * button read it. The first colour is applied at once; later changes blend.
 */
export function useGameColour(theme: GameTheme) {
  useGSAP(
    () => {
      const root = document.documentElement;
      const vars = { "--game": theme.color, "--game-ink": theme.ink, "--game-deep": theme.deep };
      const current = getComputedStyle(root).getPropertyValue("--game").trim().toLowerCase();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (current === theme.color.toLowerCase() || reduce) gsap.set(root, vars);
      else gsap.to(root, { ...vars, duration: 0.6, ease: "power2.inOut", overwrite: true });
    },
    { dependencies: [theme.color], revertOnUpdate: false },
  );
}

/** Linear blend of two #rrggbb colours; t = 0 gives `a`, t = 1 gives `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
