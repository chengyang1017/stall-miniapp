-- Phase 1: schema only. No client authentication, checkout or payment API yet.
BEGIN;
CREATE TABLE IF NOT EXISTS merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchant_members (
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  external_subject text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','manager','staff')),
  PRIMARY KEY (merchant_id, external_subject)
);
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (store_id, id)
);
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  category_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  sold_out boolean NOT NULL DEFAULT false,
  image_object_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  FOREIGN KEY (store_id, category_id) REFERENCES categories(store_id, id)
);
CREATE INDEX IF NOT EXISTS products_store_idx ON products(store_id, active);
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  customer_subject text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'CNY',
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  delivery_fee_cents bigint NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents = subtotal_cents + delivery_fee_cents),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','partially_refunded')),
  fulfillment_status text NOT NULL DEFAULT 'new' CHECK (fulfillment_status IN ('new','accepted','preparing','delivering','delivered','cancelled','abnormal')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_store_created_idx ON orders(store_id, created_at DESC);
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id uuid,
  product_name text NOT NULL,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  line_total_cents bigint GENERATED ALWAYS AS (unit_price_cents::bigint * quantity) STORED
);
CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);
COMMIT;
