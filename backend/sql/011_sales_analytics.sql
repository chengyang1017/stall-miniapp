-- After 010. Supplied only; do not execute automatically.
BEGIN;
ALTER TABLE order_items ADD COLUMN category_id_snapshot uuid;
ALTER TABLE order_items ADD COLUMN category_name_snapshot text;
-- No backfill: a product's category today is not evidence of its historical category.
CREATE FUNCTION capture_order_item_category() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT p.category_id,c.name INTO NEW.category_id_snapshot,NEW.category_name_snapshot
  FROM orders o JOIN products p ON p.store_id=o.store_id AND p.id=NEW.product_id
  LEFT JOIN categories c ON c.store_id=p.store_id AND c.id=p.category_id
  WHERE o.id=NEW.order_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER order_item_category_snapshot BEFORE INSERT ON order_items
FOR EACH ROW EXECUTE FUNCTION capture_order_item_category();
CREATE INDEX order_items_order_analytics ON order_items(order_id,product_id);
COMMIT;
