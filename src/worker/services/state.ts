import type { CustomerStatus, OrderLookupView, OrderView } from "../../shared/api";
import { findGame } from "../../shared/games";
import type { FulfillmentRow, OrderRow, PaymentRow } from "../db";

/**
 * TransactionStateService: maps the separate payment and fulfillment state
 * machines onto one customer-facing status. A top-up is only reported as
 * successful after H2H success has been parsed and recorded.
 */

const MESSAGES: Record<CustomerStatus, string> = {
  CREATING_PAYMENT: "Menyiapkan pembayaran QRIS.",
  PAYMENT_ERROR: "QRIS belum berhasil dibuat. Silakan coba lagi.",
  WAITING_PAYMENT: "Menunggu pembayaran QRIS.",
  VERIFYING_PAYMENT: "Pembayaran sedang diverifikasi.",
  PAID: "Pembayaran berhasil dikonfirmasi.",
  PROCESSING: "Pembayaran berhasil. Top-up sedang diproses.",
  VERIFYING: "Status top-up sedang diverifikasi.",
  SUCCESS: "Top-up berhasil.",
  FAILED: "Top-up gagal diproses. Transaksi sedang ditangani sesuai prosedur.",
  CANCELLING: "Pembatalan sedang diproses.",
  CANCELLED: "Pesanan dibatalkan.",
  EXPIRED: "Pembayaran kedaluwarsa.",
};

export function customerStatus(order: Pick<OrderRow, "payment_status" | "fulfillment_status">): CustomerStatus {
  switch (order.fulfillment_status) {
    case "SUCCESS":
      return "SUCCESS";
    case "FAILED":
      return "FAILED";
    case "UNCERTAIN":
      return "VERIFYING";
    case "SUBMITTING":
    case "PROCESSING":
      return "PROCESSING";
    case "NOT_STARTED":
      break;
  }
  switch (order.payment_status) {
    case "PAID":
      return "PAID";
    case "UNPAID":
      return "WAITING_PAYMENT";
    case "REVIEW":
      return "VERIFYING_PAYMENT";
    case "CANCEL_REQUESTED":
      return "CANCELLING";
    case "CANCELLED":
      return "CANCELLED";
    case "EXPIRED":
      return "EXPIRED";
    case "INVOICE_FAILED":
      return "PAYMENT_ERROR";
    case "AWAITING_INVOICE":
    case "INVOICE_CREATING":
      return "CREATING_PAYMENT";
  }
}

const TERMINAL: ReadonlySet<CustomerStatus> = new Set(["SUCCESS", "CANCELLED", "EXPIRED"]);

export function statusMessage(status: CustomerStatus): string {
  return MESSAGES[status];
}

export function toOrderView(order: OrderRow, payment: PaymentRow | null, fulfillment: FulfillmentRow | null): OrderView {
  const status = customerStatus(order);
  const game = findGame(order.game_slug);
  const showInvoice = payment !== null && payment.mypg_trx_id !== null && (payment.status === "UNPAID" || payment.status === "CANCEL_REQUESTED");
  return {
    ref: order.public_ref,
    status,
    message: MESSAGES[status],
    terminal: TERMINAL.has(status),
    game: { slug: order.game_slug, name: game?.name ?? order.game_slug },
    product: { code: order.product_code, label: order.product_label },
    account: { userId: order.user_id, zoneId: order.zone_id, nickname: order.nickname },
    price: order.sell_price,
    payment:
      payment && payment.mypg_trx_id
        ? {
            requestedAmount: payment.requested_amount,
            invoiceAmount: payment.invoice_amount,
            adjustment: payment.invoice_amount !== null ? payment.invoice_amount - payment.requested_amount : null,
            // The QR and link are only useful while the invoice is payable.
            qrImage: showInvoice ? payment.qr_image : null,
            paymentUrl: showInvoice ? payment.payment_url : null,
            expiresAt: payment.expires_at,
            expiredAtRaw: payment.expired_at_raw,
            paidAtRaw: payment.paid_at_raw,
          }
        : null,
    fulfillment:
      fulfillment && fulfillment.status === "SUCCESS" ? { sn: fulfillment.sn, completedAt: fulfillment.completed_at } : null,
    canCancel: order.payment_status === "UNPAID" && order.fulfillment_status === "NOT_STARTED",
    canRetryPayment: order.payment_status === "INVOICE_FAILED",
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

export function maskId(value: string): string {
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;
}

export function toLookupView(order: OrderRow): OrderLookupView {
  const status = customerStatus(order);
  const game = findGame(order.game_slug);
  return {
    ref: order.public_ref,
    status,
    message: MESSAGES[status],
    game: { slug: order.game_slug, name: game?.name ?? order.game_slug },
    product: { label: order.product_label },
    account: { userIdMasked: maskId(order.user_id) },
    price: order.sell_price,
    createdAt: order.created_at,
  };
}
