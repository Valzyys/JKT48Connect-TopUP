import { Moon, Sun } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useTheme } from "../lib/theme";

export function Layout({ children }: { children: ReactNode }) {
  const [theme, toggle] = useTheme();
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `press whitespace-nowrap rounded-button px-3 py-2 text-sm ${isActive ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}`;
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-button focus:bg-surface focus:px-4 focus:py-2">
        Lewati ke konten
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 rounded-control" aria-label="JKT48Connect TopUp, halaman utama">
            <img src="/favicon.svg" alt="" width={24} height={24} className="size-6" />
            <span className="whitespace-nowrap text-[15px] font-semibold">
              JKT48Connect <span className="font-normal text-ink-2">TopUp</span>
            </span>
          </Link>
          <nav aria-label="Navigasi utama" className="flex items-center">
            <NavLink to="/cek" className={navClass}>
              Cek pesanan
            </NavLink>
            <button
              type="button"
              onClick={toggle}
              className="press grid size-9 place-items-center rounded-button text-ink-2 hover:bg-surface-2 hover:text-ink"
              aria-label={theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"}
            >
              {theme === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            </button>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line">
        <p className="mx-auto max-w-5xl px-4 py-6 text-xs text-ink-3">
          JKT48Connect TopUp. Nama dan logo game adalah milik pemiliknya masing-masing.
        </p>
      </footer>
    </div>
  );
}
