-- Apply after 008. Supplied only; do not execute automatically.
BEGIN;
ALTER TABLE products ADD COLUMN stock_mode text NOT NULL DEFAULT 'unlimited' CHECK (stock_mode IN ('unlimited','finite'));
ALTER TABLE products ADD COLUMN stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity BETWEEN 0 AND 1000000);
ALTER TABLE products ADD COLUMN low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold BETWEEN 0 AND 1000000);
ALTER TABLE products ADD COLUMN inventory_version integer NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN inventory_state text NOT NULL DEFAULT 'none' CHECK (inventory_state IN ('none','held','committed','released'));
ALTER TABLE orders ADD COLUMN inventory_expires_at timestamptz;
ALTER TABLE orders ADD CONSTRAINT orders_inventory_store_id UNIQUE(store_id,id);
CREATE TABLE inventory_reservations (
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  state text NOT NULL DEFAULT 'held' CHECK (state IN ('held','committed','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  PRIMARY KEY(order_id,product_id),
  FOREIGN KEY(store_id,order_id) REFERENCES orders(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,product_id) REFERENCES products(store_id,id) ON DELETE RESTRICT
);
CREATE INDEX inventory_held_product ON inventory_reservations(store_id,product_id) WHERE state='held';
CREATE INDEX inventory_expiring_orders ON orders(inventory_expires_at) WHERE inventory_state='held';
CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  order_id uuid,
  before_mode text NOT NULL CHECK (before_mode IN ('unlimited','finite')),
  after_mode text NOT NULL CHECK (after_mode IN ('unlimited','finite')),
  before_quantity integer NOT NULL CHECK (before_quantity BETWEEN 0 AND 1000000),
  delta integer NOT NULL,
  after_quantity integer NOT NULL CHECK (after_quantity BETWEEN 0 AND 1000000),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  source text NOT NULL CHECK (source IN ('manual','order','cancel','expiry','payment','payment_failed')),
  actor_subject text NOT NULL,
  operation_key text NOT NULL,
  request_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (after_quantity = before_quantity + delta),
  UNIQUE(store_id,product_id,operation_key),
  FOREIGN KEY(store_id,product_id) REFERENCES products(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,order_id) REFERENCES orders(store_id,id) ON DELETE RESTRICT
);
CREATE INDEX inventory_movements_product ON inventory_movements(store_id,product_id,created_at DESC,id DESC);
CREATE FUNCTION inventory_movements_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Inventory history is append-only';
END;
$$;
CREATE TRIGGER inventory_movements_no_rewrite BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION inventory_movements_append_only();
COMMIT;
