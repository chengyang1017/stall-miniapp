-- Phase 8: safe, retryable unpaid order creation.
BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_key text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_fingerprint char(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_snapshot jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_slot_snapshot jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_retry_unique
  ON orders(store_id, customer_subject, checkout_key) WHERE checkout_key IS NOT NULL;
COMMIT;
