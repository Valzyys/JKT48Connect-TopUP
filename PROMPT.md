# Skills yang harus dipakai
design-taste-frontend, design-taste-frontend-v1, gpt-taste, high-end-visual-design,
stitch-design-taste, imagegen-frontend-web, impeccable, animate, ask-sonner, break-ui,
emil-design-eng, find-animation-opportunities, improve-animations, pick-ui-library,
apply-aesthetic, data-dashboard, design-code, performance, ux-writing, ui-craft,
ui-craft-dense-dashboard, ui-ux-pro-max, apple-design, caveman 

Muat semua skill di atas dengan Skill tool sebelum mulai.

# Prompt
# JKT48CONNECT TOPUP
# MANDATORY H2H + OKECONNECT + MYPG QRIS INTEGRATION
# GUEST CHECKOUT
# FULL TRANSACTION LIFECYCLE
# CLOUDFLARE WORKERS COMPATIBLE

IMPORTANT IMPLEMENTATION UPDATE

This section supplements and overrides conflicting provider-integration assumptions in the previous master prompt.

Do not remove, omit, simplify away, or replace any endpoint, parameter, response example, transaction state, or provider capability documented in this specification.

Implement the storefront and backend using the exact provider information below.

The product is JKT48Connect TopUp, a game top-up commerce platform with mandatory guest checkout.

Customers must be able to purchase products without registering or logging in.

The H2H base URL is:

https://h2h.jkt48connect.com

Use this HTTPS base URL for the H2H endpoints described below.

Do not use the example provider-server.net hostname from the original example requests.

============================================================
01. PROVIDER ARCHITECTURE
============================================================

Integrate three distinct external services:

1. OkeConnect:
   Provides the digital product catalog and provider product pricing.

2. JKT48Connect H2H:
   Base URL: https://h2h.jkt48connect.com
   Provides top-up transactions, transaction status checks, and game nickname checks.

3. MYPG:
   Base URL: https://yobasepay.net/api_my
   Provides QRIS payment creation, payment status checks, and payment cancellation.

Keep these integrations separate in the backend.

Suggested conceptual modules:

- OkeConnectCatalogService
- JKT48ConnectH2HService
- MYPGPaymentService
- OrderService
- PricingService
- TransactionStateService

Adapt the module structure to the existing repository and framework.

All external provider calls must be made server-side.

Never expose provider API keys or secret configuration in frontend code, public API responses, client-side environment variables, or browser logs.

Do not invent endpoints or assume undocumented provider capabilities.

============================================================
02. OKECONNECT PRODUCT CATALOG
============================================================

PURPOSE

Retrieve the digital product catalog from OkeConnect.

ENDPOINT:

GET https://www.okeconnect.com/harga/json?id=905ccd028329b0a&produk=digital

HEADERS:

Accept: application/json

EXPECTED RESPONSE FORMAT:

A JSON array containing objects with these fields:

- kode
- keterangan
- produk
- kategori
- harga
- status

EXAMPLE RESPONSE:

[
  {
    "kode": "ML5",
    "keterangan": "Mobile Legends 5 Diamonds",
    "produk": "TPG Diamond Mobile Legends",
    "kategori": "Game",
    "harga": "1420",
    "status": "1"
  },
  {
    "kode": "ML86",
    "keterangan": "Mobile Legends 86 Diamonds",
    "produk": "TPG Diamond Mobile Legends",
    "kategori": "Game",
    "harga": "21500",
    "status": "1"
  },
  {
    "kode": "FF50",
    "keterangan": "Free Fire 50 Diamonds",
    "produk": "TPG Diamond Free Fire",
    "kategori": "Game",
    "harga": "6450",
    "status": "1"
  },
  {
    "kode": "CEKML",
    "keterangan": "Cek Nickname Mobile Legends",
    "produk": "Cek Produk Digital H2H",
    "kategori": "Game",
    "harga": "1",
    "status": "1"
  }
]

IMPLEMENTATION REQUIREMENTS

