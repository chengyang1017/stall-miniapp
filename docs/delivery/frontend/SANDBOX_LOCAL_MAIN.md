# SBX-03 local main consolidation — 2026-11-04

Status: DEVELOPMENT. No push, PR, fetch, remote API, migration or deployment. Local main base 18f18f7; squash incorporates the existing cd3097a/ef89649/7674404 Sandbox work without rewriting it. Remote freshness is NOT VERIFIED under the local-only instruction. Untracked .local/phone-staging.json.backup is preserved and excluded.

## Audit and changes

Reviewed migration 027, attempt reservation/provider recovery/settlement, worker/refund queue, authenticated routes, receipt persistence and customer/merchant API/page contracts with existing compiled-page regression evidence. Existing lifecycle implementation and operator procedure: [SANDBOX_PAYMENT_LIFECYCLE.md](SANDBOX_PAYMENT_LIFECYCLE.md). RELEASE_GATE.md and backend/HANDOFF.md both exist; their older missing-payment statements are historical and do not certify this implementation.

card, alipay, wechat_pay: local implementation and mocked lifecycle coverage present, real provider acceptance pending for every channel. These are external Stripe hosted Checkout flows; card means bank card, not bank transfer. No native WeChat/Alipay payment integration added.

New fixes: refund ID, PaymentIntent and provider status now persist in the same lease-guarded UPDATE before the lease is released. Previously a crash between two writes lost the intent used to verify subsequent polls. Compensation now returns the trusted PaymentIntent, validates CNY on Session and refund, and polling rejects non-CNY refunds. Three additional regression tests reproduce the gaps; synthetic fixtures now include real API currency fields. No business-hours policy or existing assertions removed/weakened.

New backend `test` script explicitly selects offline payment, lifecycle and six order/inventory/security regressions; root `verify` collects frontend/build and backend failures. No automatic discovery of live DB tests. Existing backend package had no test script and root had no verify script; initial missing-script output retained.

Changed files include the prior Sandbox implementation (full inventory in SBX-02), plus backend/src/stripeTestRefund{,Jobs}.mjs, their tests, backend/package.json, package.json and scripts/verify-sandbox.mjs. Git commit diff is the authoritative full file inventory.

## Validation

Evidence under evidence/20261104-*.txt. Before-fix refund atomic-write regression failed; currency tests failed before fixes. An intermediate edit introduced a session variable error in polling; preserved payment-intermediate output, corrected before final validation.

- npm run test:payment --prefix backend: 86 pass / 0 fail / 0 skip.
- npm run test:payment:lifecycle --prefix backend: 35 pass / 0 fail / 0 skip (also included in final backend test).
- npm run verify:frontend: 230 pass / 0 fail / 0 skip, combined/customer/merchant strict builds and boundaries/output checks pass.
- npm run test --prefix backend: 261 pass / 1 fail / 0 skip, 262 total. P7-39 remains visible: expected store_closed/409, actual 201. deliveryRules.mjs explicitly allows orders outside business hours with valid future slots. Historical baseline reproduction is retained in SBX-02 evidence. No policy change authorized or made; resolve with business owner before release.
- npm run verify: see final evidence; must remain failed while P7-39 fails, never advertise green overall.

Mocked Stripe and PGlite results prove local behavior only. They do not prove actual provider eligibility/3DS/redirect behavior, Neon independent connection locking, runtime ACLs, Render worker recovery, or WeChat platform acceptance. All real environment checks remain NOT RUN / WAITING_FOR_OWNER_PREVIEW.

## Final operator acceptance (future separately authorized work)

1. Neon: dedicated isolated branch/runtime role; review 001–027 and apply 027 atomically; grant minimum rights, SELECT-only environment marker and insert/read-only receipts; test UPDATE/DELETE/TRUNCATE denial as app role. Race independent native PostgreSQL connections for Session/refund reservation, queue SKIP LOCKED, rollback and duplicate callbacks. Do not substitute PGlite evidence.
2. Stripe: same test account and channel-specific pmc configurations; mandatory signed webhook; test card success/decline/3DS, Alipay and WeChat hosted authorization eligibility, interruption/return, expiry/channel switching, duplicate/late collections. Match CNY, amount, order/intent/channel, immutable receipt and stock commitment once. No real funds.
3. Render: dedicated test service/DB marker binding, disabled-by-default switches enabled only after review; disconnect after refund submission and kill/restart workers before/after lease expiry, verify same keys/refund IDs, bounded retries/manual review and pending-to-final convergence. No production environment changes.
4. Owner WeChat preview: pages/checkout/checkout, pages/orders/orders, pages/order-detail/order-detail?id=<synthetic-order-id>, pages/admin-orders/admin-orders. Exercise all channels, copying link, refresh/relaunch/cross-device recovery; hide page/switch account during requests; customer and merchant receipt/refund display, owner/manager refund, staff denial. Record exact commit, target, platform/device and redacted results. WAITING_FOR_OWNER_PREVIEW.

Next independent work: process the P7-39 policy decision or actual acceptance evidence; inspect long-lived processing/manual-review operator handling under real provider failure injection. This local commit is not a release candidate and does not certify full customer delivery.

Final root verify totals: frontend 230/0/0 plus backend 261/1/0 = 491 pass, 1 fail, 0 skip. Overall FAILED due to P7-39; builds passed. Counts overlap separate commands and are not unique test counts.

