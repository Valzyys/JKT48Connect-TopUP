# JKT48Connect TopUp

Game top-up storefront with mandatory guest checkout. Customers pick a game and denomination, enter their game ID, pay with QRIS, and track the order without an account.

Runs entirely on Cloudflare Workers: a Hono API, a D1 database, static assets for the React storefront, and a cron trigger for reconciliation.

## Providers

All provider calls are made server-side. Keys and identifiers never reach the browser.

| Provider | Used for | Endpoints | Module |
| --- | --- | --- | --- |
| OkeConnect | Digital product catalog and provider cost | `GET https://www.okeconnect.com/harga/json?id=<id>&produk=digital` | `src/worker/services/okeconnect.ts`, `catalog.ts` |
| JKT48Connect H2H | Top-up, status check, nickname check | `GET https://h2h.jkt48connect.com/trx`, `GET /trx-check` (`product`, `dest`, `refID`) | `src/worker/services/h2h.ts`, `fulfillment.ts`, `nickname.ts` |
| MYPG | QRIS invoice, status, cancellation | `POST https://yobasepay.net/api_my?action=createpayment\|checkstatus\|cancelpayment` (form-encoded) | `src/worker/services/mypg.ts`, `orders.ts` |

## Setup

```bash
npm install
npx wrangler d1 create jkt48connect-topup        # paste the id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put MYPG_API_KEY
npx wrangler secret put OKECONNECT_CATALOG_ID     # the `id` value of the catalog URL
npx wrangler secret put ADMIN_TOKEN               # 32+ random characters, for /admin
npm run deploy
```

Local development: copy `.dev.vars.example` to `.dev.vars`, run `npm run db:migrate:local`, then `npm run dev` (Worker and built storefront on one port) or `npm run dev:client` next to a running `wrangler dev` for hot reload.

Non-secret settings live in `wrangler.jsonc` under `vars`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `TOPUP_H2H_BASE` | `https://h2h.jkt48connect.com` | H2H base URL (HTTPS enforced) |
| `MYPG_BASE` | `https://yobasepay.net/api_my` | MYPG endpoint |
| `OKECONNECT_CATALOG_URL`, `OKECONNECT_CATALOG_PRODUK` | documented URL, `digital` | Catalog endpoint |
| `PRICE_MARKUP_PERCENT`, `PRICE_MARKUP_FLAT`, `PRICE_ROUND_TO` | `5`, `500`, `100` | Selling price = cost x (1 + %) + flat, rounded up |
| `MYPG_MAX_AMOUNT_DELTA` | `1000` | Largest accepted difference between the amount requested and the amount MYPG returns |
| `MYPG_TIME_OFFSET` | `+07:00` | Zone assumed for MYPG `expired_at` / `paid_at` (not documented by MYPG) |
| `MYPG_DEFAULT_TTL_MINUTES` | `30` | Invoice lifetime when `expired_at` is missing |
| `CATALOG_TTL_SECONDS` | `900` | Catalog refresh interval |

## Purchase flow

1. Storefront reads games and denominations from the last successful catalog sync (`GET /api/games`, `/api/games/:slug`). Nickname-check products such as `CEKML` are utilities, never denominations.
2. Optional nickname check (`POST /api/nickname-check`) calls H2H `/trx` with the game's `CEK*` code. Results are cached for 30 minutes and rate limited, because each check has a provider cost. Offered only when the code is active in the catalog.
3. `POST /api/orders` validates the account, prices the product on the server, creates the order, and requests one QRIS invoice. The browser sends a random checkout token: its hash is both the idempotency key and the order's access key, so retries and refreshes never create a second order or invoice.
4. The order page (`/pesanan/<ref>#k=<token>`; the key lives in the URL fragment, which is never sent to servers) shows the QR image and payment URL exactly as MYPG returned them.
5. Payment is verified with MYPG `checkstatus`, triggered by the status page (at most once per 5 s per order) and by the cron. `PAID` counts only when `trx_id` and amount match the stored invoice. Browser redirects are never evidence.
6. The first verified `PAID` transition (a conditional update) starts fulfillment: a refID like `OC-9K3F8-W2P7Q` is persisted, then `/trx` is called once.
7. Pending, timed-out, or unrecognised H2H responses are reconciled through `/trx-check` with the same product, dest, and refID, on a backoff of 30 s up to 30 min. A new top-up is never submitted automatically.
8. Guests can also look up an order with its reference plus game ID (`POST /api/orders/lookup`); that view omits payment details.

### State machines

Payment and fulfillment are separate columns on `orders`.

```
payment:     AWAITING_INVOICE -> INVOICE_CREATING -> UNPAID | INVOICE_FAILED
             UNPAID -> PAID | CANCEL_REQUESTED | REVIEW
             CANCEL_REQUESTED -> CANCELLED | EXPIRED | PAID
fulfillment: NOT_STARTED -> SUBMITTING -> SUCCESS | PROCESSING | FAILED | UNCERTAIN
             PROCESSING | UNCERTAIN -> (trx-check) SUCCESS | PROCESSING | FAILED
```

Customer-facing messages are derived in `src/worker/services/state.ts` ("Menunggu pembayaran QRIS.", "Pembayaran berhasil. Top-up sedang diproses.", "Status top-up sedang diverifikasi.", and so on). "Top-up berhasil." appears only after a parsed H2H success has been recorded.

### Policies and assumptions

- **Invoice amount.** The documented example requests 23000 and receives 23412; MYPG does not document why. The returned amount is stored separately from the order price and shown to the guest as a gateway adjustment. It is accepted only when it is at least the requested amount and at most `MYPG_MAX_AMOUNT_DELTA` above it. Otherwise the invoice is cancelled, never shown, and the order is flagged for review.
- **Undocumented MYPG statuses** (anything but `PAID`/`UNPAID`) leave the order unpaid and flag it for review.
- **Cancellation** is confirmed only by a `status: true` cancelpayment response. The order is checked first and is never cancelled once paid. A payment that arrives after a confirmed cancellation goes to review instead of fulfillment. Expired invoices are cancelled the same way.
- **H2H parsing** is plain text. `SUKSES`, the documented pending wording, and `GAGAL` are recognised. A response about a different product, destination, or refID is treated as unknown. Unknown is never success.
- **`/trx-check` failures** are not documented. A `GAGAL` there is recorded as FAILED and, like every failure, lands in the admin review queue.
- **Provider balance** (`Sisa Saldo`) is redacted before anything is stored and is never returned to guests.
- **Catalog outages** keep the last successful sync and mark it stale. Products missing from a newer sync become unavailable.

## Admin

`/admin` (token from `ADMIN_TOKEN`) lists orders needing attention, shows redacted provider history, re-runs reconciliation, records manual resolutions, and can start a new top-up attempt after a definitive failure. That last action asks the operator to type `RETRY`, because a resubmission can be charged twice.

## Tests

```bash
npm test          # vitest, mocked HTTP only, real migrations on node:sqlite
npm run typecheck
npm run build     # storefront + wrangler dry-run bundle
```

The tests cover:
- catalog, price, and status parsing;
- every documented H2H and MYPG response;
- amount and trx_id mismatches;
- repeated `PAID` responses and duplicate-fulfillment prevention;
- H2H and MYPG timeouts;
- cancellation, expiry, and late payment;
- guest checkout and secure lookup.

No test contacts a real provider.

## Status

The integrations follow the specification in `PROMPT.md` and are verified against mocked responses only. They have not been run against the live providers yet; do that with real credentials and a controlled test purchase before going live.
