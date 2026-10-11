import { Crosshair, Fire, ShieldStar, Sword } from "@phosphor-icons/react";

type IconKey = "sword" | "fire" | "crosshair" | "shield";

const ICONS = { sword: Sword, fire: Fire, crosshair: Crosshair, shield: ShieldStar } as const;

export interface PosterGame {
  name: string;
  hue: number;
  icon: IconKey;
  image: string | null;
}

/**
 * Key-art slot for a game. With official artwork configured (GameConfig.image)
 * it shows that image; otherwise it composes a poster from the game's hue,
 * genre glyph and name so the grid never looks empty or generic.
 */
export function PosterArt({ game, className = "", wordmark = true }: { game: PosterGame; className?: string; wordmark?: boolean }) {
  if (game.image) {
    return <img src={game.image} alt="" loading="lazy" decoding="async" className={`absolute inset-0 size-full object-cover ${className}`} />;
  }
  const Icon = ICONS[game.icon];
  const h = game.hue;
  return (
    <div aria-hidden className={`absolute inset-0 overflow-hidden ${className}`}>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 18% 12%, oklch(0.74 0.16 ${h}) 0%, oklch(0.5 0.17 ${h + 18}) 46%, oklch(0.24 0.09 ${h + 40}) 100%)`,
        }}
      />
      <div className="stripes absolute inset-0" />
      <div className="halftone absolute -bottom-6 -left-6 size-2/3 opacity-25 [mask-image:radial-gradient(closest-side,black,transparent)]" style={{ color: `oklch(0.95 0.05 ${h})` }} />
      <Icon
        weight="duotone"
        className="absolute -right-[14%] top-[8%] size-[86%] rotate-[-14deg]"
        style={{ color: `oklch(0.97 0.04 ${h})`, opacity: 0.32 }}
      />
      {wordmark ? (
        <p
          className="display absolute left-[7%] top-[7%] max-w-[86%] text-[clamp(1.6rem,4.2vw,2.6rem)] text-transparent [-webkit-text-stroke:1.5px_oklch(1_0_0/0.55)]"
          style={{ fontStretch: "62%" }}
        >
          {game.name}
        </p>
      ) : null}
    </div>
  );
}