1. Fetch the catalog from the exact endpoint above.
2. Validate the HTTP response and JSON structure.
3. Parse provider prices safely.
4. Interpret product status according to the documented values.
5. Preserve the original product code, description, provider product name, category, price, and status.
6. Do not assume all products returned by the catalog are purchasable top-up denominations.
7. Recognize nickname-check products such as CEKML as utility products rather than ordinary purchasable denominations.
8. Build a mapping layer between provider product codes and the storefront's game/product records.
9. Support catalog refresh and appropriate caching.
10. Display the latest successfully synchronized catalog while handling temporary provider outages gracefully.
11. Do not silently replace live provider data with fabricated data when synchronization fails.
12. Clearly distinguish provider cost from the final storefront selling price.

Do not change or remove any of the documented response fields.

The example records above are illustrative integration fixtures. Do not assume that they represent the complete live catalog.

The frontend must not directly call the OkeConnect endpoint. Proxy the request through the backend or an appropriate server-side integration layer.

The catalog URL contains an identifier. Keep the integration configurable so the identifier can be managed securely without hardcoding sensitive configuration throughout the codebase.

============================================================
03. JKT48CONNECT H2H BASE URL
============================================================

H2H BASE URL:

https://h2h.jkt48connect.com

Implement the following endpoints:

A. GET /trx
B. GET /trx-check

The exact query parameters and documented response behavior are specified in the following sections.

Use HTTPS.

Construct request URLs using a proper URL builder and URLSearchParams or the equivalent supported by the existing runtime.

Do not concatenate unescaped customer input directly into URLs.

Set suitable timeouts and handle connection failures.

Do not assume every HTTP 200 response represents a successful top-up. The documented H2H responses use plain-text business statuses.

Parse those business statuses explicitly.

============================================================
04. H2H TOP-UP TRANSACTION
============================================================

ENDPOINT:

GET https://h2h.jkt48connect.com/trx

METHOD:

GET

QUERY PARAMETERS:

product:
The provider product code, for example ML86.

dest:
The destination game account identifier.

For games that require a zone or server identifier, combine the required identifier fields into the destination format expected by the provider.

The documented format is a numeric string containing the user ID and zone/server ID when the game requires a zone.

refID:
A unique transaction reference generated by the application.

Example reference:

OC-9K3F8-W2P7Q

EXAMPLE REQUEST:

https://h2h.jkt48connect.com/trx?product=ML86&dest=123456781234&refID=OC-9K3F8-W2P7Q

EXAMPLE SUCCESS RESPONSE:

Transaksi ML86 ke 123456781234 SUKSES. SN: 2610110982341234871. Sisa Saldo Rp 2.450.000

EXAMPLE PENDING RESPONSE:

Transaksi ML86 ke 123456781234 sedang diproses. Mohon tunggu beberapa saat. RefID: OC-9K3F8-W2P7Q

EXAMPLE FAILURE RESPONSE:

Transaksi ML86 ke 123456781234 GAGAL. Nomor tujuan tidak valid atau gangguan server game.

IMPLEMENTATION REQUIREMENTS

1. Use the selected provider product code.
2. Use the validated destination identifier.
3. Generate a unique and persistent refID for each intended fulfillment operation.
4. Persist the refID before submitting the request.
5. Do not generate a new refID simply because an HTTP request times out.
6. Parse the response as text.
7. Recognize documented SUCCESS, pending/processing, and FAILURE responses.
8. Extract the serial number (SN) from successful responses when available.
9. Treat the provider's remaining balance as sensitive operational information.
10. Never expose the provider's remaining balance in a public transaction response.
11. Persist the raw provider response securely for operational diagnosis when appropriate, with suitable redaction and retention.
12. Return a normalized internal status to the storefront.
13. Do not mark a transaction successful based solely on an unrecognized response.
14. Unknown responses must be treated as uncertain and reconciled.
15. Avoid automatically repeating a potentially chargeable request after a timeout.

The examples are plain-text responses, not JSON.

Do not implement a JSON parser for this endpoint unless the actual provider documentation confirms an additional response format.

============================================================
05. H2H TRANSACTION STATUS CHECK
============================================================

ENDPOINT:

GET https://h2h.jkt48connect.com/trx-check

METHOD:

GET

QUERY PARAMETERS:

product:
The same provider product code used for the original transaction.

dest:
The same destination identifier used for the original transaction.

refID:
The exact same refID used when submitting the original /trx request.

EXAMPLE REQUEST:

https://h2h.jkt48connect.com/trx-check?product=ML86&dest=123456781234&refID=OC-9K3F8-W2P7Q

EXAMPLE SUCCESS RESPONSE:

Cek status ML86 ke 123456781234: SUKSES. SN: 2610110982341234871. Sisa Saldo Rp 2.450.000

EXAMPLE PENDING RESPONSE:

Transaksi ML86 ke 123456781234 masih dalam antrean/proses provider.

IMPLEMENTATION REQUIREMENTS

1. Persist the product, destination, and refID used by the original transaction.
2. Use exactly those values for subsequent status checks.
3. Parse the documented plain-text status response.
4. Extract the serial number when present.
5. Keep the transaction pending when the provider reports that it is still queued or processing.
6. Reconcile uncertain transactions through this endpoint where appropriate.
7. Avoid aggressive polling that could overload the provider.
8. Apply bounded retries and backoff for temporary network failures.
9. Never submit a new top-up merely because a status check is pending.
10. Preserve the distinction between pending, successful, failed, and uncertain statuses.

The response examples do not explicitly document every possible failure response from /trx-check.

Handle additional responses conservatively rather than inventing unsupported response formats.

============================================================
06. GAME NICKNAME CHECK
============================================================

ENDPOINT:

GET https://h2h.jkt48connect.com/trx

METHOD:

GET

QUERY PARAMETERS:

product:
The appropriate nickname-check product code.

Documented examples:

- CEKML
- CEKFF
- CEKCODM
- CEKAOV

dest:
The game account identifier, including the server or zone identifier where required.

refID:
A unique reference for the nickname-check operation.

Example:

NK1728648102AB

EXAMPLE REQUEST:

https://h2h.jkt48connect.com/trx?product=CEKML&dest=123456781234&refID=NK1728648102AB

EXAMPLE RESPONSE:

CEKML ke 123456781234 SUKSES. a.n. ZeeJKT48 (Server: 1234). Sisa Saldo Rp 2.449.999

IMPLEMENTATION REQUIREMENTS

1. Provide a nickname-check action for supported games.
2. Map each game to its configured nickname-check product code.
3. Validate the destination format before making the request.
4. Generate a unique refID for each nickname-check operation.
5. Parse the documented plain-text response.
6. Extract the returned account name and server information when available.
7. Present the returned account information clearly to the customer.
8. Never fabricate a successful nickname response.
9. Never assume that every game supports nickname checking.
10. Do not treat the nickname-check request as a top-up purchase.
11. Account for the provider cost of the nickname-check product when designing the flow.
12. Do not expose the provider's remaining balance to the customer.
13. Handle failed and unrecognized responses without displaying misleading account information.

The documented example uses the response prefix SUKSES. Implement a parser that accommodates the documented response format without assuming that every successful response contains exactly the same optional fields.

============================================================
07. MYPG QRIS PAYMENT GATEWAY
============================================================

GATEWAY BASE URL:

https://yobasepay.net/api_my

Use the following documented operations:

A. Create QRIS payment:
   action=createpayment

B. Check QRIS payment status:
   action=checkstatus

C. Cancel QRIS payment:
   action=cancelpayment

All three operations use POST with application/x-www-form-urlencoded.

AUTHENTICATION:

Use the MYPG API key through a server-side environment secret:

MYPG_API_KEY

Never place the actual key in source code, frontend code, client-side configuration, or version control.

If an existing environment secret is already configured, inspect and reuse the established configuration safely.

Do not print the API key in logs or final reports.

============================================================
08. MYPG CREATE QRIS PAYMENT
============================================================

ENDPOINT:

POST https://yobasepay.net/api_my?action=createpayment

METHOD:

POST

HEADERS:

Content-Type: application/x-www-form-urlencoded

FORM BODY:

api_key=<MYPG_API_KEY>
amount=<AMOUNT>

The amount must be the amount actually requested from the MYPG payment gateway according to the configured payment calculation.

EXAMPLE REQUEST BODY STRUCTURE:

api_key=REDACTED&amount=23000

EXAMPLE RESPONSE:

