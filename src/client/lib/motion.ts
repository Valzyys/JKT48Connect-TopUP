import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/** Strong ease-out used across the storefront (matches --ease-out in CSS). */
export const EASE = "expo.out";

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

export { gsap, ScrollTrigger, useGSAP };
