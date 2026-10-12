import { CaretDown, CheckCircle, Lightning, MagnifyingGlass, QrCode, UserCircleMinus, WarningCircle } from "@phosphor-icons/react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { ActivityItem, GameSummary, GamesResponse, NicknameResult, ProductOffer } from "../../shared/api";
import { type GameConfig, findGame } from "../../shared/games";
import { Button, Field, Input, Notice, Skeleton, useFieldId } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { idr, shortLabel, timeAgo } from "../lib/format";
import { type GameTheme, BRAND, themeFor } from "../lib/gameTheme";
import { gsap, motionOK, useGSAP } from "../lib/motion";
import { newClientToken, orderPath, saveOrder } from "../lib/storage";

/**
 * The whole storefront is one checkout: pick a game, enter the account, pick a
 * denomination, pay. `/` opens the first game that has stock; `/game/:slug`
 * opens a specific one. The catalog loads once, so switching games is instant,
 * and the page takes on the colour of the game being bought for.
 */
export function Shop() {
  const { slug } = useParams();
  const [data, setData] = useState<GamesResponse | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
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
    api
      .activity(ctrl.signal)
      .then((r) => setActivity(r.items))
      .catch(() => {});
    return () => ctrl.abort();
  }, [attempt]);

  const games = data?.games ?? [];
  const current = slug ? games.find((g) => g.slug === slug) : (games.find((g) => g.productCount > 0) ?? games[0]);
  const config = current ? findGame(current.slug) : undefined;
  const theme = data ? themeFor(current?.slug) : BRAND;
  const latest = current ? activity.find((a) => a.gameSlug === current.slug) : undefined;

  return (
    <Themed theme={theme} slug={current?.slug ?? null}>
      <Hero theme={theme} game={current ?? null} games={games} latest={latest} loading={!data && !error} />
      <div className="relative mx-auto max-w-5xl px-4 pb-32 lg:pb-14">
        <div className="-mt-14 sm:-mt-16">
          {error ? (
            <Card>
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
            </Card>
          ) : !data ? (
            <CheckoutSkeleton />
          ) : current && config ? (
            <>
              {data.catalog.available && data.catalog.stale ? (
                <div className="mb-3">
                  <Notice tone="warning">Harga belum diperbarui dari penyedia. Harga dan stok dicek ulang saat pesanan dibuat.</Notice>
                </div>
              ) : null}
              {/* Keyed by game: a new game starts with an empty form. */}
              <Checkout key={current.slug} game={current} config={config} theme={theme} catalogReady={data.catalog.available} />
            </>
          ) : (
            <Card>
              <Notice tone="warning" title="Game tidak ditemukan">
                Pilih salah satu game di atas.
              </Notice>
            </Card>
          )}
        </div>
        <Faq />
      </div>
    </Themed>
  );
}

/**
 * Holds the game colour as CSS variables. The first colour is set inline; after
 * that GSAP owns the variables and blends from one game's colour to the next.
 */
