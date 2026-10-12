import { ArrowSquareOut, Check, CheckCircle, Clock, Copy, Hourglass, LinkSimple, Warning, XCircle } from "@phosphor-icons/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { toast } from "sonner";
import type { CustomerStatus, OrderView } from "../../shared/api";
import { Button, Notice, Skeleton } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { countdown, idr, shortLabel, wibDateTime, wibTime } from "../lib/format";
import { BRAND, themeFor, useGameColour } from "../lib/gameTheme";
import { gsap, useGSAP } from "../lib/motion";
import { readKeyFromHash, saveOrder, tokenFor } from "../lib/storage";

const STEPS = ["Bayar", "Diproses", "Selesai"] as const;

/** How far along the order is (0-3), and whether it stopped there. */
function stepOf(status: CustomerStatus): { at: number; stopped: boolean } {
  switch (status) {
    case "SUCCESS":
      return { at: 3, stopped: false };
    case "PAID":
    case "PROCESSING":
    case "VERIFYING":
      return { at: 1, stopped: false };
    case "FAILED":
      return { at: 1, stopped: true };
    case "CANCELLED":
    case "EXPIRED":
    case "PAYMENT_ERROR":
      return { at: 0, stopped: true };
    default:
      return { at: 0, stopped: false };
  }
}

type Kind = "wait" | "work" | "done" | "bad" | "off";

function kindOf(status: CustomerStatus): Kind {
  switch (status) {
    case "SUCCESS":
      return "done";
    case "FAILED":
    case "PAYMENT_ERROR":
      return "bad";
    case "CANCELLED":
    case "EXPIRED":
      return "off";
    case "WAITING_PAYMENT":
    case "CREATING_PAYMENT":
      return "wait";
    default:
      return "work";
  }
}

const MARKS: Record<Kind, { Icon: typeof Check; cls: string }> = {
  wait: { Icon: Clock, cls: "bg-surface-2 text-ink-2" },
  work: { Icon: Hourglass, cls: "bg-warning-soft text-warning" },
  done: { Icon: CheckCircle, cls: "bg-success-soft text-success" },
  bad: { Icon: Warning, cls: "bg-danger-soft text-danger" },
  off: { Icon: XCircle, cls: "bg-surface-2 text-ink-3" },
};

/** One line under the server's status message: what the guest should do now. */
function hintFor(status: CustomerStatus): string | null {
  switch (status) {
    case "WAITING_PAYMENT":
      return "Scan QR di bawah sebelum batas waktu. Status berubah sendiri setelah pembayaran masuk.";
    case "PAID":
    case "PROCESSING":
    case "VERIFYING":
    case "VERIFYING_PAYMENT":
      return "Biasanya selesai dalam beberapa menit. Halaman ini diperbarui sendiri.";
    case "FAILED":
      return "Simpan nomor pesanan ini. Admin akan menindaklanjuti.";
    case "EXPIRED":
      return "QRIS ini tidak bisa dipakai lagi. Buat pesanan baru bila masih ingin top-up.";
    default:
      return null;
  }
}

/** Poll faster while a guest is likely watching a QR code, slower afterwards. */
function pollDelay(order: OrderView, startedAt: number): number | null {
  if (order.terminal) return null;
  if (order.status === "WAITING_PAYMENT") return Date.now() - startedAt < 10 * 60_000 ? 5_000 : 15_000;
  if (order.status === "PAYMENT_ERROR") return null;
  return 8_000;
}

