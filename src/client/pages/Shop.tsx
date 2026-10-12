import { CheckCircle, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { GameSummary, GamesResponse, NicknameResult } from "../../shared/api";
import { type GameConfig, findGame } from "../../shared/games";
import { Button, Field, Input, Notice, Skeleton, useFieldId } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { idr, shortLabel } from "../lib/format";
import { gsap, motionOK, useGSAP } from "../lib/motion";
import { newClientToken, orderPath, saveOrder } from "../lib/storage";

/**
 * The whole storefront is one checkout: pick a game, enter the account, pick a
 * denomination, pay. `/` opens the first game that has stock; `/game/:slug`
 * opens a specific one. The catalog loads once, so switching games is instant.
 */
export function Shop() {
  const { slug } = useParams();
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
        setError(err instanceof ApiRequestError ? err.message : "Daftar harga belum bisa dimuat.");
      });
    return () => ctrl.abort();
  }, [attempt]);

  if (error) {
    return (
      <Page>
        <Notice
          tone="danger"
          title="Daftar harga belum bisa dimuat"
          action={
            <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Coba lagi
            </Button>
          }
        >
          {error}
        </Notice>
      </Page>
    );
  }
  if (!data) return <ShopSkeleton />;

  const games = data.games;
  const current = slug ? games.find((g) => g.slug === slug) : (games.find((g) => g.productCount > 0) ?? games[0]);
  const config = current ? findGame(current.slug) : undefined;

  return (
    <Page>
      <GamePicker games={games} active={current?.slug ?? null} />
      {data.catalog.available && data.catalog.stale ? (
        <div className="mt-4">
          <Notice tone="warning">Harga belum diperbarui dari penyedia. Harga dan stok dicek ulang saat pesanan dibuat.</Notice>
        </div>
      ) : null}
      {current && config ? (
        // Keyed by game: a new game starts with an empty form.
        <Checkout key={current.slug} game={current} config={config} catalogReady={data.catalog.available} />
      ) : (
        <div className="mt-6">
          <Notice tone="warning" title="Game tidak ditemukan">
            Pilih salah satu game di atas.
          </Notice>
        </div>
      )}
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-5xl px-4 pb-32 pt-5 sm:pt-8 lg:pb-12">{children}</div>;
}

