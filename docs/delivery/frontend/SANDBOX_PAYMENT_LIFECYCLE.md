# SBX-02 — durable Sandbox lifecycle (2026-10-31)

Continuation of PR #7, branch `codex/sandbox-payment-channels`, baseline `cd3097a1342287d30631ed801ae61a0d3f8a5995`. This supersedes SBX-01's remaining-code list for the lifecycle implemented here. Readiness remains DEVELOPMENT until real Neon/Stripe Test/platform evidence exists. Code is implemented and tested below; it is not just an interface plan. No remote migration, deployment, provider transaction or refund was performed. The original untracked `.local/phone-staging.json.backup` is untouched.

## Delivered behavior

- PostgreSQL `sandbox_payment_attempts`: requested/actual channel, server CNY amount, order, Session/PaymentIntent, stable provider request key, creation/expiry/update times and state. An order row lock and partial unique index enforce one active attempt across concurrent callers. Review states block replacement too. Different channel requests return 409 until the existing session is closed by Stripe.
- Creation is outside the DB transaction. The attempt and fixed expiry/configuration/return URLs are committed before calling Stripe. Lost responses reuse the saved provider key/body, including after process restart. No recovery creates another shop order. Unknown requests older than 23 hours enter manual review before Stripe's idempotency retention might expire. No fresh provider key is substituted for an unknown outcome.
- `sandbox_payment_notifications` records verified webhook ID/type, Session/order, payload SHA-256 and provider/receipt times without raw customer data. Duplicate IDs with different payloads are rejected, including concurrent uniqueness conflicts. Each notification retrieves current test-mode Session/expanded PaymentIntent from Stripe; stale negative events cannot reverse an already paid or closed attempt.
- Signed `completed`, `async_payment_succeeded`, `async_payment_failed`, `expired` notifications and authenticated state refresh converge on the same transactional settlement. A paid retrieval must match order, CNY amount, test mode, succeeded PaymentIntent and actual supported channel. Card declines are recorded as retryable failure on the same open Session; 3DS requires_action is shown as processing. Neither frees the active-session constraint. Browser returns never mark paid. Provider outage returns persisted status with `stale=true`.
- Payment event, stock commitment, order payment/source, attempt state, notification, receipt and compensation queue insertion share one transaction. Already-reserved inventory is committed, not decremented again. Late payments and distinct duplicate collections become refund-required events, never revive canceled/released stock, and are queued for compensation. Pre-ledger SBX-01 Sessions can be reconciled through signed notifications. A webhook arriving before Session persistence binds by the durable attempt key.
- Full and partial refunds extend `stripe_test_refund_jobs`. Owner/manager requests reserve remaining refundable amount under the order lock, persist operator/amount/key and return 202. Same-key replay returns the original job; different amount/key misuse is rejected. Pending/unknown/failed-review jobs keep their amount reservation to prevent over-refund. Refunds use stable job-based Stripe keys, verify the paid test Session and amount, then persist submitted/succeeded. Automatic failures back off up to five attempts; exhausted or ambiguous jobs require review. Expired processing/submitted leases recover; submitted refunds are queried, not reissued. Pending provider responses are never reported as refunded.
- Opt-in recovery worker restores creating/open/processing attempts, enqueues late/duplicate collections, consumes the existing refund queue, polls submitted refunds and synchronizes full/partial refund order status. Refunds never automatically restock goods. Sandbox fulfillment also requires the current approved isolated environment and matching trusted payment/receipt ledger; copied test paid orders cannot authorize production fulfillment. Existing Staging Simulated Payments and its authorization remain separate and unchanged.
- `sandbox_payment_receipts` saves the server order/item price snapshots, quantity, subtotal/delivery/total, CNY, requested/actual channel, provider timestamp, Session/PaymentIntent reference and test notice. Update/delete/truncate triggers protect the original document; read verifies its SHA-256. Refund records are displayed separately; the original is preserved. This is a test receipt, not a tax invoice or real-income proof. Privileged DB administrators are outside the app-role immutability boundary.
- Customer checkout and orders offer all three external Sandbox channel choices, carried to order detail without creating another order. Detail creates/copies the Stripe-hosted link, queries status, closes the current provider session before changing channel, displays refund progress and original receipts. Merchant order cards offer server-authorized payment/receipt lookup and amount entry for full/partial test refund requests. Staff can read; only owner/manager can refund. Hidden pages and changed identities/stores discard stale results. Lists optionally show persisted payment/refund progress when the lifecycle is enabled.
- WeChat remains **Stripe WeChat Pay external hosted testing**, not native `wx.requestPayment` or an official WeChat merchant sandbox. Alipay and cards also use external hosted Checkout. Channel eligibility/configuration must be verified in the actual Stripe test account; the receipt records the actual confirmed channel, not just the requested button.

