import { Moon, Receipt, Sun, Lightning } from "@phosphor-icons/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type ReactNode, useRef } from "react";
import { Link, useLocation } from "react-router";
import { gsap, useGSAP } from "../lib/motion";
import { useTheme } from "../lib/theme";

gsap.registerPlugin(ScrollTrigger);

const NAV = [
  { to: "/", label: "Top up", Icon: Lightning, match: (p: string) => p === "/" || p.startsWith("/game/") },
  { to: "/cek", label: "Cek pesanan", Icon: Receipt, match: (p: string) => p === "/cek" },
] as const;

/**
 * Floating glass header. It sits over the hero on the shop and over the plain
 * page elsewhere. The nav pill's indicator slides to the active page, and the
 * bar tightens once the page scrolls.
 */
export function Layout({ children }: { children: ReactNode }) {
  const [theme, toggle] = useTheme();
  const { pathname } = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const active = NAV.findIndex((n) => n.match(pathname));
  const placed = useRef(false);

  useGSAP(
    () => {
      const el = active >= 0 ? links.current[active] : null;
      const instant = !placed.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!el) {
        gsap.to(pill.current, { autoAlpha: 0, scale: 0.9, duration: instant ? 0 : 0.25 });
        return;
      }
      placed.current = true;
      gsap.to(pill.current, { x: el.offsetLeft, width: el.offsetWidth, autoAlpha: 1, scale: 1, duration: instant ? 0 : 0.6, ease: "expo.out" });
    },
    { scope: root, dependencies: [active], revertOnUpdate: false },
  );

  // Tighten on scroll. ScrollTrigger follows Lenis, so this stays smooth.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap
          .timeline({ paused: true, defaults: { duration: 0.4, ease: "power3.out" } })
          .to("[data-bar]", { height: 56, maxWidth: "60rem", boxShadow: "0 10px 30px -14px rgb(0 0 0 / 0.35)" }, 0);
        ScrollTrigger.create({ start: 24, end: "max", onToggle: (self) => (self.isActive ? tl.play() : tl.reverse()) });
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-button focus:bg-surface focus:px-4 focus:py-2">
        Lewati ke konten
      </a>
      <header className="sticky top-3 z-40 px-3">
        <div
          data-bar
          className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 rounded-full border border-white/50 bg-[color-mix(in_oklab,var(--surface)_72%,transparent)] pl-2 pr-1.5 shadow-[0_8px_30px_-16px_rgb(0_0_0/0.25)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10"
        >
          <Link to="/" className="press flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3" aria-label="JKT48Connect TopUp, halaman utama">
            <span className="grid size-10 place-items-center rounded-full bg-[linear-gradient(140deg,var(--game),var(--game-deep))] text-[15px] font-extrabold text-[var(--game-ink)] shadow-[0_6px_16px_-6px_var(--game)]">
              J
            </span>
            <span className="hidden leading-tight min-[420px]:block">
              <span className="block text-[15px] font-extrabold tracking-tight">JKT48Connect</span>
              <span className="block text-[11px] font-medium text-ink-3">Top up game, bayar QRIS</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <nav aria-label="Navigasi utama" className="relative flex items-center rounded-full bg-surface-2/80 p-1">
              <span
                ref={pill}
                aria-hidden
                className="invisible absolute left-0 top-1 h-10 rounded-full bg-surface shadow-[0_4px_14px_-6px_rgb(0_0_0/0.25)] ring-1 ring-black/5 dark:bg-surface-3 dark:ring-white/10"
              />
              {NAV.map((n, i) => {
                const on = i === active;
                return (
                  <Link
                    key={n.to}
                    ref={(el) => {
                      links.current[i] = el;
                    }}
                    to={n.to}
                    aria-current={on ? "page" : undefined}
                    className={`relative z-10 inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors duration-300 ${
                      on ? "text-ink" : "text-ink-3 hover:text-ink"
                    }`}
                  >
                    <n.Icon size={16} weight={on ? "fill" : "bold"} className={`${on ? "text-[var(--game)]" : ""} max-[360px]:hidden`} aria-hidden />
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={toggle}
              className="press grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
              aria-label={theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"}
            >
              {theme === "dark" ? <Sun size={19} weight="bold" aria-hidden /> : <Moon size={19} weight="bold" aria-hidden />}
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="mt-16">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-8 text-xs text-ink-3">
          <p>JKT48Connect TopUp. Nama dan logo game adalah milik pemiliknya masing-masing.</p>
          <p>Pembayaran QRIS · Proses otomatis</p>
        </div>
      </footer>
    </div>
  );
}
