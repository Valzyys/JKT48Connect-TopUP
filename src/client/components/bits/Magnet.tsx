// Adapted from React Bits (https://reactbits.dev) by David Haz, MIT + Commons Clause.
// Local changes: GSAP quickTo moves the child instead of React state on every
// mousemove, and the effect is off for touch and reduced motion.
import { type ReactNode, useRef } from "react";
import { gsap, useGSAP } from "../../lib/motion";

export function Magnet({ children, padding = 60, strength = 3, className = "" }: { children: ReactNode; padding?: number; strength?: number; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference) and (pointer: fine)", () => {
        const x = gsap.quickTo(inner.current, "x", { duration: 0.45, ease: "power3.out" });
        const y = gsap.quickTo(inner.current, "y", { duration: 0.45, ease: "power3.out" });
        const move = (e: MouseEvent) => {
          const r = wrap.current!.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const near = Math.abs(e.clientX - cx) < r.width / 2 + padding && Math.abs(e.clientY - cy) < r.height / 2 + padding;
          x(near ? (e.clientX - cx) / strength : 0);
          y(near ? (e.clientY - cy) / strength : 0);
        };
        window.addEventListener("mousemove", move);
        return () => window.removeEventListener("mousemove", move);
      });
    },
    { scope: wrap },
  );
  return (
    <div ref={wrap} className={className}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
