-- Phase 9. No default configuration: a store must opt in before cloud checkout.
BEGIN;
CREATE TABLE IF NOT EXISTS store_delivery_rules (
 store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
 configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
