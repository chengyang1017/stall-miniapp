-- Apply after 008 and 009, through the normal migration process. Supplied only; not auto-executed.
BEGIN;
CREATE INDEX products_store_created_page ON products(store_id, created_at DESC, id);
CREATE INDEX products_store_updated_page ON products(store_id, updated_at DESC, id);
CREATE INDEX products_store_category_search ON products(store_id, category_id);
CREATE INDEX product_drafts_created_page ON product_drafts(store_id, created_at DESC, id) WHERE state='draft';
COMMIT;
