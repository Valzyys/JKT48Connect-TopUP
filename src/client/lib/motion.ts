import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect } from "react";

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

/**
 * Hover and press feedback for the whole app, run by GSAP so every motion on
 * the page shares one engine, one ease family and transform-only properties
 * (no CSS transitions left to fight with GSAP). Delegated from the document,
 * so components only mark elements:
 *
 * - `data-lift` (optionally `data-lift="6"` px): rises on hover. A child marked
 *   `data-lift-target` moves instead of the element itself, a child marked
 *   `data-lift-zoom` zooms in slightly, and a child marked `data-lift-fade="0.7"`
 *   brightens from that opacity to 1. Mouse and pen only.
 * - `.press` or `data-press`: shrinks a touch while pressed and springs back.
 */
export function useMicroMotion() {
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      const lifted = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>("[data-lift]") : null);

      const hover = (el: HTMLElement, on: boolean) => {
        const target = el.querySelector<HTMLElement>("[data-lift-target]") ?? el;
        gsap.to(target, { y: on ? -(Number(el.dataset.lift) || 4) : 0, duration: on ? 0.45 : 0.6, ease: on ? "power3.out" : "power3.inOut", overwrite: "auto" });
        const zoom = el.querySelector("[data-lift-zoom]");
        if (zoom) gsap.to(zoom, { scale: on ? 1.06 : 1, duration: 0.8, ease: "power3.out", overwrite: "auto" });
        const fade = el.querySelector<HTMLElement>("[data-lift-fade]");
        if (fade) gsap.to(fade, { opacity: on ? 1 : Number(fade.dataset.liftFade) || 1, duration: 0.35, ease: "power2.out", overwrite: "auto" });
      };
      const over = (e: PointerEvent) => {
        const el = lifted(e.target);
        if (el && !el.contains(e.relatedTarget as Node | null)) hover(el, true);
      };
      const out = (e: PointerEvent) => {
        const el = lifted(e.target);
        if (el && !el.contains(e.relatedTarget as Node | null)) hover(el, false);
      };

      let pressed: HTMLElement | null = null;
      const down = (e: PointerEvent) => {
        const el = e.target instanceof Element ? e.target.closest<HTMLElement>(".press, [data-press]") : null;
        if (!el || el.matches(":disabled, [aria-disabled='true']")) return;
        pressed = el;
        gsap.to(el, { scale: 0.97, duration: 0.12, ease: "power2.out", overwrite: "auto" });
      };
      const up = () => {
        if (!pressed) return;
        gsap.to(pressed, { scale: 1, duration: 0.5, ease: "back.out(3)", overwrite: "auto" });
        pressed = null;
      };

      if (canHover) {
        document.addEventListener("pointerover", over);
        document.addEventListener("pointerout", out);
      }
      document.addEventListener("pointerdown", down);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      return () => {
        document.removeEventListener("pointerover", over);
        document.removeEventListener("pointerout", out);
        document.removeEventListener("pointerdown", down);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
    });
    return () => mm.revert();
  }, []);
}

export { gsap, useGSAP };
