// Adapted from React Bits (https://reactbits.dev) by David Haz, MIT + Commons Clause.
// Local changes: rewritten for smooth motion. The original repainted a card-sized
// radial gradient (and a masked rim) on every frame from a requestAnimationFrame
// loop fed by window-wide pointer and scroll listeners, which made scrolling
// stutter. Here the light is a fixed-size gradient that GSAP moves with transforms
// (quickTo), so following the pointer never repaints the card; the rim glow is a
// second light seen through a static ring mask. Only pointer events on the card
// drive it, and touch screens or reduced motion get a still card. Padding and
// radius come from the caller; the surface follows the site theme.

import { type CSSProperties, type HTMLAttributes, useRef } from "react";
import { gsap, useGSAP } from "../../lib/motion";

export type SpotlightCardProps = HTMLAttributes<HTMLDivElement> & {
  spotlightColor?: string;
  /** Strength of the light inside the card, 0 to 1. */
  intensity?: number;
  /** Radius of the light in px. */
  spotlightSize?: number;
  /** Strength of the light along the border, 0 to 1. */
  borderGlow?: number;
  theme?: "dark" | "light";
};

const PALETTES = {
  dark: { border: "rgba(255, 255, 255, 0.08)", shadow: "0 24px 48px -24px rgba(0, 0, 0, 0.6)", fill: 1, edge: 1 },
  light: { border: "rgba(24, 24, 27, 0.1)", shadow: "0 1px 2px rgba(24, 24, 27, 0.04), 0 18px 40px -20px rgba(24, 24, 27, 0.16)", fill: 0.28, edge: 0.7 },
};

// A 1px ring: the content box is cut out of the border box.
const RING =
  "[-webkit-mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [-webkit-mask-composite:xor] [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]";

const LIGHT = "pointer-events-none absolute left-0 top-0 rounded-full opacity-0 will-change-[transform,opacity]";

export default function SpotlightCard({
  spotlightColor = "#ffffff",
  intensity = 0.15,
  spotlightSize = 240,
  borderGlow = 0.6,
  theme = "dark",
  className = "",
  style,
  children,
  ...rest
}: SpotlightCardProps) {
  const root = useRef<HTMLDivElement>(null);
  const light = useRef<HTMLSpanElement>(null);
  const rim = useRef<HTMLSpanElement>(null);
  const palette = PALETTES[theme];
  const glow = `radial-gradient(circle closest-side, ${spotlightColor}, transparent)`;

  useGSAP(
    () => {
      const card = root.current;
      const lights = [light.current, rim.current];
      if (!card || !lights[0] || !lights[1]) return;
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
        gsap.set(lights, { xPercent: -50, yPercent: -50 });
        const follow = lights.flatMap((el) => [gsap.quickTo(el, "x", { duration: 0.55, ease: "power3.out" }), gsap.quickTo(el, "y", { duration: 0.55, ease: "power3.out" })]);
        const at = (e: PointerEvent) => {
          const r = card.getBoundingClientRect();
          return [e.clientX - r.left, e.clientY - r.top] as const;
        };
        const show = (on: boolean) => {
          gsap.to(lights[0]!, { opacity: on ? intensity * palette.fill : 0, duration: on ? 0.35 : 0.6, ease: "power2.out", overwrite: "auto" });
          gsap.to(lights[1]!, { opacity: on ? borderGlow * palette.edge : 0, duration: on ? 0.35 : 0.6, ease: "power2.out", overwrite: "auto" });
        };
        const enter = (e: PointerEvent) => {
          const [x, y] = at(e);
          gsap.set(lights, { x, y });
          show(true);
        };
        const move = (e: PointerEvent) => {
          const [x, y] = at(e);
          follow[0]!(x);
          follow[1]!(y);
          follow[2]!(x);
          follow[3]!(y);
        };
        const leave = () => show(false);
        card.addEventListener("pointerenter", enter);
        card.addEventListener("pointermove", move);
        card.addEventListener("pointerleave", leave);
        return () => {
          card.removeEventListener("pointerenter", enter);
          card.removeEventListener("pointermove", move);
          card.removeEventListener("pointerleave", leave);
        };
      });
    },
    { scope: root, dependencies: [intensity, borderGlow, spotlightSize, theme] },
  );

  const size = { width: spotlightSize * 2, height: spotlightSize * 2, background: glow };
  return (
    <div
      ref={root}
      className={`relative isolate overflow-hidden bg-[var(--surface)] ${className}`.trim()}
      style={{ boxShadow: palette.shadow, ...style } as CSSProperties}
      {...rest}
    >
      <span ref={light} className={`${LIGHT} -z-10`} style={size} aria-hidden />
      {children}
      <span className={`pointer-events-none absolute inset-0 z-[1] rounded-[inherit] p-px ${RING}`} style={{ background: palette.border }} aria-hidden />
      <span className={`pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[inherit] p-px ${RING}`} aria-hidden>
        <span ref={rim} className={LIGHT} style={{ ...size, width: spotlightSize * 1.2, height: spotlightSize * 1.2 }} />
      </span>
    </div>
  );
}
