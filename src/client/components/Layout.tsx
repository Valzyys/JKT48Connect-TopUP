import { Moon, Sun } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { gsap, useGSAP } from "../lib/motion";
import { useTheme } from "../lib/theme";

const NAV = [
  { to: "/", label: "Top up", match: (p: string) => p === "/" || p.startsWith("/game/") },
  { to: "/cek", label: "Cek pesanan", match: (p: string) => p === "/cek" },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  const [theme, toggle] = useTheme();
  const { pathname } = useLocation();
  const header = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const active = NAV.findIndex((n) => n.match(pathname));
  const first = useRef(true);

  // The pill slides under the active link; it fades out on pages with none.
  useGSAP(
    () => {
      const el = active >= 0 ? links.current[active] : null;
      const instant = first.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      first.current = false;
      if (!el) {
        gsap.to(pill.current, { opacity: 0, duration: instant ? 0 : 0.2 });
        return;
      }
      gsap.to(pill.current, { x: el.offsetLeft, width: el.offsetWidth, opacity: 1, duration: instant ? 0 : 0.5, ease: "expo.out" });
    },
    { scope: header, dependencies: [active], revertOnUpdate: false },
  );

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Past the top the bar tightens and lifts off the page.
  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gsap.to("[data-bar]", { height: scrolled ? 52 : 64, duration: reduce ? 0 : 0.35, ease: "power3.out" });
      gsap.to(header.current, { boxShadow: scrolled ? "0 8px 24px -12px rgb(0 0 0 / 0.45)" : "0 0 0 0 rgb(0 0 0 / 0)", duration: reduce ? 0 : 0.35 });
    },
    { scope: header, dependencies: [scrolled], revertOnUpdate: false },
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-button focus:bg-surface focus:px-4 focus:py-2">
        Lewati ke konten
      </a>
      <header ref={header} className="sticky top-0 z-30 bg-[var(--game)] text-[var(--game-ink)]">
        <div data-bar className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/" className="press flex items-center gap-2.5 rounded-control" aria-label="JKT48Connect TopUp, halaman utama">
            <span className="grid size-8 place-items-center rounded-[9px] bg-[var(--game-ink)] text-[13px] font-black tracking-tight text-[var(--game)]">J</span>
            <span className="hidden whitespace-nowrap text-[15px] font-extrabold tracking-tight min-[400px]:block">
              JKT48Connect
              <span className="ml-1.5 rounded-full bg-[color-mix(in_oklab,var(--game-ink)_16%,transparent)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">TopUp</span>
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            <nav aria-label="Navigasi utama" className="relative flex items-center rounded-full bg-[color-mix(in_oklab,var(--game-ink)_13%,transparent)] p-1">
              <span ref={pill} aria-hidden className="absolute left-0 top-1 h-8 rounded-full bg-[var(--game-ink)] opacity-0 shadow-[0_2px_8px_rgb(0_0_0/0.2)]" />
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
                    className={`relative z-10 inline-flex h-8 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors duration-300 ${
                      on ? "text-[var(--game)]" : "opacity-85 hover:opacity-100"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={toggle}
              className="press grid size-10 place-items-center rounded-full hover:bg-[color-mix(in_oklab,var(--game-ink)_13%,transparent)]"
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
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-ink-3">
          <p>JKT48Connect TopUp. Nama dan logo game adalah milik pemiliknya masing-masing.</p>
          <p>Pembayaran QRIS · Proses otomatis</p>
        </div>
      </footer>
    </div>
  );
}
