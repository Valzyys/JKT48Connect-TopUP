import { ArrowRight, Receipt } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { GamesResponse } from "../../shared/api";
import { GameMark } from "../components/GameMark";
import { Button, Notice, Skeleton } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { idr, wibDateTime } from "../lib/format";

const STEPS = [
  { title: "Pilih game", body: "Nominal dan harga diambil dari katalog terbaru." },
  { title: "Isi ID akun", body: "Cek nama akun dulu bila game mendukung." },
  { title: "Bayar QRIS", body: "Scan dari aplikasi bank atau e-wallet mana pun." },
  { title: "Simpan nomor pesanan", body: "Cek status kapan saja, tanpa login." },
];

export function Home() {
  const [data, setData] = useState<GamesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
    return () => ctrl.abort();
  }, [attempt]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid gap-6 pb-10 pt-10 sm:pt-14 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="rise max-w-[36rem]">
          <h1 className="text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.03em] text-ink sm:text-5xl">Top-up game, tanpa daftar akun.</h1>
          <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-ink-2 sm:text-lg">
            Pilih game, isi ID, bayar dengan QRIS. Nomor pesanan jadi kunci untuk cek status kapan saja.
          </p>
        </div>
        <div className="rise flex flex-wrap gap-2 [animation-delay:60ms]">
          <Button size="lg" onClick={() => document.getElementById("games")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            Pilih game
            <ArrowRight size={18} weight="bold" aria-hidden />
          </Button>
          <Link to="/cek" className="press inline-flex h-12 items-center gap-2 rounded-button border border-line-strong bg-surface px-5 font-medium text-ink hover:bg-surface-2">
            <Receipt size={18} aria-hidden />
            Cek pesanan
          </Link>
        </div>
      </section>

      <section id="games" aria-labelledby="games-title" className="scroll-mt-24 pb-16">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="games-title" className="text-lg font-semibold tracking-tight">
            Game
          </h2>
          {data?.catalog.syncedAt ? <p className="text-sm text-ink-3">Harga per {wibDateTime(data.catalog.syncedAt)}</p> : null}
        </div>

        {data?.catalog.available && data.catalog.stale ? (
          <div className="mb-4">
            <Notice tone="warning" title="Katalog belum diperbarui">
              Harga di bawah berasal dari sinkronisasi terakhir yang berhasil. Ketersediaan dicek ulang saat kamu membuat pesanan.
            </Notice>
          </div>
        ) : null}

        {error ? (
          <Notice
            tone="danger"
            title="Katalog belum bisa dimuat"
            action={
              <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                Coba lagi
              </Button>
            }
          >
            {error}
          </Notice>
        ) : !data ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Memuat game">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="rounded-card border border-line bg-surface p-4">
                <Skeleton className="size-12" />
                <Skeleton className="mt-4 h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-1/3" />
                <Skeleton className="mt-6 h-4 w-1/2" />
              </li>
            ))}
          </ul>
        ) : !data.catalog.available ? (
          <Notice tone="warning" title="Katalog sedang disiapkan">
            Daftar produk belum tersedia dari penyedia. Coba lagi beberapa menit lagi.
          </Notice>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.games.map((g, i) => {
              const ready = g.productCount > 0;
              const body = (
                <>
                  <div className="flex items-center gap-3">
                    <GameMark name={g.name} hue={g.hue} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{g.name}</p>
                      <p className="text-sm text-ink-3">{g.publisher}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-ink-2">
                      {ready && g.startingPrice !== null ? (
                        <>
                          Mulai <span className="font-mono tabular font-medium text-ink">{idr(g.startingPrice)}</span>
                        </>
                      ) : (
                        "Belum tersedia"
                      )}
                    </p>
                    {g.nicknameCheck && ready ? <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">Cek nama akun</span> : null}
                  </div>
                </>
              );
              return (
                <li key={g.slug} className="rise" style={{ animationDelay: `${80 + i * 40}ms` }}>
                  {ready ? (
                    <Link
                      to={`/game/${g.slug}`}
                      className="press group block h-full rounded-card border border-line bg-surface p-4 shadow-ambient hover:border-line-strong hover:shadow-raised"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="h-full rounded-card border border-dashed border-line p-4 opacity-70" aria-disabled>
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="how-title" className="border-t border-line py-14">
        <h2 id="how-title" className="text-lg font-semibold tracking-tight">
          Cara top-up
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[auto_1fr] gap-3">
              <span className="grid size-7 place-items-center rounded-full bg-surface-2 font-mono text-sm tabular text-ink-2">{i + 1}</span>
              <div>
                <p className="font-medium text-ink">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
