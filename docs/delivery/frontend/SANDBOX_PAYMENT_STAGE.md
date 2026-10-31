# SBX-01 — Sandbox channel foundation (2026-10-31)

Status: DEVELOPMENT, incomplete against full payment lifecycle acceptance. No deployment, migration, provider transaction or refund executed. No secrets inspected or copied. Existing untracked local backup preserved.

## Implemented

- Existing Stripe Test Checkout route accepts JSON `{ "channel": "card" | "alipay" | "wechat_pay" }`. Defaults to card for legacy callers; all HTTP channels now require an explicit server-side payment method configuration.
- Server-owned CNY amount, customer/store ownership and existing inventory/payment window checks remain mandatory. Client amount and extra body fields rejected.
- Uses dynamic Stripe payment method configurations, channel metadata and channel-qualified idempotency keys. Configuration must enable the intended channel; metadata is a requested channel, not proof of the customer's actual chosen method. Stripe eligibility may still hide a configured method.
- Hosted URL restricted to checkout.stripe.com. Outbound creation has 15 second timeout. Signed async success uses existing gateway verification and transactional inventory settlement. No browser return can mark paid.
- Customer order detail provides three external test link actions; copied links must be opened in a separate browser. No wx.requestPayment parameters or native adapter are fabricated. Identity/page changes discard stale responses; unknown network result retains request key in page memory for retry.
- Existing Staging Simulated Payments untouched.

## Required server variables / account setup

Default STRIPE_TEST_PAYMENTS_ENABLED unset/false. To test only after independent database isolation review:

- STRIPE_TEST_PAYMENTS_ENABLED=true
- PAYMENT_DB_ENV=isolated-test
- STRIPE_TEST_SECRET_KEY (sk_test_ only under existing adapter)
- STRIPE_TEST_WEBHOOK_SECRET
- STRIPE_TEST_SUCCESS_URL, STRIPE_TEST_CANCEL_URL (HTTPS)
- STRIPE_TEST_CARD_CONFIGURATION
- STRIPE_TEST_ALIPAY_CONFIGURATION
- STRIPE_TEST_WECHAT_PAY_CONFIGURATION
- Existing DATABASE_URL targeting independently verified isolated Neon branch (environment label alone does not prove isolation)

Each channel configuration is a Stripe pmc_ ID configured in the same test account. Account country, currency support, channel activation and platform approval require merchant review. No credentials supplied or provider access attempted in this stage. Render/Neon configuration not changed.

## Actual testing procedure (pending external execution)

1. Owner verifies separate Render service and Neon test branch, migrations/permissions, callback domain and sandbox credentials. Keep feature disabled until remaining lifecycle gaps below are resolved/reviewed.
2. Create a fresh CNY order using existing customer checkout and server catalog. Detail path: pages/order-detail/order-detail?id=<order UUID>. Orders list: pages/orders/orders; checkout: pages/checkout/checkout.
3. Request POST /v1/stores/:slug/orders/:id/stripe-test-checkout with bearer session, Idempotency-Key and selected channel JSON. In the miniapp use the corresponding test link button. Copy into external browser.
4. Card: Stripe documented test card 4242424242424242, future expiry, any 3-digit CVC. Use documented declined/3DS test cards for respective cases. Never enter real cards.
5. Alipay: choose Alipay on hosted Checkout, follow Stripe test authorization screen. WeChat: only if eligible in test account, choose WeChat hosted flow; this is not official WeChat native sandbox acceptance.
6. Stripe must deliver signed checkout.session.completed / checkout.session.async_payment_succeeded to /v1/payments/stripe-test/webhook. Reopen detail and verify server paid state and merchant pending queue. Return URL alone proves nothing.
7. Repeat callbacks, cancel, disconnect and retry same key; inspect inventory and payment_events in isolated DB. Late success must remain refund_required, with no inventory resurrection. These are pending provider/PG procedures, not executed evidence.

References: https://docs.stripe.com/payments/alipay/accept-a-payment?payment-ui=checkout ; https://docs.stripe.com/testing ; https://stripe.com/payment-method/wechat-pay .

## Validation

- Baseline npm run test:payment --prefix backend: 75 pass, 0 fail, 0 skip.
- Final same command: 83 pass, 0 fail, 0 skip (8 new adapter tests).
- First npm run verify:frontend: 215 tests, 170 pass, 45 fail, 0 skip; preserved evidence/20261031-sandbox-frontend.txt. Failures: existing lifecycle harness failed to strip `as any` from phone-order code; orders harness rejected existing phone-session storage read. Fixed harnesses, preserved all assertions; no product workaround.
- Targeted lifecycle + orders tests: 50 pass, 0 fail, 0 skip.
- Final npm run verify:frontend: 221 pass, 0 fail, 0 skip. All three TypeScript builds/boundary/output scans pass. Includes 6 new compiled Sandbox adapter tests.
- git diff --check passes. No actual PG/Stripe/WeChat/Render runtime test. Platform acceptance WAITING_FOR_OWNER_PREVIEW.

## Remaining implementation (not just missing credentials)

This stage does NOT complete the requested system. Payment attempts and full signed webhook event lifecycle are not persisted separately. Concurrent different attempts may create separate payable sessions; existing settlement rejects a second transaction rather than automatically refunding it. Do not enable for end-to-end acceptance yet.

Missing: native WeChat adapter and verified official sandbox capability, pending/failed/canceled webhook persistence and query/recovery API, durable retry keys across app restarts, closed/expired session recovery, transactional refund authorization/partial and full refund ledger, automatic late-payment refund scheduling, durable receipts and customer/merchant receipt access. Existing late-refund queue/client is retained but not activated. Checkout and orders list were not expanded this stage; only detail actions were added. Configuration metadata does not prove actual payment method used.

Next independent task: introduce isolated migration and transactional attempt/event ledger, enforce one active payable session or compensate additional trusted collections, then integrate full/partial refunds and receipt storage. Existing 022 refund jobs and PaymentSettlement should be extended rather than replaced. Real PG concurrency/DDL/ACL tests remain required.

Rollback: revert SBX-01 code commits and leave feature disabled; no database changes to undo. No production action or real funds authorized/performed.
