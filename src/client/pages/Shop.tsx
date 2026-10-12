import { CaretDown, CheckCircle, Lightning, MagnifyingGlass, QrCode, ShieldCheck, Sparkle, UserCircleMinus, WarningCircle } from "@phosphor-icons/react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { ActivityItem, GameSummary, GamesResponse, NicknameResult, ProductOffer } from "../../shared/api";
import { type GameConfig, findGame } from "../../shared/games";
import { AnimatedContent } from "../components/bits/AnimatedContent";
import { ClickSpark } from "../components/bits/ClickSpark";
import Grainient from "../components/bits/Grainient";
import { Magnet } from "../components/bits/Magnet";
import { SplitText } from "../components/bits/SplitText";
import SpotlightCard from "../components/bits/SpotlightCard";
import { Poster } from "../components/Poster";
import { Button, Field, Input, Notice, Skeleton, useFieldId } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { idr, shortLabel, timeAgo } from "../lib/format";
import { type GameTheme, BRAND, mixHex, themeFor, useGameColour } from "../lib/gameTheme";
import { gsap, motionOK, useGSAP } from "../lib/motion";
import { scrollToElement } from "../lib/smoothScroll";
import { newClientToken, orderPath, saveOrder } from "../lib/storage";
import { useTheme } from "../lib/theme";

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
  useGameColour(theme);

  return (
    <>
      <Hero theme={theme} game={current ?? null} games={games} latest={latest} loading={!data && !error} />
      <div className="relative mx-auto max-w-5xl px-4 pb-32 lg:pb-10">
        <div className="relative z-10 -mt-20 sm:-mt-24">
          {error ? (
            <SoftCard>
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
            </SoftCard>
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
            <SoftCard>
              <Notice tone="warning" title="Game tidak ditemukan">
                Pilih salah satu game di atas.
              </Notice>
            </SoftCard>
          )}
        </div>
        <HowItWorks />
        <Faq />
      </div>
    </>
  );
}

