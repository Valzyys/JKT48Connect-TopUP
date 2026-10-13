// Adapted from React Bits (https://reactbits.dev) by David Haz, MIT + Commons Clause.
// Local changes: the sparks draw on a small canvas placed at the click (moved
// with a transform), not on a canvas the size of the whole section, so a click
// never allocates or clears a large bitmap. GSAP drives the frames, the canvas
// is cleared and hidden when the sparks end, and nothing runs under reduced
// motion. The canvas sits above the content and ignores the pointer.
import { type ReactNode, useRef } from "react";
import { gsap, useGSAP } from "../../lib/motion";

export function ClickSpark({ children, color = "currentColor", size = 10, radius = 22, count = 8, duration = 0.42, className = "" }: { children: ReactNode; color?: string; size?: number; radius?: number; count?: number; duration?: number; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = (radius + size) * 2 + 8; // CSS px, enough for one burst
  const { contextSafe } = useGSAP({ scope: root });

  const spark = contextSafe((e: React.PointerEvent) => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== box * dpr) {
      c.width = c.height = box * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const r = root.current!.getBoundingClientRect();
    gsap.killTweensOf(c);
    gsap.set(c, { x: e.clientX - r.left - box / 2, y: e.clientY - r.top - box / 2, autoAlpha: 1 });
    const stroke = color === "currentColor" ? getComputedStyle(c).color : color;
    const burst = { t: 0 };
    gsap.to(burst, {
      t: 1,
      duration,
      ease: "none",
      onUpdate: () => {
        const eased = burst.t * (2 - burst.t);
        const d = eased * radius;
        const len = size * (1 - eased);
        ctx.clearRect(0, 0, box, box);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        for (let i = 0; i < count; i++) {
          const a = (2 * Math.PI * i) / count;
          ctx.beginPath();
          ctx.moveTo(box / 2 + d * Math.cos(a), box / 2 + d * Math.sin(a));
          ctx.lineTo(box / 2 + (d + len) * Math.cos(a), box / 2 + (d + len) * Math.sin(a));
          ctx.stroke();
        }
      },
      onComplete: () => {
        ctx.clearRect(0, 0, box, box);
        gsap.set(c, { autoAlpha: 0 });
      },
    });
  });

  return (
    <div ref={root} className={`relative ${className}`} onPointerDown={spark}>
      {children}
      <canvas ref={canvas} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 z-10" style={{ width: box, height: box }} />
    </div>
  );
}
