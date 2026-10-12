import { ArrowRight, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { ActivityItem, GameSummary, GamesResponse, ProductOffer } from "../../shared/api";
import { Button, Notice, Skeleton } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { idr, shortLabel, timeAgo, wibTime } from "../lib/format";
import { EASE, gsap, motionOK, useGSAP } from "../lib/motion";

/** Rows shown per board before "Lihat semua". */
const BOARD_ROWS = 10;

/**
 * The storefront is a price list, the way a konter pulsa shows it: every game,
 * every denomination, every price, on one page. No marketing hero; the catalog
 * is the content.
 */
export function Home() {
  const [data, setData] = useState<GamesResponse | null>(null);
  const [latest, setLatest] = useState<ActivityItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    api
      .games(ctrl.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof DOMException) return;
        setError(err instanceof ApiRequestError ? err.message : "Daftar harga belum bisa dimuat.");
      });
    api
      .activity(ctrl.signal)
      .then((r) => setLatest(r.items[0] ?? null))
      .catch(() => {});
    return () => ctrl.abort();
  }, [attempt]);

  const q = query.trim().toLowerCase();
  const boards = useMemo(() => {
    const games = [...(data?.games ?? [])].sort((a, b) => Number(b.productCount > 0) - Number(a.productCount > 0) || b.recentOrders - a.recentOrders);
    if (!q) return games.map((g) => ({ game: g, rows: g.products, matchedGame: true }));
    return games
      .map((g) => {
        const matchedGame = `${g.name} ${g.publisher}`.toLowerCase().includes(q);
        return { game: g, rows: matchedGame ? g.products : g.products.filter((p) => p.label.toLowerCase().includes(q)), matchedGame };
      })
      .filter((b) => b.matchedGame || b.rows.length > 0);
  }, [data, q]);

  const liveCount = data?.games.reduce((n, g) => n + g.productCount, 0) ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <header className="grid gap-6 border-b border-ink pb-6 pt-8 sm:pt-12 md:grid-cols-[minmax(0,1fr)_20rem] md:items-end">
        <div>
          <h1 className="text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[3.25rem]">Daftar harga top-up</h1>
          <p className="mt-3 max-w-[52ch] text-ink-2">
            Pilih nominal, isi ID game, bayar dengan QRIS. Harga di bawah adalah harga yang kamu bayar, belum termasuk selisih dari gateway bila ada.
          </p>
        </div>
        <label className="relative block">
          <span className="sr-only">Cari game atau nominal</span>
          <MagnifyingGlass size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari game atau nominal"
            className="h-11 w-full rounded-control border border-line-strong bg-surface pl-10 pr-10 text-[16px] text-ink placeholder:text-ink-3 focus:outline-none focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-control text-ink-3 hover:text-ink" aria-label="Hapus pencarian">
              <X size={16} aria-hidden />
            </button>
          ) : null}
        </label>
      </header>

      {data ? (
        <dl className="flex flex-wrap gap-x-8 gap-y-2 border-b border-line py-3 text-sm">
          <Fact k="Diperbarui" v={data.catalog.syncedAt ? wibTime(data.catalog.syncedAt) : "belum ada"} />
          <Fact k="Nominal aktif" v={String(liveCount)} mono />
          <Fact k="Pembayaran" v="QRIS" />
          {latest ? <Fact k="Terakhir berhasil" v={`${shortLabel(latest.product, latest.game)}, ${latest.game}, ${timeAgo(latest.completedAt)}`} /> : null}
        </dl>
      ) : null}

      {data?.catalog.available && data.catalog.stale ? (
        <div className="mt-6">
          <Notice tone="warning" title="Harga belum diperbarui">
            Daftar ini dari sinkronisasi terakhir yang berhasil. Harga dan stok dicek ulang saat pesanan dibuat.
          </Notice>
        </div>
      ) : null}

      {error ? (
        <div className="mt-8">
          <Notice tone="danger" title="Daftar harga belum bisa dimuat" action={<Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Coba lagi</Button>}>
            {error}
          </Notice>
        </div>
      ) : !data ? (
        <BoardsSkeleton />
      ) : !data.catalog.available ? (
        <div className="mt-8">
          <Notice tone="warning" title="Daftar harga sedang disiapkan">
            Katalog belum diterima dari penyedia. Coba lagi beberapa menit lagi.
          </Notice>
        </div>
      ) : (
        <>
          <GameIndex games={boards.map((b) => b.game)} />
          {boards.length === 0 ? (
            <div className="py-16">
              <p className="text-lg font-medium">Tidak ada yang cocok dengan “{query.trim()}”.</p>
              <button type="button" className="mt-2 text-sm font-medium text-accent underline-offset-4 hover:underline" onClick={() => setQuery("")}>
                Tampilkan semua harga
              </button>
            </div>
          ) : (
            <div className="grid gap-px">
              {boards.map((b) => (
                <Board key={b.game.slug} game={b.game} rows={b.rows} expanded={!!q} />
              ))}
            </div>
          )}
          <Footnotes />
        </>
      )}
    </div>
  );
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="text-ink-3">{k}</dt>
      <dd className={`min-w-0 truncate text-ink ${mono ? "font-mono tabular" : ""}`}>{v}</dd>
    </div>
  );
}