function Hero({ theme, game, games, latest, loading }: { theme: GameTheme; game: GameSummary | null; games: GameSummary[]; latest?: ActivityItem; loading: boolean }) {
  const root = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const lightInk = theme.ink.toLowerCase() === "#ffffff";

  // Game change: chips settle in and the poster floats in from the side.
  useGSAP(
    () => {
      if (!game) return;
      motionOK(() => {
        gsap
          .timeline({ defaults: { ease: "expo.out" } })
          .from("[data-hero-sub]", { opacity: 0, y: 14, filter: "blur(6px)", duration: 0.8, stagger: 0.07, clearProps: "filter" }, 0.15)
          .from(card.current, { rotateY: -40, rotateZ: -8, x: 80, y: 20, opacity: 0, duration: 1.2, transformPerspective: 900 }, 0);
      });
    },
    { scope: root, dependencies: [game?.slug] },
  );

  // The poster drifts gently and leans toward the pointer (mouse and pen only).
  useGSAP(
    () => {
      const el = card.current;
      const area = root.current;
      if (!el || !area) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to("[data-float]", { y: -10, duration: 3.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
      });
      mm.add("(prefers-reduced-motion: no-preference) and (pointer: fine)", () => {
        const rx = gsap.quickTo(el, "rotateX", { duration: 0.8, ease: "power3.out" });
        const ry = gsap.quickTo(el, "rotateY", { duration: 0.8, ease: "power3.out" });
        gsap.set(el, { transformPerspective: 900 });
        const move = (e: PointerEvent) => {
          const r = area.getBoundingClientRect();
          ry(((e.clientX - r.left) / r.width - 0.5) * 14);
          rx(-((e.clientY - r.top) / r.height - 0.5) * 10);
        };
        const leave = () => {
          rx(0);
          ry(0);
        };
        area.addEventListener("pointermove", move);
        area.addEventListener("pointerleave", leave);
        return () => {
          area.removeEventListener("pointermove", move);
          area.removeEventListener("pointerleave", leave);
        };
      });
    },
    { scope: root, dependencies: [!!game] },
  );

  return (
    <section ref={root} className="relative -mt-16 overflow-hidden rounded-b-[40px] text-[var(--game-ink)] sm:rounded-b-[56px]">
      {/* CSS gradient underneath: shows while WebGL starts, or if it is unavailable. */}
      <div className="absolute inset-0 bg-[linear-gradient(140deg,var(--game),var(--game-deep))]" aria-hidden />
      <div className="absolute inset-0" aria-hidden>
        <Grainient
          color1={theme.color}
          color2={mixHex(theme.color, "#ffffff", 0.5)}
          color3={theme.deep}
          timeSpeed={0.12}
          warpStrength={0.9}
          warpAmplitude={40}
          blendSoftness={0.25}
          contrast={1.15}
          saturation={0.95}
          grainAmount={0.07}
          zoom={0.85}
        />
      </div>
      {lightInk ? <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.18),transparent_45%,rgb(0_0_0/0.12))]" aria-hidden /> : null}
      <div className="relative mx-auto grid max-w-5xl gap-8 px-4 pb-32 pt-28 sm:pb-36 sm:pt-32 md:grid-cols-[minmax(0,1fr)_16rem] md:items-center">
        <div className="min-w-0">
          <GamePicker games={games} active={game?.slug ?? null} />
          <div className="mt-8 min-h-[11rem]">
            {game ? (
              <>
                <p data-hero-sub>
                  <Chip>
                    <Sparkle size={14} weight="fill" aria-hidden />
                    {game.publisher} · {game.tagline}
                  </Chip>
                </p>
                <h1 className="mt-3 text-[2.75rem] font-extrabold leading-[1] tracking-[-0.04em] sm:text-[4.5rem]">
                  <SplitText text={game.name} />
                </h1>
                <ul data-hero-sub className="mt-5 flex flex-wrap gap-2">
                  <li>
                    <Chip>
                      <Lightning size={15} weight="fill" aria-hidden />
                      Masuk otomatis setelah bayar
                    </Chip>
                  </li>
                  <li>
                    <Chip>
                      <QrCode size={15} weight="bold" aria-hidden />
                      QRIS semua bank dan e-wallet
                    </Chip>
                  </li>
                  <li>
                    <Chip>
                      <UserCircleMinus size={15} weight="bold" aria-hidden />
                      Tanpa daftar akun
                    </Chip>
                  </li>
                </ul>
                {latest ? (
                  <p data-hero-sub className="mt-4 flex items-center gap-2 text-sm font-medium opacity-90">
                    <span className="relative flex size-2" aria-hidden>
                      <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" />
                      <span className="relative size-2 rounded-full bg-current" />
                    </span>
                    Terakhir berhasil: {shortLabel(latest.product, latest.game)}, {timeAgo(latest.completedAt)}
                  </p>
                ) : null}
              </>
            ) : loading ? (
              <div aria-hidden className="grid gap-3 opacity-30">
                <div className="h-7 w-44 rounded-full bg-current" />
                <div className="h-16 w-80 max-w-full rounded-2xl bg-current" />
              </div>
            ) : null}
          </div>
        </div>
        {game ? (
          <div data-float className="relative hidden md:block">
            <div ref={card} className="relative mx-auto w-[16rem] rotate-[4deg]" style={{ transformStyle: "preserve-3d" }}>
              <div className="absolute -inset-6 rounded-[40px] bg-[var(--game-ink)] opacity-20 blur-3xl" aria-hidden />
              <Poster slug={game.slug} name={game.name} image={game.image} className="rounded-[28px] shadow-[0_40px_70px_-24px_rgb(0_0_0/0.55)] ring-4 ring-white/25" />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--game-ink)_22%,transparent)] bg-[color-mix(in_oklab,var(--game-ink)_14%,transparent)] px-3 py-1.5 text-[13px] font-semibold backdrop-blur-md">
      {children}
    </span>
  );
}

