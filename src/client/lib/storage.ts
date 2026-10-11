/**
 * Browser storage is a convenience only: it remembers orders placed on this
 * device. Every read and write tolerates storage being unavailable.
 */

export interface SavedOrder {
  ref: string;
  token: string;
  game: string;
  product: string;
  createdAt: string;
}

const ORDERS_KEY = "jc.orders";

export function savedOrders(): SavedOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    const list = raw ? (JSON.parse(raw) as SavedOrder[]) : [];
    return Array.isArray(list) ? list.filter((o) => typeof o?.ref === "string" && typeof o?.token === "string") : [];
  } catch {
    return [];
  }
}

export function saveOrder(order: SavedOrder): void {
  try {
    const rest = savedOrders().filter((o) => o.ref !== order.ref);
    localStorage.setItem(ORDERS_KEY, JSON.stringify([order, ...rest].slice(0, 20)));
  } catch {
    // Private mode or blocked storage: the order link still works.
  }
}

export function tokenFor(ref: string): string | null {
  return savedOrders().find((o) => o.ref === ref)?.token ?? null;
}

/** 32 random bytes, base64url. Doubles as the order's access key and idempotency key. */
export function newClientToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The access key travels in the URL fragment, which browsers never send to servers. */
export function orderPath(ref: string, token: string): string {
  return `/pesanan/${ref}#k=${token}`;
}

export function readKeyFromHash(hash: string): string | null {
  const m = /[#&]k=([A-Za-z0-9_-]{32,128})/.exec(hash);
  return m?.[1] ?? null;
}
