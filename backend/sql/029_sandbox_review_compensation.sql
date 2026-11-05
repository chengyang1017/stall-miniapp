-- Isolated Stripe TEST mismatch compensation. No production activation.
BEGIN;
ALTER TABLE stripe_test_refund_jobs ALTER COLUMN payment_event_id DROP NOT NULL;
ALTER TABLE stripe_test_refund_jobs DROP CONSTRAINT stripe_test_refund_jobs_kind_check;
ALTER TABLE stripe_test_refund_jobs ADD CONSTRAINT sandbox_refund_kind_check
 CHECK(kind IN ('compensation','merchant','review_compensation'));
ALTER TABLE stripe_test_refund_jobs ADD CONSTRAINT sandbox_review_compensation_event_check
 CHECK(kind <> 'review_compensation' OR (payment_event_id IS NULL AND request_key IS NOT NULL AND payment_amount_cents=amount_cents));
CREATE UNIQUE INDEX sandbox_refund_one_review_compensation
 ON stripe_test_refund_jobs(checkout_session_id) WHERE kind='review_compensation';
COMMIT;