export function Order() {
  const { ref = "" } = useParams();
  const location = useLocation();
  const [token] = useState(() => readKeyFromHash(location.hash) ?? tokenFor(ref));
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [busy, setBusy] = useState<"cancel" | "retry" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const startedAt = useRef(Date.now());
  const prevStatus = useRef<CustomerStatus | null>(null);
  // Set when this page saw the order advance live, so the change is animated.
  const [advanced, setAdvanced] = useState(false);
  useGameColour(order ? themeFor(order.game.slug) : BRAND);

  useEffect(() => {
    if (!order) return;
    const prev = prevStatus.current;
    prevStatus.current = order.status;
    if (!prev || prev === order.status) return;
    if (stepOf(order.status).at > stepOf(prev).at || kindOf(order.status) === "done") {
      setAdvanced(true);
      if (stepOf(prev).at === 0 && stepOf(order.status).at >= 1) toast.success("Pembayaran diterima", { description: "Top-up sedang diproses." });
      if (order.status === "SUCCESS") toast.success("Top-up berhasil", { description: "Item sudah masuk ke akunmu." });
    }
  }, [order?.status]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!token) return;
      try {
        const next = await api.order(ref, token, signal);
        setOrder(next);
        setError(null);
        saveOrder({ ref: next.ref, token, game: next.game.name, product: next.product.label, createdAt: next.createdAt });
      } catch (err) {
        if (err instanceof DOMException) return;
        setError(err instanceof ApiRequestError ? err : new ApiRequestError(0, "unknown", "Status belum bisa dimuat."));
      }
    },
    [ref, token],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Poll while the order is active and the tab is visible.
  useEffect(() => {
    if (!order) return;
    const delay = pollDelay(order, startedAt.current);
    if (delay === null) return;
    let timer = window.setTimeout(tick, delay);
    function tick() {
      if (document.visibilityState === "visible") void load();
      timer = window.setTimeout(tick, delay!);
    }
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [order, load]);

  async function cancel() {
    if (!token) return;
    setBusy("cancel");
    try {
      setOrder(await api.cancel(ref, token));
      setConfirmCancel(false);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Pembatalan belum terkirim.");
    } finally {
      setBusy(null);
    }
  }

  async function retry() {
    if (!token) return;
    setBusy("retry");
    try {
      setOrder(await api.retryPayment(ref, token));
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "QRIS belum berhasil dibuat.");
    } finally {
      setBusy(null);
    }
  }

  if (!token || error?.status === 404) {
    return (
      <Shell>
        <Notice tone="warning" title="Pesanan tidak bisa dibuka di sini">
          Link pesanan berisi kunci akses. Buka link lengkap yang kamu simpan, atau cari dengan nomor pesanan dan ID game.
        </Notice>
        <Link to="/cek" className="press mt-4 inline-flex h-10 items-center rounded-button border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2">
          Cari pesanan
        </Link>
      </Shell>
    );
  }

  if (!order) {
    return (
      <Shell>
        {error ? (
          <Notice
            tone="danger"
            title="Status belum bisa dimuat"
            action={
              <Button size="sm" variant="secondary" onClick={() => void load()}>
                Coba lagi
              </Button>
            }
          >
            {error.message}
          </Notice>
        ) : (
          <div className="grid gap-3" aria-busy aria-label="Memuat pesanan">
            <Skeleton className="h-44 rounded-card" />
            <Skeleton className="h-80 rounded-card" />
          </div>
        )}
      </Shell>
    );
  }

  const pay = order.payment;
  const hint = hintFor(order.status);

  return (
    <Shell>
      <section className="overflow-hidden rounded-[28px] bg-surface shadow-raised ring-1 ring-line">
        <div className="flex items-center justify-between gap-3 bg-[linear-gradient(120deg,var(--game),var(--game-deep))] px-5 py-3.5 text-sm font-bold text-[var(--game-ink)] sm:px-6">
          <span>{order.game.name}</span>
          <span className="truncate font-normal opacity-80">{shortLabel(order.product.label, order.game.name)}</span>
        </div>
        <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-2 text-ink-3">
            Pesanan <CopyText value={order.ref} label="Nomor pesanan disalin" />
          </span>
          <span className="text-ink-3">{wibDateTime(order.createdAt)}</span>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <StatusMark kind={kindOf(order.status)} animate={advanced} />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-snug" aria-live="polite">
              {order.message}
            </h1>
            {hint ? <p className="mt-1 text-sm text-ink-2">{hint}</p> : null}
          </div>
        </div>
        <Steps status={order.status} animate={advanced} />
        </div>
      </section>

      {(order.status === "WAITING_PAYMENT" || order.status === "CANCELLING") && pay && (pay.qrImage || pay.paymentUrl) ? <PaymentCard order={order} /> : null}

      {order.status === "SUCCESS" && order.fulfillment ? (
        <Card>
          <p className="text-sm text-ink-3">Nomor seri (SN)</p>
          {order.fulfillment.sn ? (
            <div className="mt-1">
              <CopyText value={order.fulfillment.sn} label="SN disalin" />
            </div>
          ) : (
            <p className="mt-1 text-ink-2">Tidak dikirim penyedia.</p>
          )}
          {order.fulfillment.completedAt ? <p className="mt-2 text-sm text-ink-3">Selesai {wibDateTime(order.fulfillment.completedAt)}</p> : null}
        </Card>
      ) : null}

      {order.status === "PAYMENT_ERROR" ? (
        <Card>
          <Button onClick={retry} loading={busy === "retry"}>
            Buat QRIS lagi
          </Button>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-[15px] font-semibold">Detail</h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <Row k="Game" v={order.game.name} />
          <Row k="Nominal" v={order.product.label} />
          <Row k="ID akun" v={`${order.account.userId}${order.account.zoneId ? ` (${order.account.zoneId})` : ""}`} />
          {order.account.nickname ? <Row k="Nama akun" v={order.account.nickname} /> : null}
          <Row k="Harga" v={idr(order.price)} />
          {pay?.adjustment ? <Row k="Biaya gateway" v={`+${idr(pay.adjustment)}`} /> : null}
          {pay?.invoiceAmount ? <Row k="Total tagihan" v={idr(pay.invoiceAmount)} strong /> : null}
        </dl>
      </Card>

      <div className="grid gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
          <CopyLinkButton href={`${location.pathname}#k=${token}`} />
          <span>Simpan link ini. Siapa pun yang memegangnya bisa melihat status pesanan.</span>
        </div>
        {order.canCancel ? (
          confirmCancel ? (
            <div className="rounded-[22px] bg-surface p-5 shadow-raised ring-1 ring-line" role="group" aria-label="Konfirmasi pembatalan">
              <p className="font-medium">Batalkan pesanan ini?</p>
              <p className="mt-1 text-sm text-ink-2">QRIS akan dibatalkan di gateway. Jangan bayar QRIS ini setelah dibatalkan.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="danger" onClick={cancel} loading={busy === "cancel"}>
                  Batalkan pesanan
                </Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                  Kembali
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setConfirmCancel(true)}>
              Batalkan pesanan
            </Button>
          )
        ) : null}
        {order.terminal ? (
          <Link to={`/game/${order.game.slug}`} className="justify-self-start text-sm font-medium text-accent underline-offset-4 hover:underline">
            Top-up {order.game.name} lagi
          </Link>
        ) : null}
      </div>
    </Shell>
  );
}

