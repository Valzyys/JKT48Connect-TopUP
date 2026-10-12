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

export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

const relative = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

/** "2 menit yang lalu", "kemarin". */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "baru saja";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86400), "day");
}
