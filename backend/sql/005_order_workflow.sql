-- Cloud order fulfillment and auditable merchant actions. Payment is managed separately.
BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_proof_key text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS issue_reason text;
CREATE TABLE IF NOT EXISTS order_status_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES stores(id),
 order_id uuid NOT NULL REFERENCES orders(id),
 actor_subject text NOT NULL,
 from_status text NOT NULL,
 to_status text NOT NULL,
 note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_lookup_idx ON order_status_events(store_id,order_id,created_at);
COMMIT;