function Shell({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="mx-auto grid w-full max-w-lg gap-3 px-4 py-6 sm:py-10" style={style}>
      {children}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-[26px] bg-surface p-5 shadow-raised ring-1 ring-line sm:p-6">{children}</section>;
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-3">{k}</dt>
      <dd className={`min-w-0 text-right tabular [overflow-wrap:anywhere] ${strong ? "font-semibold text-ink" : "text-ink"}`}>{v}</dd>
    </div>
  );
}

/** Status icon. When the order advances live it springs in, so the change is noticed. */
function StatusMark({ kind, animate }: { kind: Kind; animate: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const { Icon, cls } = MARKS[kind];
  useGSAP(
    () => {
      if (!animate) return;
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(root.current, { scale: 0.4, rotate: -25 }, { scale: 1, rotate: 0, duration: 0.6, ease: "back.out(2.4)" });
      });
    },
    { scope: root, dependencies: [kind, animate] },
  );
  return (
    <span ref={root} className={`grid size-10 shrink-0 place-items-center rounded-full ${cls}`} aria-hidden>
      <Icon size={22} weight="fill" />
    </span>
  );
}

function Steps({ status, animate }: { status: CustomerStatus; animate: boolean }) {
  const root = useRef<HTMLOListElement>(null);
  const { at, stopped } = stepOf(status);
  // The bar under each step fills up to the current one. A live change plays it;
  // a first load or reduced motion shows the result directly.
  useGSAP(
    () => {
      const fills = gsap.utils.toArray<HTMLElement>("[data-fill]");
      fills.forEach((el, i) => {
        const to = i < at ? 1 : i === at && at < 3 ? 0.5 : 0;
        const play = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        gsap.to(el, { scaleX: to, duration: play ? 0.7 : 0, ease: "power2.inOut", delay: play ? i * 0.12 : 0 });
      });
    },
    { scope: root, dependencies: [at, animate] },
  );
  return (
    <ol ref={root} className="mt-5 grid grid-cols-3 gap-1.5" aria-label="Tahap pesanan">
      {STEPS.map((label, i) => {
        const done = i < at;
        const current = i === at && at < 3;
        return (
          <li key={label} className="grid gap-1.5" aria-current={current ? "step" : undefined}>
            <span className="h-2 overflow-hidden rounded-full bg-surface-2">
              {/* Inline transform: GSAP owns this element's transform. */}
              <span data-fill style={{ transform: "scaleX(0)", transformOrigin: "left center" }} className={`block h-full ${current && stopped ? "bg-danger" : done && i === 2 ? "bg-success" : "bg-[var(--game,var(--ink))]"}`} />
            </span>
            <span className={`text-xs ${done || current ? "text-ink" : "text-ink-3"}`}>
              {label}
              <span className="sr-only">{done ? ", selesai" : current ? (stopped ? ", terhenti" : ", berlangsung") : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PaymentCard({ order }: { order: OrderView }) {
  const pay = order.payment!;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = pay.expiresAt ? Date.parse(pay.expiresAt) - now : null;
  const amount = pay.invoiceAmount ?? pay.requestedAmount;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Bayar dengan QRIS</h2>
        {left !== null ? (
          <span className={`text-sm tabular ${left > 0 && left < 120_000 ? "text-danger" : "text-ink-2"}`}>
            {left > 0 ? `Sisa ${countdown(left)}` : "Waktu habis"}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-ink-2">Bayar tepat</p>
      <p className="text-3xl font-semibold tracking-tight tabular">{idr(amount)}</p>
      {pay.adjustment ? <p className="mt-1 text-sm text-ink-3">Termasuk biaya gateway {idr(pay.adjustment)}.</p> : null}
      {pay.qrImage ? (
        <div className="mt-4 grid place-items-center rounded-[22px] bg-white p-5 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]">
          <img src={pay.qrImage} alt={`Kode QRIS untuk membayar ${idr(amount)}`} width={240} height={240} className="size-[240px] object-contain" referrerPolicy="no-referrer" />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        {pay.expiresAt && left !== null && left > 0 ? <span className="text-ink-3">Berlaku sampai {wibTime(pay.expiresAt)}</span> : <span />}
        {pay.paymentUrl ? (
          <a href={pay.paymentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent underline-offset-4 hover:underline">
            Buka halaman pembayaran
            <ArrowSquareOut size={15} aria-hidden />
          </a>
        ) : null}
      </div>
    </Card>
  );
}

function CopyText({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(label);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Tidak bisa menyalin. Salin manual.");
        }
      }}
      className="press group inline-flex max-w-full items-center gap-1.5 rounded-control text-left font-mono font-medium text-ink"
      aria-label={`Salin ${value}`}
    >
      <span className="[overflow-wrap:anywhere]">{value}</span>
      {copied ? <Check size={15} className="shrink-0 text-success" aria-hidden /> : <Copy size={15} className="shrink-0 text-ink-3 group-hover:text-ink" aria-hidden />}
    </button>
  );
}

function CopyLinkButton({ href }: { href: string }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
          toast.success("Link pesanan disalin");
        } catch {
          toast.error("Tidak bisa menyalin. Salin dari address bar.");
        }
      }}
    >
      <LinkSimple size={16} aria-hidden />
      Salin link
    </Button>
  );
}
