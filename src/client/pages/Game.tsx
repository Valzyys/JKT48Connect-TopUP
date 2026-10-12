import { CheckCircle, MagnifyingGlass, QrCode, WarningCircle } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { GameDetailResponse, NicknameResult } from "../../shared/api";
import { EASE, gsap, motionOK, useGSAP } from "../lib/motion";
import { Button, Field, Input, Notice, Skeleton, useFieldId } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { idr, shortLabel } from "../lib/format";
import { newClientToken, orderPath, saveOrder } from "../lib/storage";

type Detail = GameDetailResponse;

function validate(spec: { pattern: string; label: string } | null, value: string): string | undefined {
  if (!spec) return undefined;
  if (!value) return `${spec.label} wajib diisi.`;
  if (!new RegExp(spec.pattern).test(value)) return `${spec.label} hanya berisi angka. Periksa kembali.`;
  return undefined;
}

export function Game() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [data, setData] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [userId, setUserId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [touched, setTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Arriving from a price on the board preselects that denomination.
  const [selected, setSelected] = useState<string | null>(() => params.get("item"));
  const [nickname, setNickname] = useState<NicknameResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // One checkout token per exact payload: a retried submit reuses the same order.
  const tokenRef = useRef<{ key: string; token: string } | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Entrance once the game is loaded: banner title, then the denomination grid.
  useGSAP(
    () => {
      if (!data) return;
      motionOK(() => {
        gsap
          .timeline({ defaults: { ease: EASE } })
          .from("[data-banner-title]", { yPercent: 30, opacity: 0, duration: 0.7 })
          .from("[data-denom]", { opacity: 0, y: 6, duration: 0.4, stagger: 0.02 }, "-=0.4");
      });
    },
    { scope: pageRef, dependencies: [data?.game.slug] },
  );

  const userFieldId = useFieldId("user");
  const zoneFieldId = useFieldId("zone");

  useEffect(() => {
    const ctrl = new AbortController();
    setLoadError(null);
    api
      .game(slug, ctrl.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof DOMException) return;
        setLoadError(err instanceof ApiRequestError ? err.message : "Halaman game belum bisa dimuat.");
      });
    return () => ctrl.abort();
  }, [slug, attempt]);

  const game = data?.game;
  const product = data?.products.find((p) => p.code === selected) ?? null;
  const errors = useMemo(
    () => ({ userId: game ? validate(game.userId, userId) : undefined, zoneId: game ? validate(game.zone, zoneId) : undefined }),
    [game, userId, zoneId],
  );
  const accountValid = !errors.userId && !errors.zoneId;

  // A new account invalidates a previous nickname result.
  useEffect(() => setNickname(null), [userId, zoneId]);

  async function checkNickname() {
    setTouched(true);
    if (!game || !accountValid) return;
    setChecking(true);
    try {
      setNickname(await api.nickname({ game: game.slug, userId, zoneId: game.zone ? zoneId : null }));
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
    if (!game || !accountValid) {
      document.getElementById(errors.userId ? userFieldId : zoneFieldId)?.focus();
      return;
    }
    if (!product) {
      setSubmitError("Pilih nominal dulu.");
      document.getElementById("denominations")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const zone = game.zone ? zoneId : null;
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

  if (loadError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Notice
          tone="danger"
          title="Halaman game belum bisa dimuat"
          action={
            <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Coba lagi
            </Button>
          }
        >
          {loadError}
        </Notice>
      </div>
    );
  }

  if (!data || !game) return <GameSkeleton />;

  const userError = touched ? errors.userId : undefined;
  const zoneError = touched ? errors.zoneId : undefined;

  return (
    <div ref={pageRef} className="mx-auto max-w-6xl px-4 pb-32 pt-4 sm:px-6 sm:pt-6 lg:pb-16">
      <nav aria-label="Lokasi" className="text-sm text-ink-3">
        <Link to="/" className="hover:text-ink">
          Daftar harga
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-ink-2">{game.name}</span>
      </nav>
      <header className="mt-4 grid gap-3 border-b border-ink pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0 overflow-hidden">
          <h1 data-banner-title className="display text-[clamp(2.6rem,8vw,4.75rem)]">{game.name}</h1>
          <p className="mt-3 text-sm text-ink-2">
            {game.publisher}, {game.tagline}. {game.productCount} nominal aktif.
          </p>
        </div>
        {game.startingPrice !== null ? (
          <p className="text-sm text-ink-3 sm:text-right">
            mulai
            <span className="block font-mono text-2xl font-semibold tabular text-ink">{idr(game.startingPrice)}</span>
          </p>
        ) : null}
      </header>

      {data.catalog.stale && data.catalog.available ? (
        <div className="mt-6">
          <Notice tone="warning">Katalog belum diperbarui. Harga dan stok dicek ulang saat pesanan dibuat.</Notice>
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid gap-8">
          <section aria-labelledby="account-title">
            <h2 id="account-title" className="flex items-baseline gap-3 text-lg font-semibold tracking-tight">
              <span className="font-mono text-sm tabular text-accent">01</span>
              Data akun
            </h2>
            <div className={`mt-5 grid gap-4 ${game.zone ? "sm:grid-cols-[minmax(0,1fr)_10rem]" : ""}`}>
              <Field label={game.userId.label} hint={game.userId.hint} error={fieldErrors.userId ?? userError} htmlFor={userFieldId}>
                <Input
                  id={userFieldId}
                  inputMode={game.userId.inputMode}
                  autoComplete="off"
                  maxLength={game.userId.maxLength}
                  value={userId}
                  mono
                  invalid={!!(fieldErrors.userId ?? userError)}
                  aria-describedby={`${userFieldId}-${fieldErrors.userId ?? userError ? "error" : "hint"}`}
                  onChange={(e) => {
                    setUserId(e.target.value.replace(/\s+/g, ""));
                    setFieldErrors({});
                  }}
                  onBlur={() => userId && setTouched(true)}
                />
              </Field>
              {game.zone ? (
                <Field label={game.zone.label} hint={game.zone.hint} error={fieldErrors.zoneId ?? zoneError} htmlFor={zoneFieldId}>
                  <Input
                    id={zoneFieldId}
                    inputMode={game.zone.inputMode}
                    autoComplete="off"
                    maxLength={game.zone.maxLength}
                    value={zoneId}
                    mono
                    invalid={!!(fieldErrors.zoneId ?? zoneError)}
                    aria-describedby={`${zoneFieldId}-${fieldErrors.zoneId ?? zoneError ? "error" : "hint"}`}
                    onChange={(e) => {
                      setZoneId(e.target.value.replace(/\s+/g, ""));
                      setFieldErrors({});
                    }}
                  />
                </Field>
              ) : null}
            </div>

            {game.nicknameCheck ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" size="sm" onClick={checkNickname} loading={checking}>
                  {!checking ? <MagnifyingGlass size={16} aria-hidden /> : null}
                  Cek nama akun
                </Button>
                <NicknameLine result={nickname} />
              </div>
            ) : (
              <p className="mt-5 text-sm text-ink-3">Cek nama akun belum tersedia untuk game ini. Pastikan ID sudah benar sebelum membayar.</p>
            )}
          </section>

          <section id="denominations" aria-labelledby="nominal-title" className="scroll-mt-24 border-t border-line pt-8">
            <h2 id="nominal-title" className="flex items-baseline gap-3 text-lg font-semibold tracking-tight">
              <span className="font-mono text-sm tabular text-accent">02</span>
              Pilih nominal
            </h2>
            {data.products.length === 0 ? (
              <div className="mt-5">
                <Notice tone="warning" title="Belum ada nominal">
                  Nominal untuk {game.name} sedang tidak tersedia. Coba lagi nanti.
                </Notice>
              </div>
            ) : (
              <div role="radiogroup" aria-labelledby="nominal-title" className="mt-4 grid gap-x-6 sm:grid-cols-2">
                {data.products.map((p) => {
                  const active = p.code === selected;
                  return (
                    <button
                      key={p.code}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!p.available}
                      data-denom
                      onClick={() => {
                        setSelected(p.code);
                        setSubmitError(null);
                      }}
                      className={`press -mx-2 flex items-baseline gap-3 rounded-control px-2 py-3 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:text-ink-3 ${
                        active ? "bg-ink text-bg" : "text-ink hover:bg-surface-2"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`relative top-[0.15em] size-3.5 shrink-0 self-start rounded-full border-2 ${active ? "border-bg bg-accent" : "border-line-strong"}`}
                      />
                      <span className="min-w-0 text-[15px] font-medium">{shortLabel(p.label, game.name)}</span>
                      <span className="leader" aria-hidden />
                      <span className="shrink-0 font-mono text-[15px] tabular">{p.available ? idr(p.price) : "habis"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside aria-label="Ringkasan pesanan" className="lg:sticky lg:top-24">
          <div className="hidden rounded-ticket border border-line bg-surface shadow-raised lg:block">
            <Summary
              gameName={game.name}
              userId={userId}
              zoneId={game.zone ? zoneId : null}
              nickname={nickname?.status === "found" ? nickname.nickname : null}
              productLabel={product ? shortLabel(product.label, game.name) : null}
              price={product?.price ?? null}
            />
            <div className="perforation mx-0 px-5 pb-5 pt-5">
              {submitError ? <p className="mb-3 text-sm text-danger" role="alert">{submitError}</p> : null}
              <Button type="submit" size="lg" className="w-full" loading={submitting}>
                {!submitting ? <QrCode size={20} aria-hidden /> : null}
                Bayar dengan QRIS
              </Button>
              <p className="mt-3 text-xs leading-relaxed text-ink-3">
                Nominal akhir mengikuti tagihan QRIS. Bila gateway menambahkan selisih, angkanya tampil sebelum kamu membayar.
              </p>
            </div>
          </div>
        </aside>

        {/* Mobile checkout bar */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
          {submitError ? <p className="mb-2 text-sm text-danger" role="alert">{submitError}</p> : null}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-ink-3">{product ? shortLabel(product.label, game.name) : "Belum pilih nominal"}</p>
              <p className="font-mono text-lg font-semibold tabular">{product ? idr(product.price) : "Rp -"}</p>
            </div>
            <Button type="submit" size="lg" loading={submitting}>
              {!submitting ? <QrCode size={20} aria-hidden /> : null}
              Bayar QRIS
            </Button>
          </div>
        </div>
      </form>
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

function Summary(props: { gameName: string; userId: string; zoneId: string | null; nickname: string | null; productLabel: string | null; price: number | null }) {
  const rows: [string, string | null][] = [
    ["Game", props.gameName],
    ["Akun", props.userId ? `${props.userId}${props.zoneId ? ` (${props.zoneId})` : ""}` : null],
    ...(props.nickname ? ([["Nama", props.nickname]] as [string, string][]) : []),
    ["Nominal", props.productLabel],
  ];
  return (
    <div className="p-5">
      <p className="text-sm font-semibold">Ringkasan</p>
      <dl className="mt-4 grid gap-2.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-ink-3">{k}</dt>
            <dd className={`min-w-0 truncate text-right ${v ? "text-ink" : "text-ink-3"} ${k === "Akun" ? "font-mono tabular" : ""}`}>{v ?? "-"}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex items-baseline justify-between gap-4">
        <span className="text-sm text-ink-2">Harga</span>
        <span className="font-mono text-2xl font-semibold tracking-tight tabular">{props.price !== null ? idr(props.price) : "-"}</span>
      </div>
    </div>
  );
}

function GameSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6" aria-busy aria-label="Memuat">
      <Skeleton className="h-5 w-28" />
      <div className="mt-4 flex items-center gap-4">
        <Skeleton className="size-16" />
        <div className="grid gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-8">
          <Skeleton className="h-52 w-full rounded-card" />
          <Skeleton className="h-64 w-full rounded-card" />
        </div>
        <Skeleton className="hidden h-80 rounded-ticket lg:block" />
      </div>
    </div>
  );
}