/** Posters for every game in a glass tray; the active one rises. */
function GamePicker({ games, active }: { games: GameSummary[]; active: string | null }) {
  const root = useRef<HTMLUListElement>(null);
  useGSAP(
    () => {
      motionOK(() => {
        gsap.from("[data-pick]", { y: 24, opacity: 0, scale: 0.9, duration: 0.9, ease: "expo.out", stagger: 0.07 });
      });
    },
    { scope: root, dependencies: [games.length] },
  );
  if (games.length === 0) return <div className="h-[7.5rem]" />;
  return (
    <nav aria-label="Pilih game">
      <ul
        ref={root}
        className="flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-[26px] border border-[color-mix(in_oklab,var(--game-ink)_18%,transparent)] bg-[color-mix(in_oklab,var(--game-ink)_10%,transparent)] p-2 backdrop-blur-md [scrollbar-width:none]"
      >
        {games.map((g) => {
          const on = g.slug === active;
          return (
            <li key={g.slug} data-pick className="shrink-0">
              <Link
                to={`/game/${g.slug}`}
                aria-current={on ? "page" : undefined}
                aria-label={`${g.name}${g.startingPrice !== null ? `, mulai ${idr(g.startingPrice)}` : ""}`}
                className={`group block w-[4.5rem] rounded-[18px] p-1 transition-[transform,background-color] duration-500 ease-[var(--ease-out)] sm:w-[5.25rem] ${
                  on ? "-translate-y-1 bg-[color-mix(in_oklab,var(--game-ink)_22%,transparent)]" : "hover:-translate-y-0.5"
                }`}
              >
                <span className={`block overflow-hidden rounded-[14px] transition-opacity duration-300 ${on ? "shadow-[0_12px_24px_-10px_rgb(0_0_0/0.55)]" : "opacity-70 group-hover:opacity-100"}`}>
                  <Poster slug={g.slug} name={g.name} image={g.image} />
                </span>
                <span className={`mt-1 block truncate text-center text-[10.5px] font-bold ${on ? "" : "opacity-75"}`}>
                  {g.startingPrice !== null ? idr(g.startingPrice) : "Segera"}
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

  // Cards rise softly over the hero, then the denominations follow.
  useGSAP(
    () => {
      motionOK(() => {
        gsap
          .timeline({ defaults: { ease: "expo.out" } })
          .from("[data-card]", { y: 40, opacity: 0, scale: 0.98, duration: 1, stagger: 0.08 })
          .from("[data-tile]", { y: 16, opacity: 0, scale: 0.96, duration: 0.7, stagger: 0.03 }, "-=0.7");
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
      if (tilesRef.current) scrollToElement(tilesRef.current);
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
    <form ref={rootRef} onSubmit={submit} noValidate className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-5">
      <div className="grid gap-4 lg:gap-5">
        <SoftCard step={1} title="Masukkan data akun" theme={theme}>
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
        </SoftCard>

        <SoftCard step={2} title="Pilih nominal" note={game.productCount > 0 ? `${game.productCount} pilihan` : undefined} theme={theme}>
          {game.products.length === 0 ? (
            <p className="text-sm text-ink-2">
              {catalogReady ? `Nominal ${game.name} sedang kosong. Coba lagi nanti.` : "Harga belum diterima dari penyedia. Coba lagi beberapa menit lagi."}
            </p>
          ) : (
            <ClickSpark className="text-[var(--game)]">
              <div ref={tilesRef} role="radiogroup" aria-label={`Nominal ${game.name}`} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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
                      className={`group relative flex min-h-[7rem] flex-col rounded-[20px] p-3.5 text-left text-ink transition-[transform,background-color,box-shadow] duration-300 ease-[var(--ease-out)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 ${
                        on
                          ? "bg-[color-mix(in_oklab,var(--game)_13%,var(--surface))] shadow-[inset_0_0_0_2px_var(--game),0_14px_30px_-16px_var(--game)]"
                          : "bg-surface-2/70 hover:-translate-y-0.5 hover:bg-surface hover:shadow-[0_14px_30px_-18px_rgb(0_0_0/0.35),inset_0_0_0_1px_var(--line)]"
                      }`}
                    >
                      <Pile Icon={theme.Icon} count={p.available ? tier(p) : 1} />
                      <span className="mt-auto pt-3">
                        <span className="block text-[1.35rem] font-extrabold leading-none tracking-tight tabular">{amount}</span>
                        {unit ? <span className="mt-1 block truncate text-xs font-medium text-ink-3">{unit}</span> : null}
                      </span>
                      <span className={`mt-2.5 inline-flex w-fit rounded-full px-2.5 py-1 text-[13px] font-bold tabular ${on ? "bg-[var(--game)] text-[var(--game-ink)]" : "bg-surface text-ink-2 group-hover:text-ink"}`}>
                        {p.available ? idr(p.price) : "Habis"}
                      </span>
                      {on ? <CheckCircle size={22} weight="fill" className="absolute right-3 top-3 text-[var(--game)]" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            </ClickSpark>
          )}
        </SoftCard>
      </div>

      <aside aria-label="Ringkasan pesanan" data-card className="hidden lg:sticky lg:top-24 lg:block">
        <div className="overflow-hidden rounded-[28px] bg-surface shadow-raised ring-1 ring-line">
          <div className="bg-[linear-gradient(160deg,color-mix(in_oklab,var(--game)_18%,var(--surface)),var(--surface)_70%)] px-6 pb-5 pt-6">
            <div className="flex items-center gap-2.5">
              <StepBadge n={3} />
              <h2 className="font-bold">Bayar</h2>
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-ink-3">Total</p>
            <p className="text-[2.25rem] font-extrabold leading-tight tracking-tight tabular">
              <CountUp value={product?.price ?? null} />
            </p>
          </div>
          <dl className="grid gap-2.5 px-6 pt-4 text-sm">
            <SummaryRow k="Game" v={game.name} />
            <SummaryRow k="Akun" v={userId ? `${userId}${config.zone && zoneId ? ` (${zoneId})` : ""}` : null} />
            {nickname?.status === "found" && nickname.nickname ? <SummaryRow k="Nama" v={nickname.nickname} /> : null}
            <SummaryRow k="Nominal" v={productLabel} />
          </dl>
          <div className="px-6 pb-6 pt-5">
            {submitError ? (
              <p className="mb-3 rounded-2xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger" role="alert">
                {submitError}
              </p>
            ) : null}
            <Magnet className="block" padding={40} strength={6}>
              <PayButton loading={submitting} className="w-full" />
            </Magnet>
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-3">
              <ShieldCheck size={16} weight="fill" className="mt-px shrink-0 text-[var(--game)]" aria-hidden />
              Scan dari aplikasi bank atau e-wallet apa pun. Kalau gateway menambah biaya, totalnya tampil sebelum kamu bayar.
            </p>
          </div>
        </div>
      </aside>

      {/* Phones: the total and the pay button stay in reach. */}
      <div className="fixed inset-x-3 bottom-3 z-30 rounded-[26px] border border-white/50 bg-[color-mix(in_oklab,var(--surface)_80%,transparent)] p-3 pl-5 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.4)] backdrop-blur-xl dark:border-white/10 lg:hidden">
        {submitError ? (
          <p className="mb-2 text-sm text-danger" role="alert">
            {submitError}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-ink-3">{productLabel ?? "Belum pilih nominal"}</p>
            <p className="text-xl font-extrabold tracking-tight tabular">
              <CountUp value={product?.price ?? null} />
            </p>
          </div>
          <PayButton loading={submitting} short />
        </div>
      </div>
    </form>
  );
}

/** The total rolls to the new price instead of jumping. */
function CountUp({ value }: { value: number | null }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  useGSAP(
    () => {
      const node = el.current;
      if (!node) return;
      const from = shown.current;
      shown.current = value;
      if (value === null) {
        node.textContent = "Rp -";
        return;
      }
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (from === null || reduce) {
        node.textContent = idr(value);
        return;
      }
      const o = { v: from };
      gsap.to(o, { v: value, duration: 0.7, ease: "power3.out", onUpdate: () => (node.textContent = idr(Math.round(o.v))) });
    },
    { dependencies: [value], revertOnUpdate: false },
  );
  // GSAP owns the text (written before paint), so React never fights the tween.
  return <span ref={el} aria-live="polite" />;
}

function PayButton({ loading, className = "", short }: { loading: boolean; className?: string; short?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading || undefined}
      className={`press inline-flex h-[3.25rem] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[linear-gradient(135deg,var(--game),color-mix(in_oklab,var(--game)_70%,var(--game-deep)))] px-6 font-bold text-[var(--game-ink)] shadow-[0_14px_30px_-12px_var(--game)] transition-[filter,box-shadow] hover:brightness-110 hover:shadow-[0_18px_36px_-12px_var(--game)] disabled:cursor-wait disabled:opacity-70 ${className}`}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden /> : <QrCode size={20} weight="bold" aria-hidden />}
      {short ? "Bayar QRIS" : "Bayar dengan QRIS"}
    </button>
  );
}

/** One to three overlapping currency icons: a quick read of the pack size. */
function Pile({ Icon, count }: { Icon: GameTheme["Icon"]; count: number }) {
  return (
    <span className="flex h-7 items-center text-[var(--game)]" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`grid size-7 place-items-center rounded-full bg-surface shadow-[0_2px_6px_-2px_rgb(0_0_0/0.2)] ${i > 0 ? "-ml-2.5" : ""}`}>
          <Icon size={16} weight="fill" />
        </span>
      ))}
    </span>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--game)_15%,var(--surface))] text-sm font-extrabold text-[var(--game)] ring-1 ring-[color-mix(in_oklab,var(--game)_25%,transparent)]">
      {n}
    </span>
  );
}

/** A soft card with a spotlight that follows the pointer, tinted with the game colour. */
function SoftCard({ step, title, note, theme, children }: { step?: number; title?: string; note?: string; theme?: GameTheme; children: ReactNode }) {
  const [mode] = useTheme();
  return (
    <div data-card>
      <SpotlightCard theme={mode} spotlightColor={theme?.color ?? BRAND.color} intensity={0.35} spotlightSize={320} borderGlow={0.9} className="rounded-[28px] p-5 sm:p-6">
        {title ? (
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {step ? <StepBadge n={step} /> : null}
              <h2 className="font-bold">{title}</h2>
            </div>
            {note ? <span className="truncate rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-3">{note}</span> : null}
          </div>
        ) : null}
        {children}
      </SpotlightCard>
    </div>
  );
}

function SummaryRow({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-3">{k}</dt>
      <dd className={`min-w-0 truncate text-right font-medium ${v ? "text-ink" : "text-ink-3"}`}>{v ?? "-"}</dd>
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
            <span className="font-semibold">{result.nickname}</span>
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

const STEPS: [typeof Lightning, string, string][] = [
  [Sparkle, "Pilih game dan nominal", "Isi ID akun. Untuk game yang mendukung, cek nama akun dulu supaya tidak salah kirim."],
  [QrCode, "Bayar dengan QRIS", "Scan dari m-banking atau e-wallet mana pun. Tidak perlu daftar akun."],
  [Lightning, "Item masuk otomatis", "Begitu pembayaran terverifikasi, top-up dikirim ke akunmu. Status bisa dipantau dari halaman pesanan."],
];

function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="mt-16">
      <AnimatedContent>
        <h2 id="how-title" className="text-2xl font-extrabold tracking-tight">
          Cara top-up
        </h2>
        <p className="mt-1 text-ink-2">Tiga langkah, tanpa daftar akun.</p>
      </AnimatedContent>
      <ol className="mt-6 grid gap-3 md:grid-cols-3">
        {STEPS.map(([Icon, title, body], i) => (
          <li key={title}>
            <AnimatedContent delay={i * 0.08} className="h-full">
              <div className="h-full rounded-[26px] bg-surface p-5 shadow-raised ring-1 ring-line">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--game)_14%,var(--surface))] text-[var(--game)]">
                    <Icon size={22} weight="fill" aria-hidden />
                  </span>
                  <span className="text-3xl font-extrabold tabular text-ink/10" aria-hidden>
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-1 text-sm text-ink-2">{body}</p>
              </div>
            </AnimatedContent>
          </li>
        ))}
      </ol>
    </section>
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
    <section aria-labelledby="faq-title" className="mt-16 grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10">
      <AnimatedContent>
        <h2 id="faq-title" className="text-2xl font-extrabold tracking-tight">
          Sebelum top-up
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Mau cek status?{" "}
          <Link to="/cek" className="font-semibold text-[var(--game)] underline-offset-4 hover:underline">
            Cek pesanan
          </Link>
        </p>
      </AnimatedContent>
      <div className="grid gap-2.5">
        {FAQ.map(([q, a], i) => (
          <AnimatedContent key={q} delay={i * 0.06} distance={24}>
            <details className="group rounded-[22px] bg-surface px-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-line open:shadow-raised">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 transition-transform duration-300 group-open:rotate-180">
                  <CaretDown size={14} weight="bold" aria-hidden />
                </span>
              </summary>
              <p className="pb-5 pr-10 text-sm leading-relaxed text-ink-2">{a}</p>
            </details>
          </AnimatedContent>
        ))}
      </div>
    </section>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]" aria-busy aria-label="Memuat">
      <div className="grid gap-4">
        <Skeleton className="h-48 rounded-[28px]" />
        <Skeleton className="h-80 rounded-[28px]" />
      </div>
      <Skeleton className="hidden h-96 rounded-[28px] lg:block" />
    </div>
  );
}
