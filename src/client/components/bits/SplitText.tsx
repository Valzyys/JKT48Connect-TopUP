// Adapted from React Bits (https://reactbits.dev) by David Haz, MIT + Commons Clause.
// Local changes: plays on mount and whenever `text` changes (no scroll trigger,
// it is used above the fold), and stays static under reduced motion. GSAP's
// SplitText labels the parent and hides the split pieces from screen readers.
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
  from = { yPercent: 110, opacity: 0, rotate: 6, filter: "blur(6px)" },
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
            gsap.from(self.chars, { ...from, duration, ease, stagger: delay / 1000, clearProps: "filter" }),
        });
        return () => split.revert();
      });
    },
    { scope: ref, dependencies: [text], revertOnUpdate: true },
  );
  return (
    <Tag ref={ref as never} className={className}>
      {text}
    </Tag>
  );
}