function GamePicker({ games, active }: { games: GameSummary[]; active: string | null }) {
  return (
    <nav aria-label="Pilih game">
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0">
        {games.map((g) => {
          const on = g.slug === active;
          return (
            <li key={g.slug} className="w-[10.5rem] shrink-0 snap-start sm:w-auto">
              <Link
                to={`/game/${g.slug}`}
                aria-current={on ? "page" : undefined}
                className={`press block h-full rounded-card border bg-surface px-3.5 py-3 ${
                  on ? "border-ink shadow-[inset_0_0_0_1px_var(--ink)]" : "border-line hover:border-line-strong"
                }`}
              >
                <span className="block truncate font-semibold">{g.name}</span>
                <span className="block truncate text-xs text-ink-3">{g.publisher}</span>
                <span className="mt-2 block text-sm tabular text-ink-2">
                  {g.startingPrice !== null ? `dari ${idr(g.startingPrice)}` : "Belum tersedia"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function validate(spec: { pattern: string; label: string } | null, value: string): string | undefined {
  if (!spec) return undefined;
  if (!value) return `${spec.label} wajib diisi.`;
  if (!new RegExp(spec.pattern).test(value)) return `${spec.label} hanya berisi angka. Periksa kembali.`;
  return undefined;
}

function Checkout({ game, config, catalogReady }: { game: GameSummary; config: GameConfig; catalogReady: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [userId, setUserId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [touched, setTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(() => params.get("item"));
  const [nickname, setNickname] = useState<NicknameResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // One checkout token per exact payload: a retried submit reuses the same order.
  const tokenRef = useRef<{ key: string; token: string } | null>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const userFieldId = useFieldId("user");
  const zoneFieldId = useFieldId("zone");

  // Denominations settle in when a game opens.
  useGSAP(
    () => {
      motionOK(() => {
        gsap.from("[data-tile]", { opacity: 0, y: 4, duration: 0.3, ease: "power2.out", stagger: 0.012 });
      });
    },
    { scope: tilesRef },
  );

  const product = game.products.find((p) => p.code === selected && p.available) ?? null;
  const errors = useMemo(() => ({ userId: validate(config.userId, userId), zoneId: validate(config.zone, zoneId) }), [config, userId, zoneId]);
  const accountValid = !errors.userId && !errors.zoneId;
  const userError = fieldErrors.userId ?? (touched ? errors.userId : undefined);
  const zoneError = fieldErrors.zoneId ?? (touched ? errors.zoneId : undefined);

  // A new account invalidates a previous nickname result.
  useEffect(() => setNickname(null), [userId, zoneId]);

  async function checkNickname() {
    setTouched(true);
    if (!accountValid) return;
    setChecking(true);
    try {
      setNickname(await api.nickname({ game: game.slug, userId, zoneId: config.zone ? zoneId : null }));
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Cek nama akun gagal. Coba lagi.");
    } finally {
      setChecking(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setSubmitError(null);
    if (!accountValid) {
      document.getElementById(errors.userId ? userFieldId : zoneFieldId)?.focus();
      return;
    }
    if (!product) {
      setSubmitError("Pilih nominal dulu.");
      tilesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const zone = config.zone ? zoneId : null;
    const key = JSON.stringify([game.slug, product.code, userId, zone]);
    if (tokenRef.current?.key !== key) tokenRef.current = { key, token: newClientToken() };
    const token = tokenRef.current.token;
    setSubmitting(true);
    try {
      const order = await api.createOrder({ game: game.slug, productCode: product.code, userId, zoneId: zone, clientToken: token });
      saveOrder({ ref: order.ref, token, game: game.name, product: shortLabel(product.label, game.name), createdAt: order.createdAt });
      tokenRef.current = null;
      navigate(orderPath(order.ref, token));
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.fields) setFieldErrors(err.fields);
        if (err.code === "token_reused") tokenRef.current = null;
        setSubmitError(err.message);
      } else {
        setSubmitError("Pesanan belum terkirim. Coba lagi.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const productLabel = product ? shortLabel(product.label, game.name) : null;

  return (
    <form onSubmit={submit} noValidate className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
      <div className="grid gap-4">
        <Panel title="Data akun">
          <div className={`grid gap-4 ${config.zone ? "grid-cols-[minmax(0,1fr)_7.5rem] sm:grid-cols-[minmax(0,1fr)_10rem]" : ""}`}>
            <Field label={config.userId.label} hint={config.userId.hint} error={userError} htmlFor={userFieldId}>
              <Input
                id={userFieldId}
                inputMode={config.userId.inputMode}
                autoComplete="off"
                maxLength={config.userId.maxLength}
                value={userId}
                invalid={!!userError}
                aria-describedby={`${userFieldId}-${userError ? "error" : "hint"}`}
                onChange={(e) => {
                  setUserId(e.target.value.replace(/\s+/g, ""));
                  setFieldErrors({});
                }}
                onBlur={() => userId && setTouched(true)}
              />
            </Field>
            {config.zone ? (
              <Field label={config.zone.label} hint={config.zone.hint} error={zoneError} htmlFor={zoneFieldId}>
                <Input
                  id={zoneFieldId}
                  inputMode={config.zone.inputMode}
                  autoComplete="off"
                  maxLength={config.zone.maxLength}
                  value={zoneId}
                  invalid={!!zoneError}
                  aria-describedby={`${zoneFieldId}-${zoneError ? "error" : "hint"}`}
                  onChange={(e) => {
                    setZoneId(e.target.value.replace(/\s+/g, ""));
                    setFieldErrors({});
                  }}
                />
              </Field>
            ) : null}
          </div>
          {game.nicknameCheck ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={checkNickname} loading={checking}>
                {!checking ? <MagnifyingGlass size={16} aria-hidden /> : null}
                Cek nama akun
              </Button>
              <NicknameLine result={nickname} />
            </div>
          ) : null}
        </Panel>

        <Panel title="Nominal" note={game.productCount > 0 ? `${game.productCount} pilihan` : undefined}>
          {game.products.length === 0 ? (
            <p className="text-sm text-ink-2">
              {catalogReady ? `Nominal ${game.name} sedang kosong. Coba lagi nanti.` : "Harga belum diterima dari penyedia. Coba lagi beberapa menit lagi."}
            </p>
          ) : (
            <div ref={tilesRef} role="radiogroup" aria-label={`Nominal ${game.name}`} className="grid scroll-mt-20 grid-cols-2 gap-2 sm:grid-cols-3">
              {game.products.map((p) => {
                const on = p.code === product?.code;
                return (
                  <button
                    key={p.code}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!p.available}
                    data-tile
                    onClick={() => {
                      setSelected(p.code);
                      setSubmitError(null);
                    }}
                    className={`press relative rounded-control border px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-ink-3 ${
                      on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong"
                    }`}
                  >
                    <span className="block pr-5 text-[15px] font-medium leading-snug">{shortLabel(p.label, game.name)}</span>
                    <span className={`mt-0.5 block text-sm tabular ${on ? "text-ink" : "text-ink-2"}`}>{p.available ? idr(p.price) : "Habis"}</span>
                    {on ? <CheckCircle size={18} weight="fill" className="absolute right-2 top-2 text-accent" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <aside aria-label="Ringkasan pesanan" className="hidden lg:sticky lg:top-20 lg:block">
        <div className="rounded-card border border-line bg-surface p-4">
          <h2 className="text-[15px] font-semibold">Ringkasan</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <Row k="Game" v={game.name} />
            <Row k="Akun" v={userId ? `${userId}${config.zone && zoneId ? ` (${zoneId})` : ""}` : null} />
            {nickname?.status === "found" && nickname.nickname ? <Row k="Nama" v={nickname.nickname} /> : null}
            <Row k="Nominal" v={productLabel} />
          </dl>
          <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <span className="text-sm text-ink-2">Total</span>
            <span className="text-xl font-semibold tabular">{product ? idr(product.price) : "-"}</span>
          </div>
          {submitError ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {submitError}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="mt-3 w-full" loading={submitting}>
            Bayar dengan QRIS
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            Bisa dibayar dari aplikasi bank atau e-wallet apa pun yang mendukung QRIS. Kalau gateway menambah biaya, totalnya tampil sebelum kamu bayar.
          </p>
        </div>
      </aside>

      {/* Phones: the total and the pay button stay in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden">
        {submitError ? (
          <p className="mb-2 text-sm text-danger" role="alert">
            {submitError}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-ink-3">{productLabel ?? "Belum pilih nominal"}</p>
            <p className="text-lg font-semibold tabular">{product ? idr(product.price) : "Rp -"}</p>
          </div>
          <Button type="submit" size="lg" loading={submitting}>
            Bayar QRIS
          </Button>
        </div>
      </div>
    </form>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {note ? <span className="truncate text-sm text-ink-3">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-3">{k}</dt>
      <dd className={`min-w-0 truncate text-right ${v ? "text-ink" : "text-ink-3"}`}>{v ?? "-"}</dd>
    </div>
  );
}

function NicknameLine({ result }: { result: NicknameResult | null }) {
  if (!result) return null;
  if (result.status === "found") {
    return (
      <p className="flex min-w-0 items-center gap-1.5 text-sm text-success" role="status">
        <CheckCircle size={18} weight="fill" className="shrink-0" aria-hidden />
        {result.nickname ? (
          <span className="min-w-0 truncate">
            <span className="font-medium">{result.nickname}</span>
            {result.server ? <span className="text-ink-2"> (Server {result.server})</span> : null}
          </span>
        ) : (
          <span>ID ditemukan. Nama akun tidak dikirim penyedia.</span>
        )}
      </p>
    );
  }
  return (
    <p className={`flex items-start gap-1.5 text-sm ${result.status === "not_found" ? "text-danger" : "text-ink-2"}`} role="status">
      <WarningCircle size={18} className="mt-px shrink-0" aria-hidden />
      {result.message}
    </p>
  );
}

function ShopSkeleton() {
  return (
    <Page>
      <div aria-busy aria-label="Memuat">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[4.75rem] rounded-card" />
          ))}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="grid gap-4">
            <Skeleton className="h-40 rounded-card" />
            <Skeleton className="h-64 rounded-card" />
          </div>
          <Skeleton className="hidden h-72 rounded-card lg:block" />
        </div>
      </div>
    </Page>
  );
}
