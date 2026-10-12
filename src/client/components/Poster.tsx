import { useState } from "react";
import { themeFor } from "../lib/gameTheme";

/**
 * A 3:4 game poster. With `image` set (licensed key art, see games.ts) it shows
 * that picture; otherwise, or if the file fails to load, it draws the game's own
 * poster from its colour, monogram and currency icon. Sizes are in container
 * units, so the same poster works as a thumbnail and as the hero card.
 */
export function Poster({ slug, name, image, className = "" }: { slug: string; name: string; image?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  const t = themeFor(slug);
  const { Icon } = t;
  const art = !image || broken;
  return (
    <div
      className={`@container relative aspect-[3/4] overflow-hidden ${className}`}
      style={{ background: `linear-gradient(160deg, ${t.color} 0%, ${t.deep} 100%)`, color: t.ink }}
      aria-hidden
    >
      {art ? (
        <>
          <div className="absolute inset-0 opacity-[0.1]" style={{ backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 1.5px, transparent 1.5px 12px)" }} />
          <Icon weight="fill" className="absolute -right-[22%] top-[10%] h-auto w-[100%] rotate-[-16deg] opacity-[0.18]" />
          <Icon weight="fill" className="absolute left-[10%] top-[24%] h-auto w-[50%] rotate-[9deg] drop-shadow-[0_0.6cqw_1.6cqw_rgb(0_0_0/0.35)]" />
          <span className="absolute left-[8%] top-[5%] font-black leading-none tracking-[-0.04em]" style={{ fontSize: "17cqw" }}>
            {t.mono}
          </span>
        </>
      ) : (
        <img src={image!} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent px-[8%] pb-[8%] pt-[30%] text-white">
        <span className="block font-extrabold uppercase leading-[0.9] tracking-[-0.02em] [text-wrap:balance]" style={{ fontSize: "11.5cqw" }}>
          {name}
        </span>
      </div>
    </div>
  );
}