## Independent migration and isolation

Migration: `backend/sql/027_sandbox_payment_lifecycle.sql`, after the repository's existing 001–026. 023 was already occupied by account groundwork; no existing migrations were edited. 027 has BEGIN/COMMIT, explicit new objects and no automatic execution, grants, marker insertion or feature activation. Repeat application fails rather than masking drift. Normalized LF SHA-256: `8446fb92011df392d3b738865bd635b1367de934e8091541cba7b0fe820b604c`.

027 also adds `sandbox_payment_environment`, empty by default. Both HTTP and worker require an enabled marker matching `SANDBOX_PAYMENT_INSTANCE_ID`, `current_database()` and `current_user`. The runtime role must have SELECT only on this marker; creation/edit/enable belongs to the authorized database operator after independently verifying the isolated Neon branch/Render service. Never copy a marker to production. An APP_ENV=production process is rejected. The marker cannot defend against a privileged administrator deliberately cloning/forging both environment and DB identity.

No migration has run on Render/Neon. Operator prerequisites: verify existing 001–026 ledger/catalog, use the approved direct Neon test connection and reviewed migration/audit process, apply 027 atomically, review least-privilege ACLs, install the disabled marker, review the running service/role/branch binding, then separately authorize test activation. Existing migrate-dev/Phase8 owner runners are not repurposed or expanded. Runtime needs existing order/auth/inventory access plus SELECT/INSERT/UPDATE attempts and refund jobs, SELECT/INSERT notifications and receipts, SELECT environment marker. Do not grant runtime UPDATE/DELETE/TRUNCATE on receipts or UPDATE on the marker. Real app-role ACL, DDL rollback, row-lock/deadlock and multi-connection tests still need Neon/native PostgreSQL evidence.

## Environment variables

All listed payment variables and DATABASE_URL were absent from this process environment when checked; values of any credentials were not inspected. No local secret file was read and no arbitrary database was contacted.

The independent disabled example is `backend/sandbox.env.example`; it is not automatically loaded. Set PG_SSL=true for the reviewed Neon TLS connection. Existing variables:

- DATABASE_URL — independently verified isolated Neon test branch, never production.
- PAYMENT_DB_ENV=isolated-test; APP_ENV must not be production.
- STRIPE_TEST_PAYMENTS_ENABLED=true (default off).
- STRIPE_TEST_SECRET_KEY — existing adapter accepts sk_test_ keys only.
- STRIPE_TEST_WEBHOOK_SECRET.
- STRIPE_TEST_SUCCESS_URL and STRIPE_TEST_CANCEL_URL — reviewed HTTPS pages.
- STRIPE_TEST_CARD_CONFIGURATION, STRIPE_TEST_ALIPAY_CONFIGURATION, STRIPE_TEST_WECHAT_PAY_CONFIGURATION — pmc_ IDs in the same test account, with channel eligibility reviewed.

New switches, all disabled/unconfigured by default:

- SANDBOX_PAYMENT_LIFECYCLE_ENABLED=true — only after 027 and test-environment review.
- SANDBOX_PAYMENT_INSTANCE_ID — approved marker UUID, not a self-created client value.
- SANDBOX_PAYMENT_WORKER_ENABLED=true — starts bounded nonoverlapping recovery ticks; restart/shutdown waits for current work.
- STRIPE_TEST_REFUNDS_ENABLED=true — additionally required for merchant refund requests and automatic queue execution/polling.

Neither code nor migration sets any of these switches. Refund/recovery must be enabled together for a complete test acceptance run; disabled workers leave explicit pending records, not fake successes.

## HTTP contract

All routes are gated and use existing bearer authentication/store authorization. Customer paths use `/v1/stores/:slug/orders/:id`; merchant paths use `/v1/merchant/stores/:slug/orders/:id`.

| Method/path suffix | Behavior |
| --- | --- |
| POST customer `/stripe-test-checkout` | `{channel:card|alipay|wechat_pay}` and Idempotency-Key; reserves/reuses one DB-owned attempt; returns external test URL only if provider Session is currently open |
| GET customer or merchant `/sandbox-payment` | refresh current active Session from Stripe, then return persisted attempts/refunds/immutable receipts, stale flag and server refund permission |
| POST customer `/sandbox-cancel` | expire open Session at Stripe, retrieve authoritative state, mark canceled only after confirmed expiration; pending asynchronous payment cannot be falsely canceled |
| POST merchant `/sandbox-refund` | owner/manager only, `{amountCents:positive integer}`, Idempotency-Key; reserves amount and returns durable job/status with 202 |
| POST `/v1/payments/stripe-test/webhook` | raw-body Stripe-Signature required; signed event audit plus provider retrieval and transactional settlement |

