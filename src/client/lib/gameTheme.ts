import { Coins, Diamond, Ticket } from "@phosphor-icons/react";

/**
 * Each game gets its own colour, so the page tells you at a glance which game
 * you are buying for. `ink` is the text colour that stays readable on `color`.
 */
export interface GameTheme {
  color: string;
  ink: string;
  Icon: typeof Diamond;
}

const THEMES: Record<string, GameTheme> = {
  "mobile-legends": { color: "#2348d8", ink: "#ffffff", Icon: Diamond },
  "free-fire": { color: "#f46a0c", ink: "#1b0f05", Icon: Diamond },
  "call-of-duty-mobile": { color: "#f2c230", ink: "#151309", Icon: Coins },
  "arena-of-valor": { color: "#5b3df5", ink: "#ffffff", Icon: Ticket },
};

export const BRAND: GameTheme = { color: "#c8102e", ink: "#ffffff", Icon: Diamond };

export function themeFor(slug: string | null | undefined): GameTheme {
  return (slug && THEMES[slug]) || BRAND;
}
