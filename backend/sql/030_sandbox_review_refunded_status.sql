-- Isolated Stripe TEST; release reviewed attempts only after verified complete refund.
BEGIN;
ALTER TABLE sandbox_payment_attempts DROP CONSTRAINT sandbox_payment_attempts_status_check;
ALTER TABLE sandbox_payment_attempts ADD CONSTRAINT sandbox_payment_attempts_status_check
 CHECK(status IN ('creating','open','processing','succeeded','failed','cancelled','expired','refund_required','review','refunded'));
COMMIT;