Customer and staff refund requests are refused. Frontend reads do not trigger real refunds; only the separately enabled queue worker does. Recovery is safe across network failure and restart because the durable state/key is server-owned. If a provider Session has expired outside the order's allowed initiation window, the server refuses a new attempt; it never extends stock reservations silently. Manual review is required for ambiguous outcomes beyond retry/idempotency limits. Existing paid/refunded fulfillment authorization remains intact.

## Actual commands and evidence

| Command | Pass | Fail | Skip | Evidence |
| --- | ---: | ---: | ---: | --- |
| `npm run test:payment --prefix backend` | 83 | 0 | 0 | evidence/20261031-sbx02-payment-delivery.txt |
| `npm run test:payment:lifecycle --prefix backend` | 35 | 0 | 0 | evidence/20261031-sbx02-lifecycle-delivery-final.txt |
| `npm run verify:frontend` | 230 | 0 | 0 | evidence/20261031-sbx02-frontend-delivery.txt |
| six selected offline order/inventory/Staging test files | 140 | 1 | 0 | evidence/20261031-sbx02-order-regression-final.txt |
| baseline cd3097a Phase7 replay, diagnostic only | 62 | 1 | 0 | evidence/20261031-sbx02-order-baseline.txt |

The six selected files are business-consistency-phase7, staging-payments, staging-payments-ui, order-security, order-state-transitions and order-status-safety. Do not glob all backend/tests: there are live tests there. Baseline replay is reproducible using `node --import ./backend/tests/helpers/sandbox-baseline-loader.mjs --test backend/tests/business-consistency-phase7.test.mjs` and only substitutes read-only Git sources at cd3097a.

The one baseline failure is P7-39: old test expects store_closed after business closing; current deliveryRules explicitly permits ordering outside business hours for a valid future slot. Current and baseline both return 201 versus expected 409. No tests were removed, skipped, or weakened to hide it, and this task does not reverse that unrelated business policy. Owner must resolve the contract/test mismatch before release.

35 new lifecycle tests execute actual repository migrations 001–027 and real SQL/constraints/triggers/transaction rollback on PGlite WASM PostgreSQL, actual payment/store/worker/HTTP code and controlled synthetic Stripe HTTP responses. They cover the three channels, single-active uniqueness, concurrent callers through a serialized test connection, unknown-COMMIT recovery with connection discard, restarts from persisted snapshots, amount/mode validation, signature/duplicate/ordered event checks, cancellation, late and duplicate compensation, inventory commitment once, full/partial refund reservations/retries/polling, receipt immutability, environment binding and atomic migration rollback. **PGlite is not a native PostgreSQL server or Neon multi-connection concurrency test; Stripe responses are mocked, not actual provider confirmations.** The test adds PGlite as devDependency only.

Frontend verification builds Combined/Customer/Merchant with strict TypeScript and checks boundaries/output/static preview, then 230 offline tests including 9 new actual compiled-page/API/view tests. No WeChat tool/platform or iOS/Android execution; all WAITING_FOR_OWNER_PREVIEW. Additional node --check commands for server/new lifecycle modules and code/document git diff --check (excluding preserved raw evidence whitespace) passed.

Preserved failure history: first lifecycle run included later profile migrations before test role setup (17 setup failures); migration numbering/fixture setup corrected without modifying existing SQL. Native Windows PGlite directory reopen failed (second/third logs); using documented dumpDataDir/loadDataDir validates a persisted PostgreSQL archive in a fresh process instead. This does not claim native filesystem/Neon restart acceptance. One new compiled UI test initially failed because its deferred VM response had not reached the next microtask; fixed the test scheduling, then all 230 passed. All original assertions remain.

## Owner's real Sandbox / platform acceptance procedure

