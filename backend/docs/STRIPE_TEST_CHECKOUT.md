# Stripe isolated test HTTP interface

Disabled by default. Do not enable on the main Render service or production database.

Set STRIPE_TEST_PAYMENTS_ENABLED=true, PAYMENT_DB_ENV=isolated-test, STRIPE_TEST_SECRET_KEY, STRIPE_TEST_WEBHOOK_SECRET, STRIPE_TEST_SUCCESS_URL and STRIPE_TEST_CANCEL_URL on a separate isolated API service with a separate Neon test branch. The environment label is not a verified database identity; you must independently verify that the service database connection uses the isolated branch.

POST /v1/stores/:slug/orders/:id/stripe-test-checkout requires a customer bearer token and Idempotency-Key. Returns an external Stripe-hosted checkout URL, not wx.requestPayment.
POST /v1/payments/stripe-test/webhook validates the Stripe-Signature on raw body, checks server-side order amount and settles within a database transaction.

Limitation: payment arriving after the 15-minute hold expires is rejected, and must be reconciled/refunded manually until a reliable late-payment workflow exists. Stripe Checkout session expiration can differ from inventory expiry. This is NOT production-ready and not a substitute for reconciliation/refunds.

## Late paid notification audit

A signed test-mode Stripe payment arriving after the order expires/cancels is saved as a `payment_events.event_type='refund_required'` entry, with the Stripe Checkout Session ID as `provider_event_id` and `provider='stripe:sandbox'`. Duplicate notifications return the existing marker. No order is marked paid and no inventory is recommitted. **This is an audit marker only, not an actual refund**. Manual refund/reconciliation remains mandatory. Do not enable Stripe Checkout until the 15-minute reservation versus Stripe session expiry is resolved and refund execution is implemented/tested.
