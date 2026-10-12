const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const dateTime = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** "Rp 23.100" with a non-breaking space so the amount never wraps. */
export function idr(amount: number): string {
  return rupiah.format(amount).replace(/\s/g, " ");
}

export function wibTime(iso: string): string {
  return `${time.format(new Date(iso))} WIB`;
}

export function wibDateTime(iso: string): string {
  return `${dateTime.format(new Date(iso))} WIB`;
}

export function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "Mobile Legends 86 Diamonds" -> "86 Diamonds" on the game's own page. */
export function shortLabel(label: string, gameName: string): string {
  const stripped = label.replace(new RegExp(`^${gameName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "").trim();
  return stripped || label;
}
