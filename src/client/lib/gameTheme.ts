import { Coins, Diamond, Ticket } from "@phosphor-icons/react";
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
