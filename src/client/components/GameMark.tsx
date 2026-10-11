import { initials } from "../lib/format";

/**
 * Game artwork slot. No licensed game art ships with this repository, so the
 * mark is a monogram on the game's own hue. Swap in official artwork here.
 */
export function GameMark({ name, hue, size = "md" }: { name: string; hue: number; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "size-16 text-xl rounded-[16px]" : size === "sm" ? "size-10 text-sm rounded-[10px]" : "size-12 text-base rounded-[12px]";
  return (
    <div
      aria-hidden
      className={`grid shrink-0 place-items-center font-semibold tracking-tight ${dims}`}
      style={{
        background: `linear-gradient(145deg, oklch(0.62 0.15 ${hue}), oklch(0.42 0.13 ${hue + 25}))`,
        color: "oklch(0.98 0.01 0)",
        boxShadow: `inset 0 1px 0 oklch(1 0 0 / 0.22), 0 6px 16px -8px oklch(0.4 0.14 ${hue} / 0.6)`,
      }}
    >
      {initials(name)}
    </div>
  );
}
