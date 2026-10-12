// Adapted from React Bits (https://reactbits.dev) by David Haz, MIT + Commons Clause.
// Local changes: uses useGSAP (cleanup on unmount) and shows the content at once
// under reduced motion instead of leaving it hidden.
import { type ReactNode, useRef } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { gsap, useGSAP } from "../../lib/motion";

gsap.registerPlugin(ScrollTrigger);

export function AnimatedContent({ children, distance = 40, duration = 0.9, delay = 0, scale = 0.98, threshold = 0.12, className = "" }: { children: ReactNode; distance?: number; duration?: number; delay?: number; scale?: number; threshold?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(ref.current, {
          y: distance,
          scale,
          autoAlpha: 0,
          duration,
          delay,
          ease: "expo.out",
          scrollTrigger: { trigger: ref.current, start: `top ${(1 - threshold) * 100}%`, once: true },
        });
      });
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
