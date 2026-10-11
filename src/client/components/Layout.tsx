import { Moon, QrCode, Sun } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useTheme } from "../lib/theme";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-control" aria-label="JKT48Connect TopUp, beranda">
      <img src="/favicon.svg" alt="" width={28} height={28} className="size-7" />
      <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-ink">
        JKT48Connect <span className="font-normal text-ink-2">TopUp</span>
      </span>
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [theme, toggle] = useTheme();
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `press whitespace-nowrap rounded-button px-3 py-2 text-sm font-medium ${isActive ? "text-ink bg-surface-2" : "text-ink-2 hover:text-ink"}`;
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-button focus:bg-surface focus:px-4 focus:py-2">
        Lewati ke konten
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-bg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Navigasi utama" className="flex items-center gap-1">
            {/* The logo already links home; on phones the extra link would wrap the bar. */}
            <NavLink to="/" end className={(s) => `${navClass(s)} max-sm:hidden`}>
              Game
            </NavLink>
            <NavLink to="/cek" className={navClass}>
              Cek pesanan
            </NavLink>
            <button
              type="button"
              onClick={toggle}
              className="press ml-1 grid size-10 place-items-center rounded-button text-ink-2 hover:bg-surface-2 hover:text-ink"
              aria-label={theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"}
            >
              {theme === "dark" ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
            </button>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="mt-8 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
          <div>
            <Logo />
            <p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-ink-2">Top-up game dengan pembayaran QRIS. Tanpa daftar akun, status pesanan bisa dicek kapan saja.</p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-2">
              <QrCode size={16} weight="duotone" className="text-accent" aria-hidden />
              Pembayaran QRIS
            </p>
          </div>
          <nav aria-label="Belanja" className="grid content-start gap-2 text-sm">
            <p className="font-semibold text-ink">Belanja</p>
            <Link to="/" className="text-ink-2 hover:text-ink">Semua game</Link>
            <Link to="/cek" className="text-ink-2 hover:text-ink">Cek pesanan</Link>
          </nav>
          <div className="grid content-start gap-2 text-sm">
            <p className="font-semibold text-ink">Bantuan</p>
            <p className="text-ink-2">Simpan nomor pesanan untuk setiap transaksi. Nomor itu dipakai untuk penelusuran bila ada kendala.</p>
          </div>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-ink-3 sm:px-6">Nama dan merek game adalah milik pemiliknya masing-masing.</p>
        </div>
      </footer>
    </div>
  );
}
