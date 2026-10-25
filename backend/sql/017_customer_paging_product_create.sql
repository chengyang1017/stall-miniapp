-- Apply after 016. Source only: never run automatically.
BEGIN;
CREATE TABLE product_create_requests (
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  actor_subject text NOT NULL,
  client_key text NOT NULL CHECK (length(client_key) BETWEEN 16 AND 100 AND client_key ~ '^[A-Za-z0-9_-]+$'),
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload)='object'),
  product_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id,actor_subject,client_key),
  FOREIGN KEY(store_id,product_id) REFERENCES products(store_id,id) ON DELETE RESTRICT
);
-- Entries and product creation commit together; retain receipts, including soft-deleted products.
CREATE INDEX products_customer_cursor ON products(store_id,created_at DESC,id DESC);
CREATE INDEX orders_customer_cursor ON orders(store_id,customer_subject,created_at DESC,id DESC);
COMMIT;
