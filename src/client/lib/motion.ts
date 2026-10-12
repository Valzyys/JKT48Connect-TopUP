import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

/**
 * Runs `setup` only when the visitor has not asked for reduced motion.
 * Animations use gsap.from(), so with motion off every element simply sits in
 * its final, visible state.
 */
export function motionOK(setup: () => void) {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", setup);
  return mm;
}

export { gsap, useGSAP };
