import { ArrowSquareOut, Check, CheckCircle, Clock, Copy, Hourglass, LinkSimple, Warning, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { toast } from "sonner";
import type { CustomerStatus, OrderView } from "../../shared/api";
import { Button, Notice, Skeleton } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { countdown, idr, wibDateTime, wibTime } from "../lib/format";
import { readKeyFromHash, saveOrder, tokenFor } from "../lib/storage";

const STAGES = ["Pembayaran", "Diproses", "Selesai"] as const;

function stageOf(status: CustomerStatus): { index: number; failed: boolean } {
  switch (status) {
    case "SUCCESS":
      return { index: 3, failed: false };
    case "PROCESSING":
    case "VERIFYING":
    case "PAID":
      return { index: 1, failed: false };
    case "FAILED":
      return { index: 1, failed: true };
    case "CANCELLED":
    case "EXPIRED":
    case "PAYMENT_ERROR":
      return { index: 0, failed: true };
    default:
      return { index: 0, failed: false };
  }
}

function tone(status: CustomerStatus): { cls: string; Icon: typeof Check } {
  switch (status) {
    case "SUCCESS":
      return { cls: "bg-success-soft text-success", Icon: CheckCircle };
    case "FAILED":
    case "PAYMENT_ERROR":
      return { cls: "bg-danger-soft text-danger", Icon: Warning };
    case "CANCELLED":
    case "EXPIRED":
      return { cls: "bg-surface-2 text-ink-2", Icon: XCircle };
    case "WAITING_PAYMENT":
    case "CREATING_PAYMENT":
      return { cls: "bg-accent-soft text-accent", Icon: Clock };
    default:
      return { cls: "bg-warning-soft text-warning", Icon: Hourglass };
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
        <Link to="/cek" className="press mt-4 inline-flex h-11 items-center rounded-button border border-line-strong bg-surface px-4 font-medium hover:bg-surface-2">
          Cari pesanan
        </Link>
      </Shell>
    );
  }

  if (!order) {
    return (
      <Shell>
        {error ? (
          <Notice tone="danger" title="Status belum bisa dimuat" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Coba lagi</Button>}>
            {error.message}
          </Notice>
        ) : (
          <div className="rounded-ticket border border-line bg-surface p-6" aria-busy aria-label="Memuat pesanan">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-6 h-2 w-full" />
            <Skeleton className="mx-auto mt-8 size-56" />
            <Skeleton className="mt-6 h-5 w-full" />
          </div>
        )}
      </Shell>
    );
  }

  const { cls, Icon } = tone(order.status);
  const stage = stageOf(order.status);
  const pay = order.payment;

  return (
    <Shell>
      <article className="rise overflow-hidden rounded-ticket border border-line bg-surface shadow-raised">
        <header className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-ink-3">Nomor pesanan</p>
              <CopyText value={order.ref} className="mt-0.5 text-lg font-semibold" label="Nomor pesanan disalin" />
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ${cls}`}>
              <Icon size={16} weight="bold" aria-hidden />
              {statusLabel(order.status)}
            </span>
          </div>
          <p className="mt-4 text-[15px] text-ink" aria-live="polite">
            {order.message}
          </p>
          <Progress index={stage.index} failed={stage.failed} />
        </header>

        {order.status === "WAITING_PAYMENT" || order.status === "CANCELLING" ? (
          pay && (pay.qrImage || pay.paymentUrl) ? <PaymentBlock order={order} /> : null
        ) : null}

        {order.status === "SUCCESS" && order.fulfillment ? (
          <section className="perforation px-5 py-5 sm:px-6" aria-label="Bukti top-up">
            <p className="text-sm text-ink-3">Nomor seri (SN)</p>
            {order.fulfillment.sn ? <CopyText value={order.fulfillment.sn} className="mt-1 text-base" label="SN disalin" /> : <p className="mt-1 text-ink-2">Tidak dikirim penyedia.</p>}
            {order.fulfillment.completedAt ? <p className="mt-2 text-sm text-ink-3">Selesai {wibDateTime(order.fulfillment.completedAt)}</p> : null}
          </section>
        ) : null}

        {order.status === "PAYMENT_ERROR" ? (
          <section className="perforation px-5 py-5 sm:px-6">
            <Button onClick={retry} loading={busy === "retry"}>
              Buat QRIS lagi
            </Button>
          </section>
        ) : null}

        <section className="perforation px-5 py-5 sm:px-6" aria-label="Detail pesanan">
          <dl className="grid gap-2.5 text-sm">
            <Row k="Game" v={order.game.name} />
            <Row k="Nominal" v={order.product.label} />
            <Row k="ID akun" v={`${order.account.userId}${order.account.zoneId ? ` (${order.account.zoneId})` : ""}`} mono />
            {order.account.nickname ? <Row k="Nama akun" v={order.account.nickname} /> : null}
            <Row k="Harga" v={idr(order.price)} mono />
            {pay?.adjustment ? <Row k="Penyesuaian gateway" v={`+${idr(pay.adjustment)}`} mono /> : null}
            {pay?.invoiceAmount ? <Row k="Total tagihan" v={idr(pay.invoiceAmount)} mono strong /> : null}
            <Row k="Dibuat" v={wibDateTime(order.createdAt)} />
          </dl>
        </section>
      </article>

      <div className="mt-5 grid gap-3">
        <Notice tone="info" title="Simpan link halaman ini">
          Link berisi kunci akses pesanan. Siapa pun yang memegang link ini bisa melihat statusnya.
          <div className="mt-2">
            <CopyLinkButton href={`${location.pathname}#k=${token}`} />
          </div>
        </Notice>
        {order.canCancel ? (
          confirmCancel ? (
            <div className="rounded-card border border-line bg-surface p-4" role="group" aria-label="Konfirmasi pembatalan">
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
            <Button variant="ghost" className="justify-self-start" onClick={() => setConfirmCancel(true)}>
              Batalkan pesanan
            </Button>
          )
        ) : null}
        {order.status === "SUCCESS" ? (
          <Link to="/" className="text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            Top-up lagi
          </Link>
        ) : null}
      </div>
    </Shell>
  );
}

