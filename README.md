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
# D1 database already created; its id is in wrangler.jsonc (database_name jkt48connect-topup)
npm run db:migrate:remote
npx wrangler secret put MYPG_API_KEY
npx wrangler secret put OKECONNECT_CATALOG_ID     # the `id` value of the catalog URL
npx wrangler secret put ADMIN_TOKEN               # 32+ random characters; signs admin sessions
npx wrangler secret put ADMIN_EMAIL               # the admin's login email
npm run admin:hash                                # type the admin password, copy the printed hash
npx wrangler secret put ADMIN_PASSWORD_HASH       # paste that hash (never the password itself)
npm run deploy
```

Local development: copy `.dev.vars.example` to `.dev.vars`, run `npm run db:migrate:local`, then `npm run dev` (Worker and built storefront on one port) or `npm run dev:client` next to a running `wrangler dev` for hot reload.

Non-secret settings live in `wrangler.jsonc` under `vars`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `TOPUP_H2H_BASE` | `https://h2h.jkt48connect.com` | H2H base URL (HTTPS enforced) |
| `MYPG_BASE` | `https://yobasepay.net/api_my` | MYPG endpoint |
| `OKECONNECT_CATALOG_URL`, `OKECONNECT_CATALOG_PRODUK` | documented URL, `digital` | Catalog endpoint |
| `PRICE_MARKUP_PERCENT`, `PRICE_MARKUP_FLAT`, `PRICE_ROUND_TO` | `5`, `500`, `100` | Default margin until an admin sets one in `/admin` |
| `MYPG_MAX_AMOUNT_DELTA` | `1000` | Largest accepted difference between the amount requested and the amount MYPG returns |
| `MYPG_TIME_OFFSET` | `+07:00` | Zone assumed for MYPG `expired_at` / `paid_at` (not documented by MYPG) |
| `MYPG_DEFAULT_TTL_MINUTES` | `30` | Invoice lifetime when `expired_at` is missing |
| `CATALOG_TTL_SECONDS` | `900` | Catalog refresh interval |

## Purchase flow

### Games

These 16 games are sold, mapped from the live catalog's `produk` names in `src/shared/games.ts`: Mobile Legends, Free Fire (diamonds and memberships), PUBG Mobile, PUBG Mobile Global, Magic Chess: Go Go, Honor of Kings, Call of Duty Mobile, Delta Force, Arena Breakout, Blood Strike, Arena of Valor, Lokapala, Speed Drifter, Werewolf, Point Blank (Zepetto) and ZEPETO.

Some catalog products are kept for admins but never sold:
- voucher codes (Google Play, Steam, Unipin, Razer Gold, Garena Shell, Gemscool, Roblox, PUBG and Point Blank vouchers);
- e-wallet and driver balances;
- streaming;
- LifeAfter, which needs a server name, and whose catalog group also holds a PLN token item;
- PUBG New State.

They stay unsold because the H2H destination format for them is not documented. The ID formats per game come from each game's in-app profile. Confirm them with one small test purchase per game before promoting it.

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

## Storefront design
The look is soft: Plus Jakarta Sans, large radii, diffuse shadows, glass surfaces, and the current game's colour throughout.

- **Categories and checks.**
  - Each game's denominations split into the tabs its own catalog fills: the currency (e.g. Diamonds), Pass & membership, Level Up Pass and Bundle.
  - The account card checks the ID format as the guest types.
  - It offers "Cek nama akun" wherever the provider has a check code. When the provider switches that code off, it is shown as unavailable, and it comes back on its own when the catalog re-enables it.
- **One checkout page.** `/` and `/game/<slug>` show the same screen:
  - a floating glass header;
  - a hero with an animated grainy gradient in the game's colours (React Bits Grainient, WebGL, paused off-screen);
  - poster cards to pick the game;
  - three steps: account, denomination tiles, and a pay card (a floating glass bar on phones);
  - "Cara top-up" and an FAQ.
  
  The catalog loads once, so switching games is instant. `?item=<code>` preselects a denomination.
- **Motion.** All motion is GSAP, and every effect is skipped under `prefers-reduced-motion`.
  - Page-level: Lenis smooth scrolling is driven by the GSAP ticker and synced with ScrollTrigger (`lib/smoothScroll.ts`). The page colour blends when switching games.
  - Hero: the title animates letter by letter (GSAP SplitText), and the poster floats and tilts toward the pointer.
  - Scroll parallax (ScrollTrigger, scrubbed):
    - the hero copy sinks while the gradient swells and the poster rises;
    - the game grid's columns drift against each other;
    - step numbers float;
    - the footer wordmark slides sideways.
  - Checkout and lower sections: cards have a pointer spotlight (SpotlightCard), tiles spark on click (ClickSpark), the pay button is magnetic (Magnet), the total counts up to a new price, and sections reveal on scroll (AnimatedContent).
- **React Bits.** The components live in `src/client/components/bits/`. They are adapted from [React Bits](https://reactbits.dev) by David Haz (MIT + Commons Clause, which allows use inside this app). Each file notes what changed.
- **Order page.** It shows the status, a three-step progress bar, the QRIS with a countdown, the SN when done, and the details. When the page sees the payment confirmed or the top-up finish live, the status icon springs in and a toast appears.
- **Errors.** A render error shows a message and a reload button under the normal header instead of a blank page. The error boundary resets on every page change, and a stale JS chunk after a redeploy triggers one automatic reload.
- **Posters.** By default each game's 3:4 poster (`components/Poster.tsx`) is drawn from its colour, monogram and currency icon. To use licensed key art, put the file in `public/posters/` and set `image` in `src/shared/games.ts`.

## Pricing

Admins set prices from `/admin` → **Harga & margin**:
- **Global margin:** selling price = cost × (1 + %) + flat, rounded up to 1, 50, 100, 500 or 1000. It is stored in D1. Until an admin saves one, the `PRICE_*` vars in `wrangler.jsonc` apply.
- **Fixed price per product:** it can never be saved below the current provider cost. If the cost later rises above it, it is ignored and the global margin applies, so nothing is sold at a loss. The admin view flags such products.
- **Scope of changes:** every change is written to an audit trail. New orders use the new price; existing orders keep the price they were created with.

## Admin
`/admin` signs in with an email and password.
- **Secrets:** the email is `ADMIN_EMAIL`. The password is stored only as a PBKDF2-SHA256 hash in `ADMIN_PASSWORD_HASH` (100k iterations, made with `npm run admin:hash`). It never appears in code, config or git.
- **Sessions:** a successful sign-in returns a 12-hour session signed with `ADMIN_TOKEN`. `ADMIN_TOKEN` itself also still works as a bearer token for scripts.
- **Brute-force protection:** sign-in is limited to 5 attempts per client and 10 per email every 15 minutes. A wrong email and a wrong password get the same answer.
- **Password strength:** use a long password. Short words or names are easy to guess.

The console:
- lists orders needing attention;
- shows redacted provider history;
- re-runs reconciliation and records manual resolutions;
- manages prices and margins;
- can start a new top-up attempt after a definitive failure. The operator must type `RETRY` first, because a resubmission can be charged twice.

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
