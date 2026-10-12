import { ArrowRight, Lightning, Moon, QrCode, Receipt, ShieldCheck, Sun } from "@phosphor-icons/react";
import { GAMES } from "../../shared/games";
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
          <Link to="/" className="press flex shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-1 min-[420px]:pr-3" aria-label="JKT48Connect TopUp, halaman utama">
            <span className="grid size-10 place-items-center rounded-full bg-[linear-gradient(140deg,var(--game),var(--game-deep))] text-[15px] font-extrabold text-[var(--game-ink)] shadow-[0_6px_16px_-6px_var(--game)]">
              J
            </span>
            <span className="hidden leading-tight min-[420px]:block">
              <span className="block text-[15px] font-extrabold tracking-tight">JKT48Connect</span>
              <span className="block text-[11px] font-medium text-ink-3">Top up game, bayar QRIS</span>
            </span>
          </Link>
          <div className="flex min-w-0 items-center gap-1">
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
                    className={`relative z-10 inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-colors duration-300 min-[400px]:px-3.5 min-[400px]:text-sm ${
                      on ? "text-ink" : "text-ink-3 hover:text-ink"
                    }`}
                  >
                    <n.Icon size={16} weight={on ? "fill" : "bold"} className={`${on ? "text-[var(--game)]" : ""} max-[400px]:hidden`} aria-hidden />
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={toggle}
              className="press grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
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
      <Footer />
    </div>
  );
}

const WALLETS = ["QRIS", "GoPay", "OVO", "DANA", "ShopeePay", "LinkAja", "m-banking"];

function Footer() {
  const root = useRef<HTMLElement>(null);
  // The big wordmark slides sideways as the footer scrolls into view.
  useGSAP(
    () => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo("[data-wordmark]", { xPercent: 12 }, { xPercent: -8, ease: "none", scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom bottom", scrub: 0.8 } });
        gsap.from("[data-footer-card]", { y: 40, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.1, scrollTrigger: { trigger: root.current, start: "top 90%", once: true } });
      });
    },
    { scope: root },
  );
  return (
    <footer ref={root} className="mt-20 px-3 pb-3 max-lg:pb-28">
      <div data-footer-card className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-[linear-gradient(140deg,var(--game),var(--game-deep))] px-6 py-10 text-[var(--game-ink)] sm:px-10">
        <span data-wordmark aria-hidden className="pointer-events-none absolute -bottom-10 -right-4 select-none text-[11rem] font-extrabold leading-none tracking-[-0.06em] opacity-[0.08] sm:text-[16rem]">
          JKT48
        </span>
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-md">
            <p className="text-2xl font-extrabold tracking-tight sm:text-3xl">Top up sekarang, item masuk otomatis.</p>
            <p className="mt-2 text-sm opacity-85">Tanpa daftar akun. Bayar QRIS dari aplikasi apa pun, pantau statusnya dari link pesanan.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/" className="press inline-flex h-12 items-center gap-2 rounded-full bg-[var(--game-ink)] px-6 font-bold text-[var(--game)] shadow-[0_10px_24px_-10px_rgb(0_0_0/0.5)]">
              <Lightning size={18} weight="fill" aria-hidden />
              Mulai top-up
            </Link>
            <Link to="/cek" className="press inline-flex h-12 items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--game-ink)_35%,transparent)] px-6 font-bold">
              Cek pesanan
              <ArrowRight size={16} weight="bold" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      <div data-footer-card className="mx-auto mt-3 grid max-w-6xl gap-8 rounded-[36px] bg-surface px-6 py-10 shadow-raised ring-1 ring-line sm:px-10 md:grid-cols-[1.3fr_1fr_0.8fr_1.1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-full bg-[linear-gradient(140deg,var(--game),var(--game-deep))] font-extrabold text-[var(--game-ink)]">J</span>
            <span className="text-[15px] font-extrabold tracking-tight">JKT48Connect TopUp</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-2">Top up game langsung ke ID akunmu. Harga mengikuti katalog penyedia dan tampil lengkap sebelum bayar.</p>
          <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-ink-3">
            <ShieldCheck size={16} weight="fill" className="text-[var(--game)]" aria-hidden />
            Pembayaran diverifikasi otomatis sebelum top-up dikirim.
          </p>
        </div>
        <nav aria-label="Game">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">Game</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-1">
            {GAMES.slice(0, 8).map((g) => (
              <li key={g.slug}>
                <Link to={`/game/${g.slug}`} className="text-ink-2 hover:text-ink">
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Bantuan">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">Bantuan</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            <li>
              <Link to="/cek" className="text-ink-2 hover:text-ink">
                Cek pesanan
              </Link>
            </li>
            <li>
              <Link to="/" className="text-ink-2 hover:text-ink">
                Semua game
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">Bayar dengan</h2>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {WALLETS.map((w) => (
              <li key={w} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${w === "QRIS" ? "bg-[var(--game)] text-[var(--game-ink)]" : "bg-surface-2 text-ink-2"}`}>
                {w === "QRIS" ? <QrCode size={14} weight="bold" aria-hidden /> : null}
                {w}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-3">Semua aplikasi yang bisa scan QRIS.</p>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-ink-3 sm:px-10">
        <p>© {new Date().getFullYear()} JKT48Connect TopUp</p>
        <p>Nama dan logo game adalah milik pemiliknya masing-masing.</p>
      </div>
    </footer>
  );
}