{
  "status": true,
  "message": "Payment created successfully",
  "data": {
    "trx_id": "MY-20261011-88492019",
    "amount": 23412,
    "qr_image": "https://yobasepay.net/qr/MY-20261011-88492019.png",
    "payment_url": "https://yobasepay.net/pay/MY-20261011-88492019",
    "expired_at": "2026-10-11 19:30:00"
  }
}

IMPLEMENTATION REQUIREMENTS

1. Send the documented form-encoded POST request.
2. Validate the HTTP response and JSON structure.
3. Check the top-level status field.
4. Persist the returned MYPG trx_id.
5. Persist the returned amount.
6. Persist qr_image and payment_url when present.
7. Persist expired_at when present.
8. Display the actual payment information returned by MYPG.
9. Never fabricate a QR image or payment URL.
10. Do not assume the returned amount always equals the originally requested amount.
11. Compare the returned amount with the intended order/payment amount.
12. Handle a returned amount that differs from the expected amount according to an explicit pricing and reconciliation policy.
13. Do not silently alter the order total after creating the payment.
14. If the provider applies a payment fee or unique amount, make that behavior transparent to the customer.
15. Ensure the amount requested from MYPG is derived from a server-side calculation.
16. Do not trust an amount submitted directly by the browser.
17. Do not create multiple payment invoices accidentally when the customer refreshes the page.

The example shows amount=23000 in the request and amount=23412 in the response.

Preserve this important distinction in the integration. Investigate the actual provider behavior before determining whether the difference represents a fee, a unique payment amount, or another pricing rule.

Do not assume the reason without confirmation.

============================================================
09. MYPG CHECK QRIS PAYMENT STATUS
============================================================

ENDPOINT:

POST https://yobasepay.net/api_my?action=checkstatus

METHOD:

POST

HEADERS:

Content-Type: application/x-www-form-urlencoded

FORM BODY:

api_key=<MYPG_API_KEY>
trxid=<MYPG_TRANSACTION_ID>

EXAMPLE REQUEST BODY STRUCTURE:

api_key=REDACTED&trxid=MY-20261011-88492019

EXAMPLE PAID RESPONSE:

{
  "status": true,
  "message": "Payment found",
  "data": {
    "trx_id": "MY-20261011-88492019",
    "status": "PAID",
    "amount": 23412,
    "paid_at": "2026-10-11 19:04:12"
  }
}

EXAMPLE UNPAID RESPONSE:

{
  "status": true,
  "message": "Payment pending",
  "data": {
    "trx_id": "MY-20261011-88492019",
    "status": "UNPAID",
    "amount": 23412,
    "expired_at": "2026-10-11 19:30:00"
  }
}

IMPLEMENTATION REQUIREMENTS

1. Submit the exact stored MYPG transaction ID.
2. Validate the JSON response.
3. Check the top-level status field and the nested payment status.
4. Treat PAID as a payment-provider status that must still be checked against the expected transaction and amount.
5. Treat UNPAID as unpaid.
6. Persist paid_at when supplied.
7. Persist expired_at when supplied.
8. Verify that the returned transaction ID matches the expected payment.
9. Verify the returned amount against the expected payment amount.
10. Do not mark an order paid if the response is malformed or does not match the expected transaction.
11. Do not rely on browser redirects as proof of payment.
12. Keep payment verification separate from H2H fulfillment.
13. Prevent duplicate fulfillment if the same PAID response is received repeatedly.
14. Provide an appropriate server-side status-check mechanism.
15. Apply reasonable polling intervals and backoff.
16. Handle timeouts and temporary errors without changing an order to paid or failed without evidence.

The documented examples include PAID and UNPAID.

Do not invent other MYPG status values. Handle undocumented values conservatively and record them for operational review.

============================================================
10. MYPG CANCEL QRIS PAYMENT
============================================================

ENDPOINT:

POST https://yobasepay.net/api_my?action=cancelpayment

METHOD:

POST

HEADERS:

Content-Type: application/x-www-form-urlencoded

FORM BODY:

api_key=<MYPG_API_KEY>
trxid=<MYPG_TRANSACTION_ID>

EXAMPLE REQUEST BODY STRUCTURE:

api_key=REDACTED&trxid=MY-20261011-88492019

EXAMPLE RESPONSE:

{
  "status": true,
  "message": "Payment cancelled successfully"
}

IMPLEMENTATION REQUIREMENTS

