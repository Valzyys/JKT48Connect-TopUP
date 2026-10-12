import { ArrowCounterClockwise, Warning } from "@phosphor-icons/react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { findGame } from "../../shared/games";
import { type Margin, ROUND_TO_OPTIONS, sellingPrice } from "../../shared/pricing";
import { Button, Field, Input, Notice } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { idr, wibDateTime } from "../lib/format";

interface PricingState {
  margin: Margin;
  source: "admin" | "default";
  updatedAt: string | null;
  defaults: Margin;
  audit: { action: string; detail: Record<string, unknown>; created_at: string }[];
}

interface CatalogProduct {
  kode: string;
  keterangan: string;
  game_slug: string | null;
  product_type: string;
  harga: number | null;
  is_available: number;
  present: number;
  sellPrice: number | null;
  marginPrice: number | null;
  priceSource: "margin" | "override" | "override_below_cost" | null;
  override: number | null;
}

const SOURCE_LABEL = { margin: "Margin", override: "Harga khusus", override_below_cost: "Khusus diabaikan" } as const;

function pct(profit: number, cost: number): string {
  return cost > 0 ? `${((profit / cost) * 100).toFixed(1).replace(".", ",")}%` : "-";
}

/** Operator view: global margin, per-product fixed prices, and what each one earns. */
export function AdminPricing({ token }: { token: string }) {
  const [state, setState] = useState<PricingState | null>(null);
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [draft, setDraft] = useState<{ markupPercent: string; markupFlat: string; roundTo: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [game, setGame] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api.admin<PricingState>("/pricing", token),
        api.admin<{ products: CatalogProduct[] }>("/catalog", token),
      ]);
      setState(p);
      setDraft((d) => d ?? { markupPercent: String(p.margin.markupPercent), markupFlat: String(p.margin.markupFlat), roundTo: p.margin.roundTo });
      setProducts(c.products.filter((x) => x.product_type === "topup" && x.present === 1 && x.harga !== null));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : "Gagal memuat harga.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const draftMargin: Margin | null = draft
    ? { markupPercent: Number(draft.markupPercent.replace(",", ".")), markupFlat: Number(draft.markupFlat), roundTo: draft.roundTo }
    : null;
  const draftValid = !!draftMargin && Number.isFinite(draftMargin.markupPercent) && Number.isFinite(draftMargin.markupFlat);
  const dirty = !!state && !!draftMargin && JSON.stringify(state.margin) !== JSON.stringify(draftMargin);

  const games = useMemo(() => [...new Set((products ?? []).map((p) => p.game_slug).filter((g): g is string => !!g))], [products]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products ?? []).filter((p) => (game === "all" || p.game_slug === game) && (!q || `${p.kode} ${p.keterangan}`.toLowerCase().includes(q)));
  }, [products, game, query]);

  const stats = useMemo(() => {
    const live = (products ?? []).filter((p) => p.is_available === 1 && p.sellPrice !== null);
    const cost = live.reduce((n, p) => n + p.harga!, 0);
    const profit = live.reduce((n, p) => n + (p.sellPrice! - p.harga!), 0);
    return {
      live: live.length,
      avg: cost ? pct(profit, cost) : "-",
      overrides: (products ?? []).filter((p) => p.override !== null).length,
      ignored: (products ?? []).filter((p) => p.priceSource === "override_below_cost").length,
    };
  }, [products]);

  // Three real costs from the catalog to preview the draft margin against.
  const samples = useMemo(() => {
    const costs = [...new Set((products ?? []).map((p) => p.harga!))].sort((a, b) => a - b);
    if (costs.length === 0) return [10_000, 50_000, 200_000];
    return [...new Set([costs[0]!, costs[Math.floor(costs.length / 2)]!, costs[costs.length - 1]!])];
  }, [products]);

  async function saveMargin(e: FormEvent) {
    e.preventDefault();
    if (!draftMargin) return;
    setSaving(true);
    setErrors({});
    try {
      await api.admin("/pricing", token, { method: "PUT", body: draftMargin });
      toast.success("Margin disimpan. Berlaku untuk pesanan baru.");
      await load();
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setErrors(err.fields);
      toast.error(err instanceof ApiRequestError ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Notice tone="danger" title="Harga belum bisa dimuat" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Coba lagi</Button>}>{loadError}</Notice>;
  if (!state || !products || !draft || !draftMargin) return <p className="py-8 text-ink-3">Memuat harga...</p>;

  return (
    <div className="grid gap-8">
      <section aria-labelledby="margin-title" className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <form onSubmit={saveMargin} className="grid content-start gap-4">
          <div>
            <h2 id="margin-title" className="text-base font-semibold">
              Margin global
            </h2>
            <p className="mt-1 text-ink-3">
              {state.source === "admin" && state.updatedAt ? `Diatur admin, ${wibDateTime(state.updatedAt)}.` : "Masih memakai bawaan dari konfigurasi server."} Harga jual =
              modal + persen + tambahan, dibulatkan ke atas.
            </p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <Field label="Persen dari modal" error={errors.markupPercent} htmlFor="m-pct">
              <Input id="m-pct" inputMode="decimal" mono value={draft.markupPercent} invalid={!!errors.markupPercent} onChange={(e) => setDraft({ ...draft, markupPercent: e.target.value })} />
            </Field>
            <Field label="Tambahan tetap (Rp)" error={errors.markupFlat} htmlFor="m-flat">
              <Input id="m-flat" inputMode="numeric" mono value={draft.markupFlat} invalid={!!errors.markupFlat} onChange={(e) => setDraft({ ...draft, markupFlat: e.target.value.replace(/\D/g, "") })} />
            </Field>
          </div>
          <Field label="Bulatkan ke atas ke kelipatan" error={errors.roundTo} htmlFor="m-round">
            <select
              id="m-round"
              value={draft.roundTo}
              onChange={(e) => setDraft({ ...draft, roundTo: Number(e.target.value) })}
              className="h-11 w-full rounded-control border border-line-strong bg-surface px-3 font-mono text-[16px] tabular text-ink focus:outline-none focus-visible:border-accent"
            >
              {ROUND_TO_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r === 1 ? "Tidak dibulatkan" : idr(r)}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={saving} disabled={!dirty || !draftValid}>
              Simpan margin
            </Button>
            {dirty ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ markupPercent: String(state.margin.markupPercent), markupFlat: String(state.margin.markupFlat), roundTo: state.margin.roundTo })}>
                Batal
              </Button>
            ) : null}
          </div>
        </form>

        <div className="grid content-start gap-4">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
            {[
              ["Produk aktif", String(stats.live)],
              ["Rata-rata margin", stats.avg],
              ["Harga khusus", String(stats.overrides)],
              ["Khusus diabaikan", String(stats.ignored)],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface px-4 py-3">
                <dt className="text-xs text-ink-3">{k}</dt>
                <dd className={`mt-1 font-mono text-xl tabular ${k === "Khusus diabaikan" && stats.ignored > 0 ? "text-danger" : "text-ink"}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <table className="w-full border-collapse text-left">
            <caption className="mb-2 text-left text-xs text-ink-3">{dirty ? "Pratinjau margin yang belum disimpan" : "Contoh dengan margin saat ini"}</caption>
            <thead className="text-xs text-ink-3">
              <tr className="border-b border-line">
                <th scope="col" className="py-1.5 font-medium">Modal</th>
                <th scope="col" className="py-1.5 text-right font-medium">Harga jual</th>
                <th scope="col" className="py-1.5 text-right font-medium">Untung</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((cost) => {
                const price = draftValid ? sellingPrice(cost, draftMargin) : null;
                return (
                  <tr key={cost} className="border-b border-line last:border-0">
                    <td className="py-2 font-mono tabular">{idr(cost)}</td>
                    <td className="py-2 text-right font-mono tabular">{price !== null ? idr(price) : "-"}</td>
                    <td className="py-2 text-right font-mono tabular text-ink-2">{price !== null ? `${idr(price - cost)} (${pct(price - cost, cost)})` : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {stats.ignored > 0 ? (
        <Notice tone="warning" title={`${stats.ignored} harga khusus diabaikan`}>
          Modal provider sudah naik di atas harga khusus itu, jadi produk dijual dengan margin global agar tidak rugi. Perbarui atau hapus harga khususnya.
        </Notice>
      ) : null}

      <section aria-labelledby="products-title" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="products-title" className="text-base font-semibold">
            Harga per produk
          </h2>
          <div className="flex flex-wrap gap-2">
            <select value={game} onChange={(e) => setGame(e.target.value)} aria-label="Filter game" className="h-9 rounded-control border border-line-strong bg-surface px-2 text-sm">
              <option value="all">Semua game</option>
              {games.map((g) => (
                <option key={g} value={g}>
                  {findGame(g)?.name ?? g}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kode atau nama"
              aria-label="Cari produk"
              className="h-9 w-56 rounded-control border border-line-strong bg-surface px-3 text-sm placeholder:text-ink-3"
            />
          </div>
        </div>
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[960px] border-collapse text-left">
            <caption className="sr-only">Harga per produk</caption>
            <thead className="border-b border-line text-xs text-ink-3">
              <tr>
                {["Kode", "Nominal", "Modal", "Harga jual", "Untung", "Sumber", "Harga khusus"].map((h, i) => (
                  <th key={h} scope="col" className={`px-3 py-2 font-medium ${i >= 2 && i <= 4 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-ink-3">
                    Tidak ada produk yang cocok.
                  </td>
                </tr>
              ) : (
                rows.map((p) => <ProductRow key={p.kode} product={p} token={token} onSaved={load} />)
              )}
            </tbody>
          </table>
        </div>
      </section>

      {state.audit.length ? (
        <section aria-labelledby="audit-title">
          <h2 id="audit-title" className="text-base font-semibold">
            Riwayat perubahan
          </h2>
          <ol className="mt-2 grid gap-1">
            {state.audit.map((a, i) => (
              <li key={i} className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3 border-b border-line py-1.5">
                <span className="tabular text-ink-3">{wibDateTime(a.created_at)}</span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{describeAudit(a)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function describeAudit(a: { action: string; detail: Record<string, unknown> }): string {
  const d = a.detail;
  if (a.action === "margin") {
    const m = d.after as Margin;
    return `Margin global jadi ${m.markupPercent}% + ${idr(m.markupFlat)}, bulat ${m.roundTo === 1 ? "tidak" : idr(m.roundTo)}`;
  }
  if (a.action === "override_set") return `${String(d.kode)}: harga khusus ${idr(Number(d.after))} (modal ${idr(Number(d.cost))})`;
  if (a.action === "override_removed") return `${String(d.kode)}: harga khusus dihapus`;
  return a.action;
}

function ProductRow({ product: p, token, onSaved }: { product: CatalogProduct; token: string; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(p.override !== null ? String(p.override) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(p.override !== null ? String(p.override) : ""), [p.override]);

  const cost = p.harga!;
  const price = p.sellPrice!;
  const draft = value ? Number(value) : null;
  const changed = (draft ?? null) !== p.override;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (draft === null) await api.admin(`/pricing/overrides/${encodeURIComponent(p.kode)}`, token, { method: "DELETE" });
      else await api.admin(`/pricing/overrides/${encodeURIComponent(p.kode)}`, token, { method: "PUT", body: { sellPrice: draft } });
      toast.success(draft === null ? `${p.kode} kembali ke margin global` : `${p.kode} dijual ${idr(draft)}`);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? (err.fields?.sellPrice ?? err.message) : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className={`border-b border-line last:border-0 ${p.is_available ? "" : "text-ink-3"}`}>
      <td className="px-3 py-2 font-mono text-xs">{p.kode}</td>
      <td className="max-w-[18rem] truncate px-3 py-2" title={p.keterangan}>
        {p.keterangan}
        {p.is_available ? null : <span className="ml-2 text-xs">(nonaktif)</span>}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular">{idr(cost)}</td>
      <td className="px-3 py-2 text-right font-mono font-medium tabular">{idr(price)}</td>
      <td className="px-3 py-2 text-right font-mono tabular text-ink-2">
        {idr(price - cost)} <span className="text-ink-3">{pct(price - cost, cost)}</span>
      </td>
      <td className="px-3 py-2 text-xs">
        <span className={p.priceSource === "override_below_cost" ? "inline-flex items-center gap-1 text-danger" : p.priceSource === "override" ? "text-accent" : "text-ink-3"}>
          {p.priceSource === "override_below_cost" ? <Warning size={14} weight="bold" aria-hidden /> : null}
          {p.priceSource ? SOURCE_LABEL[p.priceSource] : "-"}
        </span>
      </td>
      <td className="px-3 py-1.5">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            inputMode="numeric"
            placeholder={String(p.marginPrice ?? "")}
            aria-label={`Harga khusus ${p.kode}`}
            aria-invalid={error ? true : undefined}
            className={`h-8 w-28 rounded-control border bg-surface px-2 text-right font-mono text-sm tabular placeholder:text-ink-3 ${error ? "border-danger" : "border-line-strong"}`}
          />
          <Button type="submit" size="sm" variant="secondary" className="h-8" disabled={!changed} loading={busy}>
            {draft === null && p.override !== null ? "Hapus" : "Simpan"}
          </Button>
          {p.override !== null && !changed ? (
            <button type="button" onClick={() => setValue("")} className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Kembalikan ${p.kode} ke margin global`}>
              <ArrowCounterClockwise size={15} aria-hidden />
            </button>
          ) : null}
        </form>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </td>
    </tr>
  );
}
