import type { ActivityResponse, ApiError, GamesResponse, NicknameResult, OrderLookupView, OrderView } from "../../shared/api";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown; token?: string; adminToken?: string; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers["X-Order-Token"] = init.token;
  if (init.adminToken) headers.Authorization = `Bearer ${init.adminToken}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiRequestError(0, "network", "Koneksi terputus. Periksa internet lalu coba lagi.");
  }
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const e = (data as ApiError | null)?.error;
    throw new ApiRequestError(res.status, e?.code ?? "http_error", e?.message ?? "Terjadi kendala. Coba lagi sebentar lagi.", e?.fields);
  }
  return data as T;
}

export const api = {
  games: (signal?: AbortSignal) => request<GamesResponse>("/api/games", { signal }),
  activity: (signal?: AbortSignal) => request<ActivityResponse>("/api/activity", { signal }),
  nickname: (body: { game: string; userId: string; zoneId: string | null }) => request<NicknameResult>("/api/nickname-check", { body }),
  createOrder: (body: { game: string; productCode: string; userId: string; zoneId: string | null; clientToken: string }) =>
    request<OrderView>("/api/orders", { body }),
  order: (ref: string, token: string, signal?: AbortSignal) => request<OrderView>(`/api/orders/${encodeURIComponent(ref)}`, { token, signal }),
  retryPayment: (ref: string, token: string) => request<OrderView>(`/api/orders/${encodeURIComponent(ref)}/payment`, { method: "POST", token }),
  cancel: (ref: string, token: string) => request<OrderView>(`/api/orders/${encodeURIComponent(ref)}/cancel`, { method: "POST", token }),
  lookup: (body: { ref: string; userId: string; zoneId: string | null }) => request<OrderLookupView>("/api/orders/lookup", { body }),
  adminLogin: (body: { email: string; password: string }) => request<{ token: string; expiresAt: string }>("/api/admin/login", { body }),
  admin: <T>(path: string, adminToken: string, init: { method?: string; body?: unknown } = {}) => request<T>(`/api/admin${path}`, { ...init, adminToken }),
};