1. Submit the stored MYPG transaction ID.
2. Validate the response.
3. Record the cancellation request and result.
4. Do not assume cancellation succeeded without a valid provider response.
5. Do not cancel a payment that is already confirmed paid without checking the applicable provider behavior and business rules.
6. Do not mark the internal transaction cancelled merely because the cancellation request was sent.
7. Reconcile the final payment status when necessary.
8. Handle repeated cancellation requests safely.
9. Preserve the distinction between cancellation requested, cancellation confirmed, payment paid, and payment status uncertain where the application architecture supports these states.

The documented example provides a successful cancellation response.

Do not assume an undocumented cancellation response format.

============================================================
11. MANDATORY GUEST PURCHASE FLOW
============================================================

The complete purchase flow must work without login.

Required flow:

1. Customer opens the storefront.
2. Customer selects a game.
3. Customer selects a denomination.
4. Customer enters the game ID and any required server/zone ID.
5. Customer performs a nickname check when supported and appropriate.
6. Customer reviews the selected product and price.
7. The server creates an order and unique public reference.
8. The server requests a QRIS invoice from MYPG.
9. The customer receives the actual QR image or payment URL returned by MYPG.
10. The customer pays using the available QRIS flow.
11. The server checks the payment through MYPG.
12. The server verifies the returned payment transaction ID and amount.
13. Once payment is confirmed, the backend initiates H2H fulfillment according to the transaction state machine.
14. The backend records the H2H refID.
15. The backend submits /trx.
16. If H2H returns pending, the transaction remains in processing and is checked through /trx-check.
17. If H2H returns success, the transaction records the successful result and SN when available.
18. If H2H returns failure, the transaction enters the appropriate failure-handling process.
19. The customer can check the transaction without logging in.

Never let the browser directly trigger an unverified fulfillment request.

The server must control all state transitions.

============================================================
12. UNIQUE REFERENCES AND IDEMPOTENCY
============================================================

Maintain distinct references for the internal order, payment invoice, and H2H fulfillment.

Examples:

Internal order reference:
Generated by the application.

MYPG transaction ID:
Returned by MYPG in data.trx_id.

H2H refID:
Generated and persisted by the application for the intended fulfillment operation.

Do not assume these identifiers are interchangeable.

Requirements:

- Persist all relevant identifiers.
- Enforce uniqueness where appropriate.
- Use the same H2H refID for the original /trx request and subsequent /trx-check requests.
- Do not create a second MYPG invoice because the customer refreshes the checkout page.
- Do not submit duplicate H2H fulfillment for the same order.
- Make order creation and fulfillment initiation idempotent where possible.
- Reconcile uncertain external operations before attempting another operation.

============================================================
13. PROVIDER RESPONSE NORMALIZATION
============================================================

Normalize provider responses into an internal representation while preserving the raw provider result securely when useful.

For H2H, handle the documented plain-text responses.

For MYPG, handle the documented JSON responses.

For OkeConnect, handle the documented JSON array.

Do not treat a valid HTTP response as proof that the business operation succeeded.

Do not discard important provider fields.

Persist or process relevant information such as:

OKEConnect:
- kode
- keterangan
- produk
- kategori
- harga
- status

H2H:
- product
- dest
- refID
- normalized status
- returned SN when available
- provider response
- provider timestamps when available

MYPG:
- trx_id
- amount
- qr_image
- payment_url
- expired_at
- status
- paid_at
- message

Do not invent timestamps that are not supplied by the provider.

Use the application's own timestamps for internal processing events.

============================================================
14. CUSTOMER-FACING STATUS HANDLING
============================================================

Present understandable customer-facing statuses.

Examples:

Waiting for payment:
Menunggu pembayaran QRIS.

Payment confirmed:
Pembayaran berhasil dikonfirmasi.

Processing:
Pembayaran berhasil. Top-up sedang diproses.

Fulfillment successful:
Top-up berhasil.

Fulfillment failure:
Top-up gagal diproses. Transaksi sedang ditangani sesuai prosedur.

Uncertain provider status:
Status top-up sedang diverifikasi.

Expired payment:
Pembayaran kedaluwarsa.

Do not claim a top-up is successful until the H2H provider's success response has been verified and recorded.

