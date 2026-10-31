> 2026-10-31 SBX-02: this document below preserves prior stages. Durable attempt/event records, recovery, full/partial refunds, compensation, immutable receipts and customer/merchant UI are now implemented behind additional disabled-by-default gates and independent migration 027. Current routes, variables, marker/ACL requirements, tests and remaining external acceptance: [Sandbox lifecycle handoff](../../docs/delivery/frontend/SANDBOX_PAYMENT_LIFECYCLE.md). No remote migration, activation or provider transaction was executed.

# Stripe isolated test HTTP interface

Disabled by default. Do not enable on the main Render service or production database.

Set STRIPE_TEST_PAYMENTS_ENABLED=true, PAYMENT_DB_ENV=isolated-test, STRIPE_TEST_SECRET_KEY, STRIPE_TEST_WEBHOOK_SECRET, STRIPE_TEST_SUCCESS_URL and STRIPE_TEST_CANCEL_URL on a separate isolated API service with a separate Neon test branch. The environment label is not a verified database identity; you must independently verify that the service database connection uses the isolated branch.

POST /v1/stores/:slug/orders/:id/stripe-test-checkout requires a customer bearer token and Idempotency-Key. Returns an external Stripe-hosted checkout URL, not wx.requestPayment.
POST /v1/payments/stripe-test/webhook validates the Stripe-Signature on raw body, checks server-side order amount and settles within a database transaction.

Limitation: payment arriving after the 15-minute hold expires is rejected, and must be reconciled/refunded manually until a reliable late-payment workflow exists. Stripe Checkout session expiration can differ from inventory expiry. This is NOT production-ready and not a substitute for reconciliation/refunds.

## Late paid notification audit

A signed test-mode Stripe payment arriving after the order expires/cancels is saved as a `payment_events.event_type='refund_required'` entry, with the Stripe Checkout Session ID as `provider_event_id` and `provider='stripe:sandbox'`. Duplicate notifications return the existing marker. No order is marked paid and no inventory is recommitted. **This is an audit marker only, not an actual refund**. Manual refund/reconciliation remains mandatory. Do not enable Stripe Checkout until the 15-minute reservation versus Stripe session expiry is resolved and refund execution is implemented/tested.

## Test-only refund client (not activated)

`src/stripeTestRefund.mjs` implements Stripe's official session lookup and Refunds API for a trusted `refund_required` payment-event record. It confirms test-mode, paid status, order ID, PaymentIntent, and amount before requesting a full refund using a deterministic idempotency key. A pending refund is not reported as completed. This module is NOT exposed as HTTP, automatically called from webhooks, or scheduled: execution must await a reviewed reconciliation worker, persisted refund status and permissioning. Stripe test-only payments remain disabled.

## Refund persistence (not running automatically)

The optional isolated-branch migration `sql/022_stripe_test_refund_jobs.sql` creates a durable refund queue. `stripeTestRefundJobs.mjs` can enqueue, lease, finish, and retry jobs; submitted refunds require subsequent Stripe status reconciliation, and failures eventually require manual review. A lease plus Stripe idempotency key protects against duplicate requests. **Do not automatically start the worker or enable payments** until migration, least-privilege grants, isolated-DB verification, and reconciliation of submitted refunds have been reviewed. No migration is automatically executed.

## Submitted refund polling

`getRefundStatus(refundId)` makes a read-only call to Stripe `/v1/refunds/:id`. `reconcileOneSubmittedStripeTestRefund()` leases one submitted row, verifies refund ID and amount, and records `succeeded`, `submitted` (pending), or `review` (failed/canceled). Failed lookups remain `submitted` for later retries. No automatic timer or route is registered; the worker still requires explicit safe activation. Payment remains disabled.

## Test-only timing alignment

On `PAYMENT_DB_ENV=isolated-test`, newly created finite-inventory orders hold stock for **60 minutes**; production still holds for 15 minutes. Stripe Checkout requests set `expires_at` to approximately **30 minutes** after creation. Checkout initiation remains restricted to the first **15 minutes** after creating the order. Stripe sandbox settlement checks a 60-minute creation window and the inventory expiry. This leaves about 15 minutes after the latest possible session expiry for event delivery; events arriving later enter the audited refund-required path. No refund worker is auto-enabled. Create a fresh isolated test order after configuring the environment. This does not provide an absolute guarantee against delayed network/webhook delivery.
