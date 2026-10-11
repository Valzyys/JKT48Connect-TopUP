import {
  ArrowRight,
  CaretDown,
  CheckCircle,
  Fire,
  IdentificationBadge,
  Lightning,
  MagnifyingGlass,
  QrCode,
  Receipt,
  ShieldCheck,
  UserCircleDashed,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { ActivityItem, GameSummary, GamesResponse } from "../../shared/api";
import { PosterArt } from "../components/GamePoster";
import { Button, Notice, Skeleton } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { idr, timeAgo, wibDateTime } from "../lib/format";
import { EASE, gsap, motionOK, ScrollTrigger, useGSAP } from "../lib/motion";

const FAQ = [
  {
    q: "Perlu daftar akun untuk top-up?",
    a: "Tidak. Isi ID game, bayar QRIS, selesai. Nomor pesanan dan link pesanan jadi kunci untuk melihat status.",
  },
  {
    q: "Pembayaran apa saja yang diterima?",
    a: "QRIS. Scan dari aplikasi m-banking atau e-wallet apa pun yang mendukung QRIS.",
  },
  {
    q: "Kenapa total tagihan bisa sedikit berbeda dari harga?",
    a: "Gateway QRIS dapat menambahkan selisih kecil pada tagihan. Angka akhirnya selalu tampil di halaman pembayaran sebelum kamu scan.",
  },
  {
    q: "Berapa lama top-up masuk?",
    a: "Proses dimulai otomatis setelah pembayaran terverifikasi. Status di halaman pesanan diperbarui sendiri tanpa perlu dimuat ulang.",
  },
  {
    q: "Bagaimana kalau top-up gagal?",
    a: "Pesanan masuk antrean penanganan dan dicek tim. Simpan nomor pesanan untuk menghubungi kami.",
  },
];

export function Home() {
  const [data, setData] = useState<GamesResponse | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    api
      .games(ctrl.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof DOMException) return;
        setError(err instanceof ApiRequestError ? err.message : "Katalog belum bisa dimuat.");
      });
    api
      .activity(ctrl.signal)
      .then((r) => setActivity(r.items))
      .catch(() => {});
    return () => ctrl.abort();
  }, [attempt]);

  const games = useMemo(() => {
    const list = [...(data?.games ?? [])].sort(
      (a, b) => Number(b.productCount > 0) - Number(a.productCount > 0) || b.recentOrders - a.recentOrders || b.productCount - a.productCount,
    );
    const q = query.trim().toLowerCase();
    return list.filter((g) => (!q || `${g.name} ${g.publisher}`.toLowerCase().includes(q)) && (!genre || g.tagline === genre));
  }, [data, query, genre]);
  const genres = useMemo(() => [...new Set((data?.games ?? []).map((g) => g.tagline))], [data]);
  const ranked = (data?.games ?? []).some((g) => g.recentOrders > 0);

  return (
    <div>
      <Hero games={data?.games ?? []} />
      <LiveStrip activity={activity} games={data?.games ?? []} />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section id="games" aria-labelledby="games-title" className="scroll-mt-20 pt-12 pb-16 sm:pt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="games-title" className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {ranked ? <Fire size={26} weight="fill" className="text-accent" aria-hidden /> : null}
                {ranked ? "Paling laris" : "Pilih game"}
              </h2>
              {data?.catalog.syncedAt ? <p className="mt-1 text-sm text-ink-3">Harga per {wibDateTime(data.catalog.syncedAt)}</p> : null}
            </div>
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Cari game</span>
              <MagnifyingGlass size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari game"
                className="h-11 w-full rounded-full border border-line-strong bg-surface pl-10 pr-4 text-[16px] text-ink placeholder:text-ink-3 focus:outline-none focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]"
              />
            </label>
          </div>

          {genres.length > 1 ? (
            <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Filter genre">
              {[null, ...genres].map((g) => (
                <button
                  key={g ?? "all"}
                  type="button"
                  aria-pressed={genre === g}
                  onClick={() => setGenre(g)}
                  className={`press shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${
                    genre === g ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2 hover:text-ink"
                  }`}
                >
                  {g ?? "Semua"}
                </button>
              ))}
            </div>
          ) : null}

          {data?.catalog.available && data.catalog.stale ? (
            <div className="mt-5">
              <Notice tone="warning" title="Katalog belum diperbarui">
                Harga berasal dari sinkronisasi terakhir yang berhasil. Ketersediaan dicek ulang saat pesanan dibuat.
              </Notice>
            </div>
          ) : null}

          <div className="mt-6">
            {error ? (
              <Notice tone="danger" title="Katalog belum bisa dimuat" action={<Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Coba lagi</Button>}>
                {error}
              </Notice>
            ) : !data ? (
              <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Memuat game">
                {Array.from({ length: 4 }, (_, i) => (
                  <li key={i}>
                    <Skeleton className="aspect-[3/4] w-full rounded-[20px]" />
                  </li>
                ))}
              </ul>
            ) : !data.catalog.available ? (
              <Notice tone="warning" title="Katalog sedang disiapkan">
                Daftar produk belum tersedia dari penyedia. Coba lagi beberapa menit lagi.
              </Notice>
            ) : games.length === 0 ? (
              <div className="grid justify-items-start gap-2 rounded-[20px] border border-dashed border-line p-8">
                <p className="font-medium">Tidak ada game yang cocok.</p>
                <button type="button" className="text-sm font-medium text-accent" onClick={() => (setQuery(""), setGenre(null))}>
                  Tampilkan semua game
                </button>
              </div>
            ) : (
              <PosterGrid games={games} ranked={ranked} />
            )}
          </div>
        </section>

        <Features />
        <Steps />
        <Faq />
      </div>
    </div>
  );
}

