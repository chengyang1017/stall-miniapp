-- Apply after 011 through the normal migration process. Supplied only; not executed.
BEGIN;
CREATE INDEX orders_store_state_cursor ON orders(store_id,fulfillment_status,created_at DESC,id DESC);
CREATE INDEX orders_store_cursor ON orders(store_id,created_at DESC,id DESC);
COMMIT;