1. Independently confirm dedicated Render test service + isolated Neon branch, runtime identity and existing ledger. Review/apply 027, grants and disabled marker through the authorized operator process. Configure test account, channel configurations, mandatory webhook endpoint, HTTPS return pages, then explicitly authorize marker/switch activation. Never use main service, production DB or real cards.
2. Use synthetic customer/merchant accounts, valid catalog/address/future delivery slot. Checkout path `pages/checkout/checkout`: choose each channel, submit once, arrive at `pages/order-detail/order-detail?id=<UUID>&sandboxChannel=<channel>`. Orders path `pages/orders/orders` also carries each selected channel to the same order.
3. On detail, open that channel's test link, copy to an external browser. It is not native WeChat payment. Card success: Stripe 4242424242424242, future expiry, any 3-digit CVC; use official decline and 3DS fixtures for respective tests. Alipay: Stripe test authorization/redirect flow. WeChat: eligible Stripe-hosted test flow only; merchant/account eligibility and platform restrictions must be checked, not assumed.
4. Return or disconnect before return; query server status. Verify signed callbacks/provider retrieval persist event/Session/actual method, server paid/source, one stock commitment and one receipt. Merchant `pages/admin-orders/admin-orders` should show paid new order under pending acceptance; unpaid remains blocked. Replay callbacks and race two clients, cancellation, expiry and a lost creation response on separate real DB connections; verify indexes/locks and no second active Session/order.
5. Cancel via detail before switching channel; if payment is already processing/succeeded, UI must show authoritative state. After order cancellation/expiry deliver a real signed test paid result; verify no stock resurrection and exactly one compensating test refund. Import/reconcile an older distinct paid Session to verify duplicate-collection compensation. Use deliberate test transactions only.
6. Merchant payment/refund/receipt panel: enter partial amount, retry same request after lost response, verify queue reservation and one provider refund; refund remainder and verify partial/full order state and original receipt remains. Fail refund API/polling, restart worker, wait for lease recovery/backoff, and verify submitted is never shown as succeeded before provider confirmation. Review rows are operator work, not auto-retried under new keys.
7. Compare customer/merchant original receipt hash, item snapshot, actual channel and provider references; refunds appear separately. Test wrong customer/store/staff refund, environment mismatch, live keys/events, callback tampering, canceled/released stock and return-page claims. Capture redacted runtime evidence and SHA, never secrets/tokens/customer personal data.

Relevant official references: [Session retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve), [Session expiration](https://docs.stripe.com/api/checkout/sessions/expire), [partial/full refunds](https://docs.stripe.com/api/refunds/create), [test cards](https://docs.stripe.com/testing), [PGlite snapshot/filesystem limits](https://pglite.dev/docs/filesystems).

## Changed files and rollback

Backend: new sql/027_sandbox_payment_lifecycle.sql; src/sandboxPaymentStore.mjs, sandboxPaymentWorker.mjs, sandboxPaymentQuery.mjs, stripeSandboxClient.mjs; modified stripeTestPaymentRoute, stripeCheckoutGateway, paymentSettlementTransaction, stripeTestRefund, stripeTestRefundJobs, server, orderWorkflow, merchantOrderQuery. Existing orders/inventory/PaymentGateway architecture is reused. sandbox.env.example keeps all payment/worker/refund switches false. Package/lock adds dev-only PGlite and explicit test:payment:lifecycle command.

Frontend: shared API/domain Sandbox modules, payment labels; checkout, orders, order-detail and admin-orders TS/WXML; actual compiled tests apps/tests/sandbox-lifecycle.test.cjs and verify allowlist. Backend tests/helpers sandbox-pglite, sandbox-restart-reader, sandbox-baseline-loader and sandbox-payment-lifecycle.test.mjs. Documentation/evidence under this directory; backend Stripe usage doc points here. No owner-maintained release archive, credentials, deployment or production configuration edited.

Rollback: disable STRIPE_TEST_PAYMENTS_ENABLED/lifecycle/worker/refund switches, retain all financial records/receipts, revert app commits as reviewed. Do not run 022's old queue worker against the extended schema or discard compensation/refund records. Keep 027 additive schema until an operator-reviewed retention/rollback plan; no automatic DROP or data deletion. No deployment/remote migration was performed by this work.

## Git review receipt

PR #7 is retained; no duplicate PR and no automatic merge. Exact submitted SHA/remote synchronization is appended after commit. Migration SHA-256 above is canonical LF text so Git autocrlf does not change its audit identity.

## SBX-02 tested product commit

Tested implementation commit: `ef89649b7b79332b1c0c202857d12fb8911b0b85`. Final evidence: payment 83/0/0, lifecycle 35/0/0, frontend 230/0/0 and three TypeScript targets; additional regression 140/1/0 with the same P7-39 baseline failure. PR [#7](https://github.com/chengyang1017/stall-miniapp/pull/7), existing branch codex/sandbox-payment-channels. The following documentation-only commit records this SHA and does not change tested code. Remote verification is reported in the PR/chat after ordinary push. Owner preview paths and steps are in SANDBOX_PAYMENT_LIFECYCLE.md; WAITING_FOR_OWNER_PREVIEW and DEVELOPMENT remain accurate.
