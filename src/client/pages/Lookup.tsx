import { ArrowRight, Receipt } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import type { OrderLookupView } from "../../shared/api";
import { Button, Field, Input, Notice, useFieldId } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { idr, wibDateTime } from "../lib/format";
import { orderPath, savedOrders } from "../lib/storage";

export function Lookup() {
  const [orders] = useState(savedOrders);
  const [ref, setRef] = useState("");
  const [userId, setUserId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [result, setResult] = useState<OrderLookupView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const refId = useFieldId("ref");
  const userFieldId = useFieldId("uid");
  const zoneFieldId = useFieldId("zone");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!ref.trim() || !userId.trim()) {
      setError("Isi nomor pesanan dan ID game.");
      return;
    }
    setLoading(true);
    try {
      setResult(await api.lookup({ ref: ref.trim().toUpperCase(), userId: userId.trim(), zoneId: zoneId.trim() || null }));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Pencarian gagal. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-labelledby="lookup-title">
        <h1 id="lookup-title" className="text-xl font-semibold">
          Cek pesanan
        </h1>
        <p className="mt-2 max-w-[44ch] text-ink-2">Masukkan nomor pesanan dan ID game yang dipakai saat membeli.</p>
        <form onSubmit={submit} noValidate className="mt-6 grid gap-4 rounded-[28px] bg-surface p-5 shadow-raised ring-1 ring-line sm:p-6">
          <Field label="Nomor pesanan" hint="Contoh: JC-7K3FQ-W2P7Q9" htmlFor={refId}>
            <Input id={refId} value={ref} onChange={(e) => setRef(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} mono maxLength={20} aria-describedby={`${refId}-hint`} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <Field label="ID game" htmlFor={userFieldId}>
              <Input id={userFieldId} value={userId} onChange={(e) => setUserId(e.target.value.replace(/\s+/g, ""))} inputMode="numeric" autoComplete="off" mono maxLength={32} />
            </Field>
            <Field label="Zone ID" hint="Jika ada" htmlFor={zoneFieldId}>
              <Input id={zoneFieldId} value={zoneId} onChange={(e) => setZoneId(e.target.value.replace(/\s+/g, ""))} inputMode="numeric" autoComplete="off" mono maxLength={16} aria-describedby={`${zoneFieldId}-hint`} />
            </Field>
          </div>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button type="submit" loading={loading} className="justify-self-start">
            Cari pesanan
          </Button>
        </form>

        {result ? (
          <div className="rise mt-5 rounded-[26px] bg-surface p-5 shadow-raised ring-1 ring-line" role="status">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono font-semibold tabular">{result.ref}</p>
              <p className="text-sm text-ink-3">{wibDateTime(result.createdAt)}</p>
            </div>
            <p className="mt-3 text-ink">{result.message}</p>
            <p className="mt-2 text-sm text-ink-2">
              {result.game.name}, {result.product.label}, akun <span className="font-mono tabular">{result.account.userIdMasked}</span>,{" "}
              <span className="font-mono tabular">{idr(result.price)}</span>
            </p>
            <p className="mt-3 text-sm text-ink-3">Detail pembayaran hanya tampil lewat link pesanan yang berisi kunci akses.</p>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="device-title">
        <h2 id="device-title" className="text-[15px] font-semibold lg:mt-[2.6rem]">
          Di perangkat ini
        </h2>
        {orders.length === 0 ? (
          <div className="mt-4 grid justify-items-start gap-3 rounded-[26px] border-2 border-dashed border-line p-6">
            <Receipt size={28} className="text-ink-3" aria-hidden />
            <p className="text-ink-2">Pesanan yang kamu buat dari browser ini akan muncul di sini.</p>
            <Link to="/" className="press inline-flex items-center gap-1.5 rounded-button py-1 font-medium text-accent">
              Mulai top-up
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        ) : (
          <ul className="mt-4 grid gap-2">
            {orders.map((o) => (
              <li key={o.ref}>
                <Link to={orderPath(o.ref, o.token)} className="press flex items-center justify-between gap-4 rounded-[20px] bg-surface px-5 py-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-line transition-shadow hover:shadow-raised">
                  <span className="min-w-0">
                    <span className="block font-mono text-sm font-medium tabular">{o.ref}</span>
                    <span className="block truncate text-sm text-ink-2">
                      {o.game}, {o.product}
                    </span>
                  </span>
                  <ArrowRight size={18} className="shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
