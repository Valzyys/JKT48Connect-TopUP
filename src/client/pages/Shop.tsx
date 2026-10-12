import { ArrowRight, CaretDown, Circle, Package, TrendUp, CheckCircle, Crown, Headset, Lightning, MagnifyingGlass, QrCode, Receipt, ShieldCheck, Sparkle, UserCircleMinus, WarningCircle } from "@phosphor-icons/react";
import { type FormEvent, type ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { ActivityItem, GameSummary, GamesResponse, NicknameResult, ProductOffer } from "../../shared/api";
import { type GameConfig, findGame } from "../../shared/games";
import { AnimatedContent } from "../components/bits/AnimatedContent";
import { ClickSpark } from "../components/bits/ClickSpark";
import { Magnet } from "../components/bits/Magnet";
import { SplitText } from "../components/bits/SplitText";
import SpotlightCard from "../components/bits/SpotlightCard";
import { Poster } from "../components/Poster";
import { Button, Field, Input, Notice, Skeleton, useFieldId } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { idr, shortLabel, timeAgo } from "../lib/format";
import { categoryLabel, categoryOf, parseOffer, sortCategories } from "../lib/offer";
import { type GameTheme, BRAND, mixHex, themeFor, useGameColour } from "../lib/gameTheme";
import { gsap, motionOK, useGSAP } from "../lib/motion";
import { scrollToElement } from "../lib/smoothScroll";
import { newClientToken, orderPath, saveOrder, savedOrders } from "../lib/storage";
import { useTheme } from "../lib/theme";

// The WebGL background (and its ogl renderer) loads after first paint, and only
// on desktops: on phones and touch screens the hero keeps its CSS gradient,
// which costs nothing to scroll. The CSS gradient also shows until WebGL starts.
const Grainient = lazy(() => import("../components/bits/Grainient"));
const richBackground = typeof window !== "undefined" && window.matchMedia("(min-width: 768px) and (pointer: fine)").matches;

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

  // Games with stock first; the catalog decides the rest of the order.
  const games = useMemo(() => [...(data?.games ?? [])].sort((a, b) => Number(b.productCount > 0) - Number(a.productCount > 0)), [data]);
  const current = slug ? games.find((g) => g.slug === slug) : (games.find((g) => g.productCount > 0) ?? games[0]);
  const config = current ? findGame(current.slug) : undefined;
  const theme = data ? themeFor(current?.slug) : BRAND;
  const latest = current ? activity.find((a) => a.gameSlug === current.slug) : undefined;
  useGameColour(theme);

  return (
    <>
      <Hero theme={theme} game={current ?? null} games={games} latest={latest} loading={!data && !error} />
      <div className="relative mx-auto max-w-7xl px-4 pb-32 sm:px-6 lg:pb-10">
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
        {data ? <AllGames games={games} active={current?.slug ?? null} /> : null}
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

  // Parallax as the hero scrolls away: copy sinks and fades, the gradient
  // swells, the poster rises at its own pace. Tied to scroll position (scrub).
  useGSAP(
    () => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        const scrollTrigger = { trigger: root.current, start: "top top", end: "bottom top", scrub: 0.6 };
        gsap.to("[data-parallax-copy]", { yPercent: 22, opacity: 0.25, ease: "none", scrollTrigger });
        gsap.to("[data-parallax-bg]", { scale: 1.15, yPercent: 10, ease: "none", scrollTrigger });
        gsap.to("[data-parallax-card]", { yPercent: -30, ease: "none", scrollTrigger });
      });
    },
    { scope: root },
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
      {/* CSS gradient underneath: the whole background on phones, and on desktops
          while WebGL starts or when it is unavailable. */}
      <div
        className="absolute inset-0 bg-[radial-gradient(60%_45%_at_18%_12%,color-mix(in_oklab,var(--game)_55%,white)_0%,transparent_70%),radial-gradient(70%_60%_at_90%_80%,var(--game-deep)_0%,transparent_75%),linear-gradient(140deg,var(--game),var(--game-deep))]"
        aria-hidden
      />
      <div data-parallax-bg className="absolute inset-0" aria-hidden>
        {richBackground ? (
          <Suspense fallback={null}>
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
          </Suspense>
        ) : null}
      </div>
      {lightInk ? <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.18),transparent_45%,rgb(0_0_0/0.12))]" aria-hidden /> : null}
      <div className="relative mx-auto grid max-w-7xl gap-8 px-4 pb-32 pt-28 sm:px-6 sm:pb-36 sm:pt-32 md:grid-cols-[minmax(0,1fr)_16rem] md:items-center lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div data-parallax-copy className="min-w-0">
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
          <div data-parallax-card className="relative hidden md:block">
          <div data-float>
            <div ref={card} className="relative mx-auto w-[16rem] rotate-[4deg] lg:w-[19rem]" style={{ transformStyle: "preserve-3d" }}>
              <div className="absolute -inset-6 rounded-[40px] bg-[var(--game-ink)] opacity-20 blur-3xl" aria-hidden />
              <Poster slug={game.slug} name={game.name} image={game.image} className="rounded-[28px] shadow-[0_40px_70px_-24px_rgb(0_0_0/0.55)] ring-4 ring-white/25" />
            </div>
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
        className="flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-[26px] [mask-image:linear-gradient(90deg,#000_calc(100%-2.5rem),transparent)] pr-8 border border-[color-mix(in_oklab,var(--game-ink)_18%,transparent)] bg-[color-mix(in_oklab,var(--game-ink)_10%,transparent)] p-2 backdrop-blur-md [scrollbar-width:none]"
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

  return (
    <form ref={rootRef} onSubmit={submit} noValidate className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:gap-5">
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
          <AccountChecks
            idOk={!errors.userId && !!userId}
            zoneOk={config.zone ? !errors.zoneId && !!zoneId : null}
            checkable={game.nicknameCheck}
            supported={!!config.nicknameProduct}
            checking={checking}
            onCheck={checkNickname}
            result={nickname}
          />
        </SoftCard>

        <SoftCard step={2} title="Pilih nominal" note={game.productCount > 0 ? `${game.productCount} pilihan` : undefined} theme={theme}>
          {game.products.length === 0 ? (
            <p className="text-sm text-ink-2">
              {catalogReady ? `Nominal ${game.name} sedang kosong. Coba lagi nanti.` : "Harga belum diterima dari penyedia. Coba lagi beberapa menit lagi."}
            </p>
          ) : (
            <div ref={tilesRef} className="scroll-mt-28">
              <Denominations
                game={game}
                theme={theme}
                selected={product?.code ?? null}
                onSelect={(code) => {
                  setSelected(code);
                  setSubmitError(null);
                }}
              />
            </div>
          )}
        </SoftCard>
      </div>

      <aside aria-label="Ringkasan pesanan" data-card className="hidden gap-4 lg:sticky lg:top-24 lg:grid">
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
        <SideExtras />
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

const COLLAPSED = 12;

/**
 * Denomination picker. Amount packs (e.g. 86 Diamonds) and named packs (passes,
 * memberships) sit in separate tabs when a game has both. Long lists start
 * collapsed at 12 tiles; the selected one is always visible.
 */
function Denominations({ game, theme, selected, onSelect }: { game: GameSummary; theme: GameTheme; selected: string | null; onSelect: (code: string) => void }) {
  const parsed = useMemo(() => game.products.map((p) => { const o = parseOffer(p.label, game.name, game.currency); return { p, o, c: categoryOf(o) }; }), [game]);
  // Each game gets only the tabs its own catalog fills (e.g. Diamonds, Pass & membership, Bundle).
  const tabs = sortCategories(parsed.map((x) => x.c)).map((id) => ({ id, label: categoryLabel(id, game.currency), items: parsed.filter((x) => x.c === id) }));
  const initialTab: string = tabs.find((t) => t.items.some((x) => x.p.code === selected))?.id ?? tabs[0]?.id ?? "amount";
  const [tab, setTab] = useState(initialTab);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const items = current?.items ?? [];
  const selectedIndex = items.findIndex((x) => x.p.code === selected);
  const [open, setOpen] = useState(selectedIndex >= COLLAPSED);
  const shown = open ? items : items.slice(0, COLLAPSED);
  const grid = useRef<HTMLDivElement>(null);
  const seen = useRef<{ tab: string; count: number } | null>(null);
  const available = items.filter((x) => x.p.available);
  // Bigger packs get a bigger pile of the game's currency icon.
  const tier = (code: string) => 1 + Math.min(2, Math.floor((3 * available.findIndex((x) => x.p.code === code)) / Math.max(1, available.length)));

  // New tiles (another tab, or "show all") settle in; tiles already on screen stay put.
  useGSAP(
    () => {
      const prev = seen.current;
      seen.current = { tab, count: shown.length };
      if (!prev) return; // first render: the checkout entrance already animates the tiles
      const from = prev.tab === tab ? prev.count : 0;
      motionOK(() => {
        gsap.from(gsap.utils.toArray<HTMLElement>("[data-tile]").slice(from), { y: 14, opacity: 0, scale: 0.97, duration: 0.55, ease: "expo.out", stagger: 0.02 });
      });
    },
    { scope: grid, dependencies: [tab, open] },
  );

  return (
    <div ref={grid}>
      {tabs.length > 1 ? (
        <div role="tablist" aria-label="Kategori" className="-mx-1 mb-4 flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface-2 p-1 [scrollbar-width:none] sm:inline-flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              onClick={() => {
                setTab(t.id);
                setOpen(false);
              }}
              className={`press h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${t.id === tab ? "bg-surface text-ink shadow-[0_2px_8px_-3px_rgb(0_0_0/0.25)]" : "text-ink-3 hover:text-ink"}`}
            >
              {t.label} <span className="ml-1 text-xs font-medium text-ink-3">{t.items.length}</span>
            </button>
          ))}
        </div>
      ) : null}
      <ClickSpark className="text-[var(--game)]">
        <div role="radiogroup" aria-label={`Nominal ${game.name}`} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
          {shown.map(({ p, o, c }) => {
            const on = p.code === selected;
            const name = o.kind === "amount" ? `${o.amount.toLocaleString("id-ID")} ${o.unit}${o.bonus ? `, bonus ${o.bonus}` : ""}` : o.title;
            return (
              <button
                key={p.code}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${name}, ${p.available ? idr(p.price) : "habis"}`}
                disabled={!p.available}
                data-tile
                onClick={() => onSelect(p.code)}
                className={`group relative flex min-h-[7.25rem] flex-col rounded-[20px] p-3.5 text-left text-ink transition-[transform,background-color,box-shadow] duration-300 ease-[var(--ease-out)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 ${
                  on
                    ? "bg-[color-mix(in_oklab,var(--game)_13%,var(--surface))] shadow-[inset_0_0_0_2px_var(--game),0_14px_30px_-16px_var(--game)]"
                    : "bg-surface-2/70 hover:-translate-y-0.5 hover:bg-surface hover:shadow-[0_14px_30px_-18px_rgb(0_0_0/0.35),inset_0_0_0_1px_var(--line)]"
                }`}
              >
                {o.kind === "amount" ? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <Pile Icon={theme.Icon} count={p.available ? tier(p.code) : 1} />
                      {o.bonus ? <span className="whitespace-nowrap rounded-full bg-[color-mix(in_oklab,var(--game)_16%,var(--surface))] px-2 py-0.5 text-[11px] font-bold tabular text-[var(--game)]">+{o.bonus.toLocaleString("id-ID")}</span> : null}
                    </span>
                    <span className="mt-auto pt-3">
                      <span className="block text-[1.35rem] font-extrabold leading-none tracking-tight tabular">{o.amount.toLocaleString("id-ID")}</span>
                      <span className="mt-1 block truncate text-xs font-medium text-ink-3">{o.unit}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="grid size-7 place-items-center rounded-full bg-surface text-[var(--game)] shadow-[0_2px_6px_-2px_rgb(0_0_0/0.2)]" aria-hidden>
                      {c === "bundle" ? <Package size={15} weight="fill" /> : c === "levelup" ? <TrendUp size={15} weight="bold" /> : <Crown size={15} weight="fill" />}
                    </span>
                    <span className="mt-auto line-clamp-2 pt-3 text-sm font-bold leading-snug">{o.title}</span>
                  </>
                )}
                <span className={`mt-2.5 inline-flex w-fit rounded-full px-2.5 py-1 text-[13px] font-bold tabular ${on ? "bg-[var(--game)] text-[var(--game-ink)]" : "bg-surface text-ink-2 group-hover:text-ink"}`}>
                  {p.available ? idr(p.price) : "Habis"}
                </span>
                {on ? <CheckCircle size={22} weight="fill" className="absolute right-3 top-3 text-[var(--game)]" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </ClickSpark>
      {items.length > COLLAPSED ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="press mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-surface-2 text-sm font-semibold text-ink-2 hover:text-ink"
          aria-expanded={open}
        >
          {open ? "Tampilkan lebih sedikit" : `Tampilkan semua ${items.length} nominal`}
          <CaretDown size={14} weight="bold" className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      ) : null}
    </div>
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

/**
 * Everything the page can check about the account before paying: the ID format
 * (instantly, in the browser) and, where the provider offers it, the account
 * name. A check code the provider has switched off is shown as unavailable
 * rather than hidden, and comes back on by itself when the catalog re-enables it.
 */
function AccountChecks(props: { idOk: boolean; zoneOk: boolean | null; checkable: boolean; supported: boolean; checking: boolean; onCheck: () => void; result: NicknameResult | null }) {
  const formatOk = props.idOk && props.zoneOk !== false;
  return (
    <div className="mt-4 grid gap-2.5 rounded-[20px] bg-surface-2/70 p-3.5">
      <CheckRow ok={formatOk} label={formatOk ? "Format ID sesuai" : "Format ID dicek otomatis saat kamu mengetik"} />
      {props.supported || props.checkable ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button type="button" variant="secondary" size="sm" onClick={props.onCheck} loading={props.checking} disabled={!props.checkable} className="rounded-full">
            {!props.checking ? <MagnifyingGlass size={16} aria-hidden /> : null}
            Cek nama akun
          </Button>
          {props.checkable ? <NicknameLine result={props.result} /> : <span className="text-xs text-ink-3">Sedang dimatikan penyedia. Aktif lagi otomatis begitu tersedia.</span>}
        </div>
      ) : (
        <p className="text-xs text-ink-3">Penyedia belum menyediakan cek nama untuk game ini. Pastikan ID sama persis dengan yang di profil game.</p>
      )}
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className={`flex items-center gap-2 text-sm ${ok ? "font-semibold text-success" : "text-ink-3"}`}>
      {ok ? <CheckCircle size={18} weight="fill" className="shrink-0" aria-hidden /> : <Circle size={18} className="shrink-0" aria-hidden />}
      {label}
    </p>
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

/** Under the pay card: this device's recent orders and where to get help. */
function SideExtras() {
  const [orders] = useState(() => savedOrders().slice(0, 3));
  return (
    <>
      {orders.length > 0 ? (
        <div className="rounded-[24px] bg-surface p-5 shadow-raised ring-1 ring-line">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Receipt size={16} weight="fill" className="text-[var(--game)]" aria-hidden />
            Pesanan terakhirmu
          </h3>
          <ul className="mt-3 grid gap-1.5">
            {orders.map((o) => (
              <li key={o.ref}>
                <Link to={orderPath(o.ref, o.token)} className="press flex items-center justify-between gap-3 rounded-2xl bg-surface-2/70 px-3 py-2.5 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">{o.product}</span>
                    <span className="block truncate text-xs text-ink-3">{o.game}</span>
                  </span>
                  <ArrowRight size={14} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="rounded-[24px] bg-[linear-gradient(150deg,color-mix(in_oklab,var(--game)_14%,var(--surface)),var(--surface))] p-5 ring-1 ring-line">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Headset size={16} weight="fill" className="text-[var(--game)]" aria-hidden />
          Sudah bayar tapi belum masuk?
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-2">Buka halaman pesananmu untuk melihat statusnya. Kalau gagal, pesanan otomatis masuk antrean admin.</p>
        <Link to="/cek" className="press mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-4 text-[13px] font-semibold shadow-[0_2px_8px_-3px_rgb(0_0_0/0.2)]">
          Cek pesanan
          <ArrowRight size={13} weight="bold" aria-hidden />
        </Link>
      </div>
    </>
  );
}

/** Every game as a poster card, with live counts from the catalog. */
function AllGames({ games, active }: { games: GameSummary[]; active: string | null }) {
  const grid = useRef<HTMLUListElement>(null);
  // Alternate columns drift against each other while the grid crosses the screen
  // (wide screens only: on phones 16 scrubbed cards cost more than they add).
  useGSAP(
    () => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference) and (min-width: 768px)", () => {
        gsap.utils.toArray<HTMLElement>("[data-drift]").forEach((el, i) => {
          const dir = i % 2 === 0 ? 1 : -1;
          gsap.fromTo(el, { y: 26 * dir }, { y: -26 * dir, ease: "none", scrollTrigger: { trigger: grid.current, start: "top bottom", end: "bottom top", scrub: 0.8 } });
        });
      });
    },
    { scope: grid, dependencies: [games.length] },
  );
  const live = games.filter((g) => g.productCount > 0);
  const offers = live.reduce((n, g) => n + g.productCount, 0);
  return (
    <section aria-labelledby="games-title" className="mt-16">
      <AnimatedContent>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="games-title" className="text-2xl font-extrabold tracking-tight">
              Semua game
            </h2>
            <p className="mt-1 text-ink-2">Pilih game lain, harga dan nominal langsung dari katalog penyedia.</p>
          </div>
          <dl className="flex gap-2">
            <Stat k="Game aktif" v={String(live.length)} />
            <Stat k="Nominal" v={offers.toLocaleString("id-ID")} />
          </dl>
        </div>
      </AnimatedContent>
      <ul ref={grid} className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {games.map((g, i) => {
          const on = g.slug === active;
          const t = themeFor(g.slug);
          return (
            <li key={g.slug} data-drift>
              <AnimatedContent delay={(i % 6) * 0.05} distance={28} className="h-full">
                <Link
                  to={`/game/${g.slug}`}
                  aria-current={on ? "page" : undefined}
                  className={`group block h-full rounded-[22px] bg-surface p-2 shadow-raised ring-1 transition-transform duration-500 ease-[var(--ease-out)] hover:-translate-y-1 ${on ? "ring-2 ring-[var(--game)]" : "ring-line"} ${g.productCount === 0 ? "opacity-60" : ""}`}
                >
                  <span className="block overflow-hidden rounded-[16px]">
                    <span className="block transition-transform duration-700 ease-[var(--ease-out)] group-hover:scale-[1.05]">
                      <Poster slug={g.slug} name={g.name} image={g.image} />
                    </span>
                  </span>
                  <span className="block px-1.5 pb-1 pt-2">
                    <span className="block truncate text-[13px] font-bold">{g.name}</span>
                    <span className="mt-0.5 flex items-center justify-between gap-1 text-[11px] text-ink-3">
                      <span className="truncate">{g.productCount > 0 ? `${g.productCount} nominal` : "Segera"}</span>
                      {g.startingPrice !== null ? (
                        <span className="shrink-0 font-semibold" style={{ color: t.color }}>
                          {idr(g.startingPrice)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </AnimatedContent>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-surface px-4 py-2.5 shadow-raised ring-1 ring-line">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{k}</dt>
      <dd className="text-lg font-extrabold tabular">{v}</dd>
    </div>
  );
}

const STEPS: [typeof Lightning, string, string][] = [
  [Sparkle, "Pilih game dan nominal", "Isi ID akun. Untuk game yang mendukung, cek nama akun dulu supaya tidak salah kirim."],
  [QrCode, "Bayar dengan QRIS", "Scan dari m-banking atau e-wallet mana pun. Tidak perlu daftar akun."],
  [Lightning, "Item masuk otomatis", "Begitu pembayaran terverifikasi, top-up dikirim ke akunmu. Status bisa dipantau dari halaman pesanan."],
];

function HowItWorks() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo("[data-num]", { yPercent: 60 }, { yPercent: -60, ease: "none", scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: 0.6 } });
      });
    },
    { scope: root },
  );
  return (
    <section ref={root} aria-labelledby="how-title" className="mt-16">
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
                  <span data-num className="text-4xl font-extrabold tabular text-ink/10" aria-hidden>
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]" aria-busy aria-label="Memuat">
      <div className="grid gap-4">
        <Skeleton className="h-48 rounded-[28px]" />
        <Skeleton className="h-80 rounded-[28px]" />
      </div>
      <Skeleton className="hidden h-96 rounded-[28px] lg:block" />
    </div>
  );
}
