// Adapted from React Bits (https://reactbits.dev) by David Haz, MIT + Commons Clause.
// Local changes: plays on mount and whenever `text` changes (no scroll trigger,
// it is used above the fold), and stays static under reduced motion. GSAP's
// SplitText labels the parent and hides the split pieces from screen readers.
// Letters move and fade only (no per-letter blur filter, which re-rendered
// every letter on every frame of the entrance).
import { useRef } from "react";
import { SplitText as GSAPSplitText } from "gsap/SplitText";
import { gsap, useGSAP } from "../../lib/motion";

gsap.registerPlugin(GSAPSplitText);

export function SplitText({
  text,
  className = "",
  tag: Tag = "span",
  delay = 28,
  duration = 0.9,
  ease = "expo.out",
  from = { yPercent: 110, opacity: 0, rotate: 6 },
}: {
  text: string;
  className?: string;
  tag?: "h1" | "h2" | "p" | "span";
  delay?: number;
  duration?: number;
  ease?: string;
  from?: gsap.TweenVars;
}) {
  const ref = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const split = GSAPSplitText.create(el, {
          type: "chars,words",
          mask: "chars",
          onSplit: (self) =>
            gsap.from(self.chars, { ...from, duration, ease, stagger: delay / 1000, force3D: true }),
        });
        return () => split.revert();
      });
    },
    { scope: ref, dependencies: [text], revertOnUpdate: true },
  );
  // Keyed by the text: a new title gets a fresh element. Reverting a split
  // restores the HTML captured when it was made, which would otherwise put the
  // old title back over the new one.
  return (
    <Tag key={text} ref={ref as never} className={className}>
      {text}
    </Tag>
  );
}
