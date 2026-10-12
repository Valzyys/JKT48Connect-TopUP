import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { gsap } from "./motion";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

/**
 * Smooth, inertial page scrolling with Lenis, driven by the GSAP ticker so
 * ScrollTrigger reveals stay in sync. Touch keeps native scrolling, and
 * reduced motion keeps the browser's own scroll. Route changes jump to the top.
 */
export function useSmoothScroll() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const instance = new Lenis({ autoRaf: false, lerp: 0.09, anchors: { offset: -80 } });
    lenis = instance;
    instance.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => instance.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      instance.destroy();
      lenis = null;
    };
  }, []);

  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo(0, 0);
  }, [pathname]);
}

/** Scrolls an element into view through Lenis when it runs, natively otherwise. */
export function scrollToElement(el: Element, offset = -96) {
  if (lenis) lenis.scrollTo(el as HTMLElement, { offset });
  else el.scrollIntoView({ behavior: "smooth", block: "center" });
}
