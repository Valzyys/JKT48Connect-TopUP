import { ArrowsClockwise, X } from "@phosphor-icons/react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Field, Input, Notice } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { idr, wibDateTime } from "../lib/format";

interface AdminOrder {
  ref: string;
  game: string;
  product: string;
  dest: string;
  price: number;
  cost: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  customerStatus: string;
  needsReview: boolean;
  reviewReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AdminDetail {
  order: Record<string, unknown>;
  payments: Record<string, unknown>[];
  fulfillments: Record<string, unknown>[];
  events: { type: string; detail: unknown; created_at: string }[];
}

const FILTERS = [
  { id: "attention", label: "Perlu tindakan" },
  { id: "active", label: "Berjalan" },
  { id: "all", label: "Semua" },
] as const;

function readToken(): string {
  try {
    return sessionStorage.getItem("jc.admin") ?? "";
  } catch {
    return "";
  }
}

/** Operator console for reconciliation. Dense by design: scanned, not browsed. */
export function Admin() {
  const [token, setToken] = useState(readToken);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("attention");
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.admin<{ orders: AdminOrder[] }>(`/orders?filter=${filter}`, token);
      setOrders(res.orders);
      setError(null);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        setToken("");
        try {
          sessionStorage.removeItem("jc.admin");
        } catch {
          // ignore
        }
      }
      setError(err instanceof ApiRequestError ? err.message : "Gagal memuat.");
    }
  }, [token, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(ref: string) {
    try {
      setDetail(await api.admin<AdminDetail>(`/orders/${ref}`, token));
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Gagal memuat detail.");
    }
  }

  async function action(ref: string, path: string, body?: unknown, label = "Selesai") {
    setBusy(path);
    try {
      await api.admin(`/orders/${ref}/${path}`, token, { method: "POST", body: body ?? {} });
      toast.success(label);
      await Promise.all([load(), open(ref)]);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Aksi gagal.");
    } finally {
      setBusy(null);
    }
  }

  async function syncCatalog() {
    setBusy("sync");
    try {
      const res = await api.admin<{ ok: boolean; itemCount: number; error: string | null }>("/catalog/sync", token, { method: "POST" });
      if (res.ok) toast.success(`Katalog disinkronkan, ${res.itemCount} produk`);
      else toast.error(`Sinkronisasi gagal: ${res.error ?? "tidak diketahui"}`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Sinkronisasi gagal.");
    } finally {
      setBusy(null);
    }
  }

  if (!token) {
    const login = (e: FormEvent) => {
      e.preventDefault();
      try {
        sessionStorage.setItem("jc.admin", draft);
      } catch {
        // ignore
      }
      setToken(draft);
    };
    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <form onSubmit={login} className="mt-6 grid gap-4">
          <Field label="Admin token" htmlFor="admin-token" error={error ?? undefined}>
            <Input id="admin-token" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="current-password" />
          </Field>
          <Button type="submit">Masuk</Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 text-sm sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Rekonsiliasi pesanan</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Filter" className="flex rounded-button border border-line bg-surface p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-[8px] px-3 py-1.5 ${filter === f.id ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <ArrowsClockwise size={16} aria-hidden />
            Muat ulang
          </Button>
          <Button size="sm" variant="secondary" onClick={syncCatalog} loading={busy === "sync"}>
            Sinkron katalog
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4"><Notice tone="danger">{error}</Notice></div> : null}

      <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <caption className="sr-only">Daftar pesanan</caption>
          <thead className="border-b border-line text-xs text-ink-3">
            <tr>
              {["Pesanan", "Produk", "Tujuan", "Harga / modal", "Pembayaran", "Fulfillment", "Review", "Diubah"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders === null ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-ink-3">Memuat...</td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-ink-3">Tidak ada pesanan di filter ini.</td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.ref} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => void open(o.ref)}>
                  <td className="px-3 py-2 font-mono tabular">
                    <button type="button" className="underline-offset-2 hover:underline" onClick={(e) => (e.stopPropagation(), void open(o.ref))}>
                      {o.ref}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono tabular">{o.product}</span> <span className="text-ink-3">{o.game}</span>
                  </td>
                  <td className="px-3 py-2 font-mono tabular">{o.dest}</td>
                  <td className="px-3 py-2 text-right font-mono tabular">
                    {idr(o.price)} <span className="text-ink-3">/ {idr(o.cost)}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{o.paymentStatus}</td>
                  <td className="px-3 py-2 font-mono text-xs">{o.fulfillmentStatus}</td>
                  <td className="px-3 py-2 text-xs">{o.needsReview ? <span className="text-danger">{o.reviewReason ?? "ya"}</span> : <span className="text-ink-3">-</span>}</td>
                  <td className="px-3 py-2 text-ink-3 tabular">{wibDateTime(o.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detail ? <DetailPanel detail={detail} busy={busy} onClose={() => setDetail(null)} onAction={action} /> : null}
    </div>
  );
}

function DetailPanel({
  detail,
  busy,
  onClose,
  onAction,
}: {
  detail: AdminDetail;
  busy: string | null;
  onClose: () => void;
  onAction: (ref: string, path: string, body?: unknown, label?: string) => Promise<void>;
}) {
  const ref = String(detail.order.public_ref);
  const [note, setNote] = useState("");
  const [retryConfirm, setRetryConfirm] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="detail-title" className="fixed inset-0 z-40 flex justify-end bg-[oklch(0.15_0.01_275/0.4)]" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-line bg-bg p-5 shadow-raised" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="detail-title" className="font-mono text-base font-semibold tabular">{ref}</h2>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-button hover:bg-surface-2" aria-label="Tutup">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={busy === "reconcile"} onClick={() => void onAction(ref, "reconcile", undefined, "Rekonsiliasi dijalankan")}>
            Cek ulang provider
          </Button>
        </div>

        <Json title="Order" value={detail.order} />
        <Json title="Pembayaran (MYPG)" value={detail.payments} />
        <Json title="Fulfillment (H2H)" value={detail.fulfillments} />

        <section className="mt-5">
          <h3 className="font-semibold">Riwayat</h3>
          <ol className="mt-2 grid gap-1.5">
            {detail.events.map((e, i) => (
              <li key={i} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 border-b border-line pb-1.5">
                <span className="text-ink-3 tabular">{wibDateTime(e.created_at)}</span>
                <span className="min-w-0">
                  <span className="font-mono text-xs">{e.type}</span>
                  {e.detail ? <pre className="mt-0.5 whitespace-pre-wrap font-mono text-xs text-ink-2 [overflow-wrap:anywhere]">{JSON.stringify(e.detail)}</pre> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-6 grid gap-3 rounded-card border border-line bg-surface p-4">
          <h3 className="font-semibold">Tandai selesai ditangani</h3>
          <Field label="Catatan penanganan" hint="Contoh: refund manual via transfer, bukti di tiket #123." htmlFor="resolve-note">
            <Input id="resolve-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button size="sm" variant="secondary" className="justify-self-start" disabled={!note.trim()} loading={busy === "resolve"} onClick={() => void onAction(ref, "resolve", { note }, "Ditandai selesai")}>
            Tandai selesai
          </Button>
        </section>

        {detail.order.fulfillment_status === "FAILED" ? (
          <section className="mt-4 grid gap-3 rounded-card border border-danger/40 bg-danger-soft p-4">
            <h3 className="font-semibold text-danger">Kirim ulang top-up</h3>
            <p className="text-ink-2">
              Membuat percobaan baru dengan refID baru ke H2H. Pastikan percobaan sebelumnya benar-benar gagal di sisi provider, karena pengiriman ulang bisa menagih saldo dua kali.
            </p>
            <Field label='Ketik RETRY untuk konfirmasi' htmlFor="retry-confirm">
              <Input id="retry-confirm" value={retryConfirm} onChange={(e) => setRetryConfirm(e.target.value)} mono />
            </Field>
            <Button
              size="sm"
              variant="danger"
              className="justify-self-start"
              disabled={retryConfirm !== "RETRY"}
              loading={busy === "retry-fulfillment"}
              onClick={() => void onAction(ref, "retry-fulfillment", { confirm: "RETRY" }, "Percobaan baru dikirim")}
            >
              Kirim ulang top-up
            </Button>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Json({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="mt-5">
      <h3 className="font-semibold">{title}</h3>
      <pre className="mt-2 max-h-72 overflow-auto rounded-control border border-line bg-surface p-3 font-mono text-xs leading-relaxed text-ink-2">{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}