/** Jump links to each board; sticks under the header while scrolling the list. */
function GameIndex({ games }: { games: GameSummary[] }) {
  if (games.length < 2) return null;
  return (
    <nav aria-label="Lompat ke game" className="sticky top-16 z-20 -mx-4 border-b border-line bg-bg/95 px-4 backdrop-blur-md sm:-mx-6 sm:px-6">
      <ul className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
        {games.map((g) => (
          <li key={g.slug} className="shrink-0">
            <a href={`#${g.slug}`} className="press inline-flex h-9 items-center gap-2 rounded-control px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
              {g.name}
              <span className="font-mono text-xs tabular text-ink-3">{g.productCount}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Board({ game, rows, expanded }: { game: GameSummary; rows: ProductOffer[]; expanded: boolean }) {
  const root = useRef<HTMLElement>(null);
  const shown = expanded ? rows : rows.slice(0, BOARD_ROWS);
  const hidden = rows.length - shown.length;
  const ready = game.productCount > 0;

  useGSAP(
    () => {
      motionOK(() => {
        // Rows print in from the top as the board scrolls into view.
        gsap.from("[data-row]", {
          opacity: 0,
          y: 6,
          duration: 0.45,
          ease: EASE,
          stagger: 0.025,
          scrollTrigger: { trigger: root.current, start: "top 85%", once: true },
        });
      });
    },
    { scope: root, dependencies: [shown.length] },
  );

  return (
    <section ref={root} id={game.slug} aria-labelledby={`${game.slug}-title`} className="scroll-mt-32 border-b border-line py-8 sm:py-10">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <h2 id={`${game.slug}-title`} className="display text-[2.4rem] sm:text-[3.2rem]">
            {game.name}
          </h2>
          <p className="mt-2 text-sm text-ink-2">
            {game.publisher}, {game.tagline}
            {game.nicknameCheck ? <span className="text-ink-3">. Nama akun bisa dicek sebelum bayar</span> : null}
            {game.recentOrders > 0 ? <span className="text-ink-3">. {game.recentOrders} top-up berhasil dalam 30 hari</span> : null}
          </p>
        </div>
        {ready ? (
          <Link to={`/game/${game.slug}`} className="press inline-flex h-10 items-center gap-2 justify-self-start rounded-button bg-ink px-4 text-sm font-medium text-bg hover:opacity-90">
            Top up {game.name}
            <ArrowRight size={16} weight="bold" aria-hidden />
          </Link>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-ink-3">Belum ada nominal aktif dari penyedia.</p>
      ) : (
        <ul className="mt-6 grid gap-x-10 md:grid-cols-2">
          {shown.map((p) => (
            <li key={p.code} data-row>
              {p.available ? (
                <Link
                  to={`/game/${game.slug}?item=${encodeURIComponent(p.code)}`}
                  className="group flex items-baseline gap-3 rounded-control px-2 py-2.5 -mx-2 hover:bg-surface-2"
                  aria-label={`${shortLabel(p.label, game.name)}, ${idr(p.price)}`}
                >
                  <span className="min-w-0 text-[15px] text-ink">{shortLabel(p.label, game.name)}</span>
                  <span className="leader" aria-hidden />
                  <span className="shrink-0 font-mono text-[15px] font-medium tabular text-ink group-hover:text-accent">{idr(p.price)}</span>
                </Link>
              ) : (
                <div className="-mx-2 flex items-baseline gap-3 px-2 py-2.5 text-ink-3">
                  <span className="min-w-0 text-[15px]">{shortLabel(p.label, game.name)}</span>
                  <span className="leader" aria-hidden />
                  <span className="shrink-0 font-mono text-[15px] tabular">habis</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 ? (
        <Link to={`/game/${game.slug}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline">
          Lihat {hidden} nominal lainnya
          <ArrowRight size={14} weight="bold" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}

function Footnotes() {
  const notes = [
    "Harga mengikuti modal dari penyedia dan bisa berubah. Harga yang berlaku adalah yang tertera saat pesanan dibuat.",
    "Gateway QRIS dapat menambahkan selisih kecil. Total akhir selalu tampil sebelum kamu scan.",
    "Top-up diproses otomatis setelah pembayaran terverifikasi. Status bisa dicek dari link pesanan atau menu Cek pesanan.",
    "Bila top-up gagal, pesanan ditangani tim. Simpan nomor pesanan untuk penelusuran.",
  ];
  return (
    <section aria-labelledby="notes-title" className="py-10">
      <h2 id="notes-title" className="text-sm font-semibold">
        Catatan
      </h2>
      <ol className="mt-3 grid gap-2 text-sm text-ink-2 md:grid-cols-2 md:gap-x-10">
        {notes.map((n, i) => (
          <li key={i} className="grid grid-cols-[1.5rem_1fr]">
            <span className="font-mono tabular text-ink-3">{i + 1}.</span>
            <span>{n}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BoardsSkeleton() {
  return (
    <div aria-busy aria-label="Memuat daftar harga">
      {[0, 1].map((b) => (
        <div key={b} className="border-b border-line py-10">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="mt-3 h-4 w-56" />
          <div className="mt-6 grid gap-x-10 gap-y-4 md:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