function statusLabel(s: CustomerStatus): string {
  const map: Record<CustomerStatus, string> = {
    CREATING_PAYMENT: "Menyiapkan",
    PAYMENT_ERROR: "QRIS gagal",
    WAITING_PAYMENT: "Menunggu bayar",
    VERIFYING_PAYMENT: "Diverifikasi",
    PAID: "Dibayar",
    PROCESSING: "Diproses",
    VERIFYING: "Diverifikasi",
    SUCCESS: "Berhasil",
    FAILED: "Gagal",
    CANCELLING: "Membatalkan",
    CANCELLED: "Dibatalkan",
    EXPIRED: "Kedaluwarsa",
  };
  return map[s];
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">{children}</div>;
}

function Row({ k, v, mono, strong }: { k: string; v: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-3">{k}</dt>
      <dd className={`min-w-0 text-right [overflow-wrap:anywhere] ${mono ? "font-mono tabular" : ""} ${strong ? "font-semibold text-ink" : "text-ink"}`}>{v}</dd>
    </div>
  );
}

function Progress({ index, failed }: { index: number; failed: boolean }) {
  return (
    <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="Tahap pesanan">
      {STAGES.map((label, i) => {
        const done = i < index;
        const current = i === index && index < 3;
        const bar = done ? "bg-accent" : current && failed ? "bg-danger" : current ? "bg-accent/40" : "bg-surface-3";
        return (
          <li key={label} className="grid gap-1.5" aria-current={current ? "step" : undefined}>
            <span className={`h-1.5 rounded-full transition-colors duration-300 ${bar}`} />
            <span className={`text-xs ${done || current ? "text-ink" : "text-ink-3"}`}>
              {label}
              <span className="sr-only">{done ? ", selesai" : current ? (failed ? ", terhenti" : ", berlangsung") : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PaymentBlock({ order }: { order: OrderView }) {
  const pay = order.payment!;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = pay.expiresAt ? Date.parse(pay.expiresAt) - now : null;
  const amount = pay.invoiceAmount ?? pay.requestedAmount;
  return (
    <section className="perforation px-5 py-6 sm:px-6" aria-label="Pembayaran QRIS">
      <div className="text-center">
        <p className="text-sm text-ink-2">Bayar tepat</p>
        <p className="mt-1 font-mono text-[2rem] font-semibold leading-none tracking-tight tabular">{idr(amount)}</p>
        {pay.adjustment ? (
          <p className="mt-2 text-sm text-ink-3">
            Termasuk penyesuaian <span className="font-mono tabular">{idr(pay.adjustment)}</span> dari gateway QRIS.
          </p>
        ) : null}
      </div>
      {pay.qrImage ? (
        <div className="mx-auto mt-5 w-fit rounded-card bg-[oklch(0.99_0_0)] p-3 shadow-ambient">
          <img src={pay.qrImage} alt={`Kode QRIS untuk membayar ${idr(amount)}`} width={232} height={232} className="size-[232px] object-contain" referrerPolicy="no-referrer" />
        </div>
      ) : null}
      <div className="mt-5 grid justify-items-center gap-3 text-sm">
        {left !== null ? (
          <p className="flex items-center gap-1.5 text-ink-2">
            <Clock size={16} aria-hidden />
            {left > 0 ? (
              <>
                Bayar sebelum {wibTime(pay.expiresAt!)}, sisa <span className="font-mono tabular text-ink">{countdown(left)}</span>
              </>
            ) : (
              "Batas waktu pembayaran sudah lewat. Status diperbarui otomatis."
            )}
          </p>
        ) : null}
        {pay.paymentUrl ? (
          <a href={pay.paymentUrl} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1.5 rounded-button px-3 py-2 font-medium text-accent hover:bg-accent-soft">
            Buka halaman pembayaran
            <ArrowSquareOut size={16} aria-hidden />
          </a>
        ) : null}
        <p className="max-w-[38ch] text-center text-ink-3">Status berubah otomatis setelah pembayaran terverifikasi. Halaman ini tidak perlu dimuat ulang.</p>
      </div>
    </section>
  );
}

function CopyText({ value, className = "", label }: { value: string; className?: string; label: string }) {
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
      className={`press group inline-flex max-w-full items-center gap-2 rounded-control text-left font-mono tabular text-ink ${className}`}
      aria-label={`Salin ${value}`}
    >
      <span className="[overflow-wrap:anywhere]">{value}</span>
      {copied ? <Check size={16} className="shrink-0 text-success" aria-hidden /> : <Copy size={16} className="shrink-0 text-ink-3 group-hover:text-ink" aria-hidden />}
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
      Salin link pesanan
    </Button>
  );
}
