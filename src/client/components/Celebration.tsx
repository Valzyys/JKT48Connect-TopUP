import { useRef } from "react";
import { gsap, useGSAP } from "../lib/motion";

const SPARKS = 22;

/**
 * One-off confirmation moment, played when the order page sees the payment
 * become verified or the top-up complete. It is rare by nature (once per
 * order), so it may spend more motion than the rest of the UI. Under reduced
 * motion it becomes a short fade with no burst.
 */
export function Celebration({ kind, onDone }: { kind: "paid" | "success"; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const title = kind === "paid" ? "Pembayaran terkonfirmasi" : "Top-up berhasil";
  const body = kind === "paid" ? "Top-up kamu sedang diproses." : "Item sudah dikirim ke akunmu.";

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" },
        (ctx) => {
          const { motion } = ctx.conditions as { motion: boolean };
          const tl = gsap.timeline({ onComplete: onDone });
          tl.from(root.current, { opacity: 0, duration: 0.25, ease: "power1.out" });
          if (motion) {
            tl.from("[data-ring]", { scale: 0.4, opacity: 0, duration: 0.6, ease: "back.out(2.2)" }, 0.05)
              .fromTo("[data-check]", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.45, ease: "power2.out" }, 0.35)
              .from("[data-pulse]", { scale: 0.6, opacity: 0.7, duration: 1, ease: "power2.out" }, 0.3)
              .to("[data-pulse]", { opacity: 0, duration: 0.6 }, 0.9)
              .fromTo(
                "[data-spark]",
                { x: 0, y: 0, scale: 1.6, opacity: 1, rotate: 0 },
                {
                  x: (i: number) => Math.cos((i / SPARKS) * Math.PI * 2) * gsap.utils.random(110, 190),
                  y: (i: number) => Math.sin((i / SPARKS) * Math.PI * 2) * gsap.utils.random(110, 190),
                  rotate: () => gsap.utils.random(-180, 180),
                  scale: 0.3,
                  opacity: 0,
                  duration: 1.3,
                  ease: "power3.out",
                  stagger: 0.006,
                },
                0.32,
              )
              .from("[data-celebrate-text] > *", { y: 14, opacity: 0, duration: 0.5, ease: "expo.out", stagger: 0.08 }, 0.45);
          } else {
            tl.set("[data-spark], [data-pulse]", { opacity: 0 }, 0);
          }
          tl.to(root.current, { opacity: 0, duration: 0.35, ease: "power1.in" }, motion ? 2.1 : 1.6);
        },
      );
    },
    { scope: root },
  );

  const sparkColors = ["var(--accent)", "var(--success)", "oklch(0.82 0.15 85)"];
  return (
    <div ref={root} role="status" aria-live="assertive" className="absolute inset-0 z-20 grid place-items-center bg-surface/95 backdrop-blur-sm">
      <div className="grid justify-items-center px-6 text-center">
        <div className="relative grid size-28 place-items-center">
          <span data-pulse aria-hidden className="absolute inset-0 rounded-full bg-success/25" />
          {Array.from({ length: SPARKS }, (_, i) => (
            <span
              key={i}
              data-spark
              aria-hidden
              className="absolute left-1/2 top-1/2"
              style={{
                width: i % 4 === 0 ? 14 : 9,
                height: i % 4 === 0 ? 5 : 9,
                margin: i % 4 === 0 ? "-2.5px 0 0 -7px" : "-4.5px 0 0 -4.5px",
                background: sparkColors[i % sparkColors.length],
                borderRadius: i % 4 === 0 ? "2px" : "999px",
              }}
            />
          ))}
          <span data-ring className="relative grid size-24 place-items-center rounded-full bg-success text-[oklch(0.99_0_0)] shadow-[0_12px_32px_-10px_var(--success)]">
            <svg viewBox="0 0 48 48" className="size-12" fill="none" aria-hidden>
              <path data-check d="M13 25.5l7.5 7.5L35 17" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" />
            </svg>
          </span>
        </div>
        <div data-celebrate-text className="mt-6">
          <p className="display text-4xl">{title}</p>
          <p className="mt-2 text-ink-2">{body}</p>
        </div>
      </div>
    </div>
  );
}
