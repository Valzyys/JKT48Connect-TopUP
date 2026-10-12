import { useRef } from "react";
import { gsap, useGSAP } from "../lib/motion";

export type StampKind = "paid" | "success" | "failed" | "cancelled" | "expired";

const STAMPS: Record<StampKind, { word: string; tone: string }> = {
  paid: { word: "Lunas", tone: "text-accent" },
  success: { word: "Berhasil", tone: "text-success" },
  failed: { word: "Ditangani", tone: "text-danger" },
  cancelled: { word: "Batal", tone: "text-ink-3" },
  expired: { word: "Kedaluwarsa", tone: "text-ink-3" },
};

/**
 * Rubber stamp on the order receipt, set in the reference row so it never
 * covers text. It always reflects the current status; `slam` plays the GSAP press only when this page saw the status change live
 * (payment confirmed, top-up delivered). Reduced motion shows it in place.
 */
export function Stamp({ kind, date, slam, onLanded }: { kind: StampKind; date: string | null; slam: boolean; onLanded?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const { word, tone } = STAMPS[kind];

  useGSAP(
    () => {
      if (!slam) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const ticket = root.current?.closest("[data-ticket]");
        gsap
          .timeline({ onComplete: onLanded })
          // Lifted and oversized, then pressed down hard.
          .fromTo(root.current, { scale: 2.6, rotate: -26, opacity: 0 }, { scale: 1, rotate: -9, opacity: 0.92, duration: 0.32, ease: "power4.in" })
          // The impact: the receipt dips and settles.
          .to(ticket ?? [], { y: 3, duration: 0.06, ease: "power1.out" })
          .to(ticket ?? [], { y: 0, duration: 0.5, ease: "elastic.out(1, 0.45)" });
      });
      mm.add("(prefers-reduced-motion: reduce)", () => onLanded?.());
    },
    { scope: root, dependencies: [kind, slam] },
  );

  return (
    <div
      ref={root}
      aria-hidden
      className={`stamp pointer-events-none mr-1 grid shrink-0 justify-items-center gap-1 px-3 pb-1.5 pt-2 ${tone}`}
      style={{ transform: "rotate(-9deg)", opacity: 0.92 }}
    >
      <span className="text-[1.6rem] sm:text-[2rem]">{word}</span>
      {date ? <span className="font-mono text-[11px] font-semibold normal-case tracking-[0.12em]">{date}</span> : null}
    </div>
  );
}
