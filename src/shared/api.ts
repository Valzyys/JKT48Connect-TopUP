/** Public API contracts shared by the Worker and the storefront. */

export interface CatalogMeta {
  syncedAt: string | null; // last successful synchronisation
  stale: boolean; // latest attempt failed or the data is older than the TTL
  available: boolean; // at least one successful synchronisation exists
}

export interface GameSummary {
  slug: string;
  name: string;
  publisher: string;
  currency: string;
  tagline: string;
  image: string | null;
  productCount: number;
  /** Completed top-ups in the last 30 days, used to rank "Paling laris". */
  recentOrders: number;
  startingPrice: number | null;
  nicknameCheck: boolean;
  /** Denominations sorted by selling price, unavailable ones included. */
  products: ProductOffer[];
}

export interface GamesResponse {
  catalog: CatalogMeta;
  games: GameSummary[];
}

/** Recently completed top-ups, without any account identifiers. */
export interface ActivityItem {
  game: string;
  gameSlug: string;
  product: string;
  completedAt: string;
}

export interface ActivityResponse {
  items: ActivityItem[];
}

export interface ProductOffer {
  code: string;
  label: string;
  price: number; // storefront selling price, IDR
  available: boolean;
}

export interface GameDetailResponse {
  catalog: CatalogMeta;
  game: GameSummary & {
    userId: { label: string; hint: string; pattern: string; inputMode: "numeric" | "text"; maxLength: number };
    zone: { label: string; hint: string; pattern: string; inputMode: "numeric" | "text"; maxLength: number } | null;
  };
  products: ProductOffer[];
}

export type NicknameResult =
  | { status: "found"; nickname: string | null; server: string | null }
  | { status: "not_found"; message: string }
  | { status: "unavailable"; message: string };

/** Customer-facing status. Payment and fulfillment stay separate underneath. */
export type CustomerStatus =
  | "CREATING_PAYMENT"
  | "PAYMENT_ERROR"
  | "WAITING_PAYMENT"
  | "VERIFYING_PAYMENT"
  | "PAID"
  | "PROCESSING"
  | "VERIFYING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLING"
  | "CANCELLED"
  | "EXPIRED";

export interface OrderPaymentView {
  requestedAmount: number;
  invoiceAmount: number | null;
  adjustment: number | null; // invoiceAmount - requestedAmount, set by the gateway
  qrImage: string | null;
  paymentUrl: string | null;
  expiresAt: string | null; // ISO, derived from the gateway's expired_at
  expiredAtRaw: string | null;
  paidAtRaw: string | null;
}

export interface OrderView {
  ref: string;
  status: CustomerStatus;
  message: string;
  terminal: boolean;
  game: { slug: string; name: string };
  product: { code: string; label: string };
  account: { userId: string; zoneId: string | null; nickname: string | null };
  price: number;
  payment: OrderPaymentView | null;
  fulfillment: { sn: string | null; completedAt: string | null } | null;
  canCancel: boolean;
  canRetryPayment: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Reduced view for lookups that prove only the reference and the game ID. */
export interface OrderLookupView {
  ref: string;
  status: CustomerStatus;
  message: string;
  game: { slug: string; name: string };
  product: { label: string };
  account: { userIdMasked: string };
  price: number;
  createdAt: string;
}

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}