Do not expose internal provider balance information.

Do not expose raw internal exception details or sensitive provider responses to customers.

============================================================
15. CONFIGURATION AND SECRETS
============================================================

Use server-side environment variables and secrets.

Expected conceptual configuration:

TOPUP_H2H_BASE=https://h2h.jkt48connect.com
MYPG_API_KEY=<configured securely>
OKEConnect catalog configuration=<configured securely>

Adapt variable names to the existing architecture when necessary, but keep the integration configuration centralized.

Do not commit secrets to Git.

Do not print secrets in logs.

Do not expose secrets through public runtime bindings or client-side environment variables.

Use Cloudflare Workers-compatible secret configuration for production.

Do not claim the provider connection is operational until it has been tested using valid configuration and a safe, authorized verification process.

============================================================
16. FAILURE HANDLING AND RECONCILIATION
============================================================

Handle external service failures carefully.

Examples include:
- OkeConnect catalog unavailable.
- Invalid catalog response.
- H2H timeout.
- H2H unknown text response.
- H2H pending transaction.
- H2H failed transaction.
- MYPG invoice creation failure.
- MYPG status-check failure.
- MYPG payment amount mismatch.
- MYPG transaction ID mismatch.
- MYPG cancellation uncertainty.

Requirements:

- Do not assume a timeout means the operation failed.
- Do not create duplicate chargeable requests blindly.
- Reconcile using the documented status-check endpoints where available.
- Keep uncertain transactions distinguishable from failed transactions.
- Preserve enough diagnostic information to investigate failures.
- Do not expose secrets in diagnostic logs.
- Make administrative reconciliation possible.
- Avoid automatically refunding or resubmitting without a defined and verified business process.

============================================================
17. IMPLEMENTATION AND TESTING
============================================================

Before modifying the repository:

1. Inspect the current stack.
2. Inspect the database schema.
3. Inspect Cloudflare Workers configuration.
4. Inspect current H2H and payment code.
5. Identify existing secrets by variable name only; never print their values.
6. Preserve unrelated user changes.

Implement the integrations using the documented endpoints and response examples in this specification.

Create appropriate tests for:

- Catalog parsing.
- Product availability handling.
- Price parsing.
- H2H success response parsing.
- H2H pending response parsing.
- H2H failure response parsing.
- Nickname-check response parsing.
- MYPG invoice creation response parsing.
- MYPG PAID response parsing.
- MYPG UNPAID response parsing.
- MYPG cancellation response parsing.
- Amount mismatch.
- Transaction ID mismatch.
- Duplicate payment callbacks or repeated status checks.
- Duplicate fulfillment prevention.
- Provider timeouts.
- Guest checkout without authentication.
- Secure guest transaction lookup.

Use mocked HTTP responses for automated tests.

Do not create real payment invoices or initiate real game top-ups during automated tests.

Only perform live integration tests when credentials, authorization, and a safe test procedure are available.

Do not fabricate test results.

============================================================
18. FINAL ACCEPTANCE CRITERIA
============================================================

The implementation must preserve all documented integration capabilities:

A. OkeConnect digital catalog endpoint.
B. H2H /trx top-up endpoint.
C. H2H /trx-check status endpoint.
D. H2H /trx nickname-check capability.
E. MYPG createpayment.
F. MYPG checkstatus.
G. MYPG cancelpayment.

Do not remove any of these capabilities.

Do not replace the documented endpoint methods, query parameter names, form fields, or response structures with invented alternatives.

Use the correct H2H base URL:

https://h2h.jkt48connect.com

Use the correct MYPG endpoint:

https://yobasepay.net/api_my

Keep the OkeConnect catalog endpoint as documented.

Guest checkout must work without mandatory registration or login.

Payment status and fulfillment status must remain separate.

Provider secrets must remain server-side.

Maintain Cloudflare Workers compatibility.

Continue to follow the previous master prompt's main-branch-only Git rules.

FINAL DIRECTIVE:

Implement the complete JKT48Connect TopUp application using the exact provider integration specification above.

Preserve every endpoint, operation, parameter, response example, and capability described in this section.

Do not invent unsupported provider behavior.

Do not claim production integration is working until it has been verified.

Build the real application rather than a frontend-only simulation.