function Themed({ theme, slug, children }: { theme: GameTheme; slug: string | null; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [initial] = useState(() => ({ "--game": theme.color, "--game-ink": theme.ink }) as React.CSSProperties);
  const first = useRef(true);
  useGSAP(
    () => {
      const vars = { "--game": theme.color, "--game-ink": theme.ink };
      if (first.current) {
        first.current = false;
        gsap.set(root.current, vars);
        return;
      }
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gsap.to(root.current, { ...vars, duration: reduce ? 0 : 0.6, ease: "power2.inOut" });
    },
    { dependencies: [theme.color, slug] },
  );
  return (
    <div ref={root} style={initial}>
      {children}
    </div>
  );
}

function Hero({ theme, game, games, latest, loading }: { theme: GameTheme; game: GameSummary | null; games: GameSummary[]; latest?: ActivityItem; loading: boolean }) {
  const root = useRef<HTMLElement>(null);
  const { Icon } = theme;
  useGSAP(
    () => {
      if (!game) return;
      motionOK(() => {
        gsap
          .timeline({ defaults: { ease: "expo.out" } })
          .from("[data-hero-title]", { yPercent: 105, duration: 0.8 })
          .from("[data-hero-sub]", { opacity: 0, y: 8, duration: 0.6, stagger: 0.06 }, "-=0.55")
          .from("[data-hero-icon]", { rotate: -30, scale: 0.7, opacity: 0, duration: 1.1 }, 0);
      });
    },
    { scope: root, dependencies: [game?.slug] },
  );
  return (
    <section ref={root} className="relative overflow-hidden bg-[var(--game)] text-[var(--game-ink)]">
      <Icon data-hero-icon weight="fill" aria-hidden className="pointer-events-none absolute -right-16 -top-10 size-[22rem] rotate-[14deg] opacity-[0.13] sm:-right-6 sm:-top-14 sm:size-[30rem]" />
      <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-4 sm:pb-28 sm:pt-6">
        <GamePicker games={games} active={game?.slug ?? null} />
        <div className="mt-8 min-h-[9.5rem] sm:mt-12 sm:min-h-[11rem]">
          {game ? (
            <>
              <p data-hero-sub className="text-sm font-medium opacity-80">
                {game.publisher} · {game.tagline}
              </p>
              <h1 className="mt-1 overflow-hidden pb-1">
                <span data-hero-title className="block text-[2.7rem] font-extrabold leading-[0.95] tracking-[-0.035em] sm:text-[4.5rem]">
                  {game.name}
                </span>
              </h1>
              <ul data-hero-sub className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
                <Fact Icon={Lightning}>Masuk otomatis setelah bayar</Fact>
                <Fact Icon={QrCode}>QRIS, semua bank dan e-wallet</Fact>
                <Fact Icon={UserCircleMinus}>Tanpa daftar akun</Fact>
              </ul>
              {latest ? (
                <p data-hero-sub className="mt-4 inline-flex items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--game-ink)_14%,transparent)] px-3 py-1 text-sm">
                  <span className="size-1.5 rounded-full bg-current" aria-hidden />
                  Terakhir berhasil: {shortLabel(latest.product, latest.game)}, {timeAgo(latest.completedAt)}
                </p>
              ) : null}
            </>
          ) : loading ? (
            <div aria-hidden className="grid gap-3 opacity-30">
              <div className="h-4 w-40 rounded bg-current" />
              <div className="h-14 w-80 max-w-full rounded bg-current" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Fact({ Icon, children }: { Icon: typeof Lightning; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <Icon size={18} weight="bold" aria-hidden />
      {children}
    </li>
  );
}

function GamePicker({ games, active }: { games: GameSummary[]; active: string | null }) {
  if (games.length === 0) return <div className="h-9" />;
  return (
    <nav aria-label="Pilih game">
      <ul className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {games.map((g) => {
          const on = g.slug === active;
          return (
            <li key={g.slug} className="shrink-0">
              <Link
                to={`/game/${g.slug}`}
                aria-current={on ? "page" : undefined}
                className={`press inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold ${
                  on
                    ? "bg-[var(--game-ink)] text-[var(--game)]"
                    : "bg-[color-mix(in_oklab,var(--game-ink)_12%,transparent)] hover:bg-[color-mix(in_oklab,var(--game-ink)_22%,transparent)]"
                }`}
              >
                {g.name}
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

/** "86 Diamonds" -> { amount: "86", unit: "Diamonds" }; other labels stay whole. */
function splitLabel(label: string): { amount: string; unit: string } {
  const m = /^([\d.,]+)\s+(.+)$/.exec(label);
  return m ? { amount: m[1]!, unit: m[2]! } : { amount: label, unit: "" };
}

function Checkout({ game, config, theme, catalogReady }: { game: GameSummary; config: GameConfig; theme: GameTheme; catalogReady: boolean }) {
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
  const rootRef = useRef<HTMLFormElement>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const userFieldId = useFieldId("user");
  const zoneFieldId = useFieldId("zone");

  // Cards rise into place over the hero, then the denominations follow.
  useGSAP(
    () => {
      motionOK(() => {
        gsap
          .timeline({ defaults: { ease: "expo.out" } })
          .from("[data-card]", { y: 24, opacity: 0, duration: 0.7, stagger: 0.07 })
          .from("[data-tile]", { y: 10, opacity: 0, duration: 0.45, stagger: 0.025 }, "-=0.5");
      });
    },
    { scope: rootRef },
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
  const available = game.products.filter((p) => p.available);
  // Bigger packs get a bigger pile of the game's currency icon.
  const tier = (p: ProductOffer) => 1 + Math.min(2, Math.floor((3 * available.indexOf(p)) / Math.max(1, available.length)));

  return (
    <form ref={rootRef} onSubmit={submit} noValidate className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-4">
      <div className="grid gap-3 lg:gap-4">
        <Card step={1} title="Masukkan data akun">
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
        </Card>

        <Card step={2} title="Pilih nominal" note={game.productCount > 0 ? `${game.productCount} pilihan` : undefined}>
          {game.products.length === 0 ? (
            <p className="text-sm text-ink-2">
              {catalogReady ? `Nominal ${game.name} sedang kosong. Coba lagi nanti.` : "Harga belum diterima dari penyedia. Coba lagi beberapa menit lagi."}
            </p>
          ) : (
            <div ref={tilesRef} role="radiogroup" aria-label={`Nominal ${game.name}`} className="grid scroll-mt-20 grid-cols-2 gap-2 sm:grid-cols-3">
              {game.products.map((p) => {
                const on = p.code === product?.code;
                const { amount, unit } = splitLabel(shortLabel(p.label, game.name));
                return (
                  <button
                    key={p.code}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${amount} ${unit}, ${p.available ? idr(p.price) : "habis"}`}
                    disabled={!p.available}
                    data-tile
                    onClick={() => {
                      setSelected(p.code);
                      setSubmitError(null);
                    }}
                    className={`press group relative flex min-h-[6.75rem] flex-col rounded-[10px] border p-3 text-left transition-[border-color,background-color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:opacity-55 ${
                      on
                        ? "border-[var(--game)] bg-[color-mix(in_oklab,var(--game)_9%,var(--surface))] shadow-[inset_0_0_0_1px_var(--game)]"
                        : "border-line bg-surface hover:border-[color-mix(in_oklab,var(--game)_45%,var(--line))]"
                    }`}
                  >
                    <Pile Icon={theme.Icon} count={p.available ? tier(p) : 1} />
                    <span className="mt-auto pt-3">
                      <span className="block text-xl font-bold leading-none tracking-tight tabular">{amount}</span>
                      {unit ? <span className="mt-0.5 block truncate text-xs text-ink-3">{unit}</span> : null}
                    </span>
                    <span className={`mt-2 text-sm font-semibold tabular ${on ? "text-ink" : "text-ink-2"}`}>{p.available ? idr(p.price) : "Habis"}</span>
                    {on ? <CheckCircle size={20} weight="fill" className="absolute right-2.5 top-2.5 text-[var(--game)]" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <aside aria-label="Ringkasan pesanan" data-card className="hidden lg:sticky lg:top-20 lg:block">
        <div className="overflow-hidden rounded-[14px] bg-ink text-bg shadow-raised">
          <div className="flex items-center gap-2.5 px-5 pt-5">
            <StepBadge n={3} />
            <h2 className="font-semibold">Bayar</h2>
          </div>
          <dl className="mt-4 grid gap-2 px-5 text-sm">
            <SummaryRow k="Game" v={game.name} />
            <SummaryRow k="Akun" v={userId ? `${userId}${config.zone && zoneId ? ` (${zoneId})` : ""}` : null} />
            {nickname?.status === "found" && nickname.nickname ? <SummaryRow k="Nama" v={nickname.nickname} /> : null}
            <SummaryRow k="Nominal" v={productLabel} />
          </dl>
          <div className="mx-5 mt-4 border-t border-dashed border-[color-mix(in_oklab,var(--bg)_25%,transparent)] pt-4">
            <p className="text-xs opacity-60">Total</p>
            <p className="text-[2rem] font-bold leading-tight tracking-tight tabular">{product ? idr(product.price) : "Rp -"}</p>
          </div>
          <div className="px-5 pb-5 pt-3">
            {submitError ? (
              <p className="mb-3 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                {submitError}
              </p>
            ) : null}
            <PayButton loading={submitting} className="w-full" />
            <p className="mt-3 text-xs leading-relaxed opacity-60">Scan dari aplikasi bank atau e-wallet apa pun. Kalau gateway menambah biaya, totalnya tampil sebelum kamu bayar.</p>
          </div>
        </div>
      </aside>

      {/* Phones: the total and the pay button stay in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
        {submitError ? (
          <p className="mb-2 text-sm text-danger" role="alert">
            {submitError}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-ink-3">{productLabel ?? "Belum pilih nominal"}</p>
            <p className="text-xl font-bold tracking-tight tabular">{product ? idr(product.price) : "Rp -"}</p>
          </div>
          <PayButton loading={submitting} short />
        </div>
      </div>
    </form>
  );
}

function PayButton({ loading, className = "", short }: { loading: boolean; className?: string; short?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading || undefined}
      className={`press inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] bg-[var(--game)] px-5 font-semibold text-[var(--game-ink)] hover:brightness-110 disabled:cursor-wait disabled:opacity-70 ${className}`}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden /> : <QrCode size={20} weight="bold" aria-hidden />}
      {short ? "Bayar QRIS" : "Bayar dengan QRIS"}
    </button>
  );
}

/** One to three overlapping currency icons: a quick read of the pack size. */
function Pile({ Icon, count }: { Icon: GameTheme["Icon"]; count: number }) {
  return (
    <span className="flex h-6 items-center text-[var(--game)]" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Icon key={i} size={22} weight="fill" className={`drop-shadow-[0_0_0_var(--surface)] ${i > 0 ? "-ml-2.5" : ""}`} style={{ opacity: 1 - (count - 1 - i) * 0.25 }} />
      ))}
    </span>
  );
}

function StepBadge({ n }: { n: number }) {
  return <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--game)] text-xs font-bold text-[var(--game-ink)]">{n}</span>;
}

function Card({ step, title, note, children }: { step?: number; title?: string; note?: string; children: ReactNode }) {
  return (
    <section data-card className="rounded-[14px] border border-line bg-surface p-4 shadow-raised sm:p-5">
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {step ? <StepBadge n={step} /> : null}
            <h2 className="font-semibold">{title}</h2>
          </div>
          {note ? <span className="truncate text-sm text-ink-3">{note}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function SummaryRow({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 opacity-60">{k}</dt>
      <dd className={`min-w-0 truncate text-right ${v ? "" : "opacity-40"}`}>{v ?? "-"}</dd>
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

const FAQ: [string, string][] = [
  ["Berapa lama sampai item masuk?", "Top-up dikirim otomatis begitu pembayaran QRIS terverifikasi, biasanya dalam beberapa menit. Status bisa dipantau dari halaman pesanan."],
  ["Bisa bayar pakai apa?", "QRIS, jadi bisa dari aplikasi m-banking atau e-wallet apa pun yang punya fitur scan QRIS, seperti GoPay, OVO, DANA, atau ShopeePay."],
  ["Bagaimana kalau ID yang dimasukkan salah?", "Top-up yang sudah terkirim tidak bisa ditarik kembali. Pakai tombol Cek nama akun bila tersedia, dan pastikan ID dan Zone ID sesuai profil di game."],
  ["Top-up gagal setelah bayar, lalu bagaimana?", "Pesanan otomatis masuk antrean admin untuk ditangani. Simpan nomor pesanan atau link halaman pesanan untuk penelusuran."],
];

function Faq() {
  return (
    <section aria-labelledby="faq-title" className="mt-12 grid gap-4 border-t border-line pt-8 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 id="faq-title" className="text-lg font-semibold">
          Sebelum top-up
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Pertanyaan lain? Cek status lewat{" "}
          <Link to="/cek" className="font-medium text-ink underline underline-offset-4">
            Cek pesanan
          </Link>
          .
        </p>
      </div>
      <div className="divide-y divide-line border-y border-line">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 font-medium [&::-webkit-details-marker]:hidden">
              {q}
              <CaretDown size={16} className="shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180" aria-hidden />
            </summary>
            <p className="pb-4 pr-8 text-sm text-ink-2">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-busy aria-label="Memuat">
      <div className="grid gap-4">
        <Skeleton className="h-44 rounded-[14px]" />
        <Skeleton className="h-72 rounded-[14px]" />
      </div>
      <Skeleton className="hidden h-80 rounded-[14px] lg:block" />
    </div>
  );
}