function Hero({ games }: { games: GameSummary[] }) {
  const root = useRef<HTMLElement>(null);
  const fan = games.filter((g) => g.productCount > 0).slice(0, 3);

  useGSAP(
    () => {
      motionOK(() => {
        const tl = gsap.timeline({ defaults: { ease: EASE } });
        tl.from("[data-hero-line]", { yPercent: 110, duration: 0.9, stagger: 0.08 })
          .from("[data-hero-copy]", { y: 16, opacity: 0, duration: 0.6 }, "-=0.55")
          .from("[data-hero-cta]", { y: 12, opacity: 0, duration: 0.5, stagger: 0.06 }, "-=0.45")
          .from("[data-hero-bg]", { opacity: 0, scale: 1.08, duration: 1.4 }, 0);
      });
    },
    { scope: root },
  );

  // The poster fan animates once the games have loaded.
  useGSAP(
    () => {
      if (!fan.length) return;
      motionOK(() => {
        gsap.from("[data-fan-card]", { y: 80, rotate: 0, opacity: 0, duration: 1, ease: EASE, stagger: 0.09, delay: 0.15 });
      });
    },
    { scope: root, dependencies: [fan.length] },
  );

  return (
    <section ref={root} className="px-3 pt-3 sm:px-6 sm:pt-6">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[28px] bg-[oklch(0.5_0.2_20)] text-[oklch(0.98_0.01_20)] sm:rounded-[36px]">
        <div data-hero-bg aria-hidden className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(80%_120%_at_85%_10%,oklch(0.62_0.21_25)_0%,transparent_60%),radial-gradient(70%_90%_at_0%_100%,oklch(0.36_0.15_15)_0%,transparent_70%)]" />
          <div className="halftone absolute -left-10 top-1/3 h-[140%] w-1/2 text-[oklch(1_0_0/0.16)] [mask-image:radial-gradient(closest-side,black,transparent)]" />
          <p className="display pointer-events-none absolute -bottom-[0.18em] -right-[0.04em] select-none text-[clamp(9rem,26vw,22rem)] leading-none text-transparent [-webkit-text-stroke:2px_oklch(1_0_0/0.14)]">48</p>
        </div>

        <div className="relative grid gap-10 px-6 pb-8 pt-10 sm:px-10 sm:pb-12 sm:pt-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:px-14 lg:py-16">
          <div>
            <p data-hero-cta className="inline-flex items-center gap-1.5 rounded-full bg-[oklch(1_0_0/0.14)] px-3 py-1 text-xs font-medium tracking-wide backdrop-blur-sm">
              <Lightning size={14} weight="fill" aria-hidden />
              Bayar QRIS, tanpa daftar akun
            </p>
            <h1 className="display mt-5 text-[clamp(3.4rem,11vw,7.25rem)]">
              <span className="block overflow-hidden pb-[0.04em]">
                <span data-hero-line className="block">
                  Top up
                </span>
              </span>
              <span className="block overflow-hidden pb-[0.06em]">
                <span data-hero-line className="block text-[oklch(0.93_0.06_85)]">
                  tanpa ribet.
                </span>
              </span>
            </h1>
            <p data-hero-copy className="mt-5 max-w-[40ch] text-base leading-relaxed text-[oklch(0.96_0.02_20/0.9)] sm:text-lg">
              Pilih game, isi ID, scan QRIS. Status pesananmu bisa dicek kapan saja dari link pesanan.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                data-hero-cta
                href="#games"
                className="press inline-flex h-12 items-center gap-2 rounded-full bg-[oklch(0.99_0.005_20)] px-6 font-semibold text-[oklch(0.42_0.18_20)] shadow-[0_10px_30px_-10px_oklch(0.2_0.1_20/0.6)] hover:bg-white"
              >
                Top up sekarang
                <ArrowRight size={18} weight="bold" aria-hidden />
              </a>
              <Link
                data-hero-cta
                to="/cek"
                className="press inline-flex h-12 items-center gap-2 rounded-full border border-[oklch(1_0_0/0.4)] px-6 font-semibold hover:bg-[oklch(1_0_0/0.1)]"
              >
                <Receipt size={18} aria-hidden />
                Cek pesanan
              </Link>
            </div>
          </div>

          {fan.length ? (
            <div className="relative mx-auto hidden h-[340px] w-full max-w-[420px] sm:block" aria-hidden>
              {fan.map((g, i) => {
                const rotate = [-10, 3, 14][i] ?? 0;
                const x = [-34, 0, 34][i] ?? 0;
                return (
                  <div
                    key={g.slug}
                    data-fan-card
                    className="absolute left-1/2 top-1/2 aspect-[3/4] w-[200px] overflow-hidden rounded-[22px] shadow-[0_24px_50px_-18px_oklch(0.15_0.08_20/0.75)] ring-1 ring-[oklch(1_0_0/0.25)]"
                    style={{ transform: `translate(calc(-50% + ${x * 3}px), -50%) rotate(${rotate}deg)`, zIndex: i === 1 ? 3 : 2 - i }}
                  >
                    <PosterArt game={g} />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[oklch(0.15_0.03_20/0.85)] to-transparent p-4 pt-12">
                      <p className="text-sm font-semibold leading-tight">{g.name}</p>
                      {g.startingPrice !== null ? <p className="mt-0.5 font-mono text-xs tabular opacity-80">mulai {idr(g.startingPrice)}</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Real data only: recent completed top-ups, or what is on sale right now. */
function LiveStrip({ activity, games }: { activity: ActivityItem[]; games: GameSummary[] }) {
  const items =
    activity.length >= 3
      ? activity.map((a) => ({ key: `${a.completedAt}-${a.product}`, lead: "Berhasil", text: a.product, meta: timeAgo(a.completedAt) }))
      : games
          .filter((g) => g.startingPrice !== null)
          .map((g) => ({ key: g.slug, lead: g.name, text: `${g.productCount} nominal`, meta: `mulai ${idr(g.startingPrice!)}` }));
  if (items.length === 0) return null;
  const loop = [...items, ...items, ...items, ...items];
  return (
    <section aria-label={activity.length >= 3 ? "Top-up terbaru" : "Tersedia sekarang"} className="mx-auto mt-3 max-w-[1400px] px-3 sm:px-6">
      <div className="flex items-center overflow-hidden rounded-full border border-line bg-surface">
        <span className="z-10 flex shrink-0 items-center gap-2 border-r border-line bg-surface py-2.5 pl-4 pr-3 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          {activity.length >= 3 ? "Live" : "Tersedia"}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_4%,black_96%,transparent)]">
          <ul className="marquee-track flex w-max items-center gap-8 py-2.5 pl-6">
            {loop.map((it, i) => (
              <li key={`${it.key}-${i}`} className="flex shrink-0 items-center gap-2 text-sm" aria-hidden={i >= items.length || undefined}>
                <CheckCircle size={16} weight="fill" className="text-success" aria-hidden />
                <span className="font-medium text-ink">{it.lead}</span>
                <span className="text-ink-2">{it.text}</span>
                <span className="font-mono text-xs tabular text-ink-3">{it.meta}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function PosterGrid({ games, ranked }: { games: GameSummary[]; ranked: boolean }) {
  const root = useRef<HTMLUListElement>(null);
  useGSAP(
    () => {
      motionOK(() => {
        ScrollTrigger.batch("[data-poster]", {
          start: "top 92%",
          once: true,
          onEnter: (els) => gsap.from(els, { y: 40, opacity: 0, duration: 0.8, ease: EASE, stagger: 0.07 }),
        });
      });
    },
    { scope: root, dependencies: [games.map((g) => g.slug).join()] },
  );

  return (
    <ul ref={root} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {games.map((g, i) => {
        const ready = g.productCount > 0;
        const card = (
          <>
            <PosterArt game={g} className="transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] [@media(hover:hover)]:group-hover:scale-[1.06]" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
              {ranked && g.recentOrders > 0 && i < 3 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.99_0_0)] px-2 py-0.5 text-[11px] font-semibold text-[oklch(0.45_0.19_20)]">
                  <Fire size={12} weight="fill" aria-hidden />#{i + 1}
                </span>
              ) : (
                <span />
              )}
              {g.nicknameCheck && ready ? (
                <span className="rounded-full bg-[oklch(0.15_0.02_275/0.45)] px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-md">Cek nama</span>
              ) : null}
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[oklch(0.13_0.02_275/0.92)] via-[oklch(0.13_0.02_275/0.55)] to-transparent p-3 pt-16 text-white sm:p-4 sm:pt-20">
              <p className="truncate text-[15px] font-semibold leading-tight sm:text-base">{g.name}</p>
              <p className="truncate text-xs text-white/75 sm:text-sm">
                {g.publisher}
                <span className="mx-1.5 opacity-60">/</span>
                {g.tagline}
              </p>
              <p className="mt-2.5 flex items-center justify-between gap-2 text-xs sm:text-sm">
                {ready && g.startingPrice !== null ? (
                  <span>
                    <span className="text-white/70">mulai </span>
                    <span className="font-mono font-semibold tabular">{idr(g.startingPrice)}</span>
                  </span>
                ) : (
                  <span className="text-white/80">Segera hadir</span>
                )}
                {ready ? (
                  <span className="grid size-7 place-items-center rounded-full bg-white/15 transition-transform duration-300 [@media(hover:hover)]:group-hover:translate-x-0.5 [@media(hover:hover)]:group-hover:bg-white [@media(hover:hover)]:group-hover:text-[oklch(0.45_0.19_20)]">
                    <ArrowRight size={14} weight="bold" aria-hidden />
                  </span>
                ) : null}
              </p>
            </div>
          </>
        );
        return (
          <li key={g.slug} data-poster>
            {ready ? (
              <Link
                to={`/game/${g.slug}`}
                className="press group relative block aspect-[3/4] overflow-hidden rounded-[20px] shadow-ambient ring-1 ring-line [@media(hover:hover)]:hover:shadow-raised"
                aria-label={`${g.name}, mulai ${g.startingPrice !== null ? idr(g.startingPrice) : ""}`}
              >
                {card}
              </Link>
            ) : (
              <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] ring-1 ring-line grayscale-[0.7]" aria-disabled>
                {card}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Features() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      motionOK(() => {
        gsap.from("[data-feature]", { y: 32, opacity: 0, duration: 0.8, ease: EASE, stagger: 0.08, scrollTrigger: { trigger: root.current, start: "top 80%", once: true } });
        // The status preview fills in sequence, the same way a real order moves.
        gsap.from("[data-status-bar]", {
          scaleX: 0,
          transformOrigin: "left center",
          duration: 0.7,
          ease: "power2.out",
          stagger: 0.45,
          scrollTrigger: { trigger: "[data-status-preview]", start: "top 85%", once: true },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} aria-labelledby="why-title" className="pb-16">
      <h2 id="why-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Top-up yang jelas dari awal sampai masuk
      </h2>
      <div className="mt-6 grid gap-3 sm:gap-4 md:grid-cols-6">
        <article data-feature className="relative overflow-hidden rounded-[24px] bg-[oklch(0.5_0.2_20)] p-6 text-white md:col-span-3 md:row-span-3 md:p-8">
          <div aria-hidden className="halftone absolute -right-8 -top-8 size-64 text-white/15 [mask-image:radial-gradient(closest-side,black,transparent)]" />
          <QrCode size={44} weight="duotone" aria-hidden />
          <h3 className="display mt-6 text-[2.6rem] sm:text-5xl">Satu QR, semua aplikasi.</h3>
          <p className="mt-3 max-w-[36ch] text-white/85">
            Scan QRIS dari m-banking atau e-wallet apa pun. Nominal tagihan tampil lengkap sebelum kamu membayar.
          </p>
          <div aria-hidden className="mt-8 grid w-fit grid-cols-5 gap-1.5 rounded-2xl bg-white p-3">
            {Array.from({ length: 25 }, (_, i) => (
              <span key={i} className={`size-4 rounded-[4px] ${[0, 1, 3, 5, 6, 8, 12, 14, 16, 18, 19, 20, 21, 23, 24].includes(i) ? "bg-[oklch(0.2_0.02_275)]" : "bg-[oklch(0.92_0.01_275)]"}`} />
            ))}
          </div>
        </article>

        <article data-feature className="rounded-[24px] border border-line bg-surface p-6 md:col-span-3">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
              <UserCircleDashed size={24} weight="duotone" aria-hidden />
            </span>
            <div>
              <h3 className="font-semibold">Tanpa daftar akun</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">Tidak ada password untuk diingat. Link pesanan berisi kunci akses pesananmu.</p>
            </div>
          </div>
        </article>

        <article data-feature className="rounded-[24px] border border-line bg-surface p-6 md:col-span-3">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-warning-soft text-warning">
              <IdentificationBadge size={24} weight="duotone" aria-hidden />
            </span>
            <div>
              <h3 className="font-semibold">Cek nama akun sebelum bayar</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">Untuk game yang mendukung, nama akun diambil langsung dari penyedia sehingga salah ID ketahuan lebih awal.</p>
            </div>
          </div>
        </article>

        <article data-feature className="rounded-[24px] border border-line bg-surface p-6 md:col-span-3" data-status-preview>
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-success-soft text-success">
              <ShieldCheck size={24} weight="duotone" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">Status langsung, tanpa refresh</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">Pembayaran diverifikasi server, lalu top-up diproses otomatis.</p>
              <div aria-hidden className="mt-4 grid grid-cols-3 gap-2 text-xs text-ink-2">
                {["Pembayaran", "Diproses", "Selesai"].map((s) => (
                  <div key={s} className="grid gap-1.5">
                    <span className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <span data-status-bar className="block h-full rounded-full bg-accent" />
                    </span>
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

const STEPS = [
  { title: "Pilih game", body: "Nominal dan harga dari katalog terbaru." },
  { title: "Isi ID akun", body: "Cek nama akun dulu bila game mendukung." },
  { title: "Scan QRIS", body: "Bayar tepat sesuai nominal tagihan." },
  { title: "Top-up masuk", body: "Pantau statusnya di link pesanan." },
];

function Steps() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      motionOK(() => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 78%", once: true } });
        tl.from("[data-step-line]", { scaleX: 0, transformOrigin: "left center", duration: 1.1, ease: "power2.inOut" }).from(
          "[data-step]",
          { y: 18, opacity: 0, duration: 0.6, ease: EASE, stagger: 0.12 },
          0.1,
        );
      });
    },
    { scope: root },
  );
  return (
    <section ref={root} aria-labelledby="how-title" className="pb-16">
      <h2 id="how-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Cara top-up
      </h2>
      <div className="relative mt-8">
        <span data-step-line aria-hidden className="absolute left-5 right-5 top-5 hidden h-px bg-gradient-to-r from-accent via-accent-line to-line lg:block" />
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} data-step className="relative grid grid-cols-[auto_1fr] gap-3 lg:block">
              <span className="relative z-10 grid size-10 place-items-center rounded-full bg-accent font-mono text-sm font-semibold tabular text-accent-ink ring-4 ring-bg">{i + 1}</span>
              <div className="lg:mt-4">
                <p className="font-semibold text-ink">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section aria-labelledby="faq-title" className="grid gap-8 border-t border-line py-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div>
        <h2 id="faq-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Pertanyaan umum
        </h2>
        <p className="mt-2 max-w-[36ch] text-ink-2">Masih ragu? Cek status pesanan kapan saja dengan nomor pesanan dan ID game.</p>
        <Link to="/cek" className="press mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-5 font-medium hover:bg-surface-2">
          <Receipt size={18} aria-hidden />
          Cek pesanan
        </Link>
      </div>
      <div className="grid gap-2">
        {FAQ.map((f) => (
          <details key={f.q} className="group rounded-2xl border border-line bg-surface px-5 open:shadow-ambient">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
              {f.q}
              <CaretDown size={18} className="shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180" aria-hidden />
            </summary>
            <p className="pb-4 text-sm leading-relaxed text-ink-2">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
