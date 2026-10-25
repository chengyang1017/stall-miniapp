-- Apply after 001-007. This file is supplied only; do not auto-run it.
BEGIN;
ALTER TABLE stores ADD COLUMN time_zone text NOT NULL DEFAULT 'Asia/Shanghai';
ALTER TABLE products ADD COLUMN publish_at timestamptz;
ALTER TABLE products ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE products ADD CONSTRAINT products_schedule_inactive CHECK (publish_at IS NULL OR active = false);
CREATE INDEX products_pending_publish ON products(store_id, publish_at) WHERE publish_at IS NOT NULL;
CREATE TABLE product_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  client_key text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','discarded')),
  published_product_id uuid,
  publish_payload jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, client_key),
  FOREIGN KEY(store_id, published_product_id) REFERENCES products(store_id,id) ON DELETE RESTRICT
);
CREATE INDEX product_drafts_store_state ON product_drafts(store_id, state, updated_at DESC);
COMMIT;
