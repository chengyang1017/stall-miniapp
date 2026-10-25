-- Source only: apply after 014. Never performs storage deletion.
BEGIN;
CREATE TABLE stored_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES stores(id),
 object_key text NOT NULL UNIQUE,
 kind text NOT NULL CHECK (kind IN ('product','proof')),
 source text NOT NULL CHECK (source IN ('upload','legacy','discovered')),
 upload_state text NOT NULL DEFAULT 'issued' CHECK (upload_state IN ('issued','verified','missing','unknown','deleting','deleted')),
 storage_bucket text,
 expected_bytes integer,
 upload_request_key uuid,
 content_type text,
 etag text,
 actual_bytes bigint,
 object_modified_at timestamptz,
 last_checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 protect_until timestamptz NOT NULL DEFAULT clock_timestamp()+interval '7 days',
 ever_referenced boolean NOT NULL DEFAULT false,
 retention_hold boolean NOT NULL DEFAULT false,
 candidate_reason text,candidate_identified_at timestamptz,
 UNIQUE(store_id,object_key)
 ,UNIQUE(store_id,kind,upload_request_key)
);
CREATE INDEX stored_images_store ON stored_images(store_id,created_at DESC,id DESC);
CREATE TABLE image_reference_history (
 store_id uuid NOT NULL,
 object_key text NOT NULL,
 reference_kind text NOT NULL CHECK (reference_kind IN ('product','draft','order','order_item','archive','backup')),
 reference_id uuid NOT NULL,
 first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,object_key,reference_kind,reference_id),
 FOREIGN KEY(store_id,object_key) REFERENCES stored_images(store_id,object_key)
);
CREATE TABLE image_cleanup_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES stores(id),
 client_key uuid NOT NULL,created_by text NOT NULL,approved_by text,
 request_ids jsonb NOT NULL,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','approved','running','finished')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours',
 UNIQUE(store_id,client_key)
);
CREATE TABLE image_cleanup_items (
 plan_id uuid NOT NULL REFERENCES image_cleanup_plans(id),image_id uuid NOT NULL REFERENCES stored_images(id),
 expected_etag text NOT NULL,identified_at timestamptz NOT NULL DEFAULT clock_timestamp(),reason text NOT NULL,
 result text NOT NULL DEFAULT 'planned',completed_at timestamptz,
 PRIMARY KEY(plan_id,image_id)
);
CREATE TABLE image_cleanup_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,store_id uuid NOT NULL REFERENCES stores(id),
 plan_id uuid,image_id uuid,actor_subject text NOT NULL,action text NOT NULL,result text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX image_cleanup_rate ON image_cleanup_audit(store_id,action,created_at DESC);

-- Existing keys are known references, not unreferenced upload candidates. Never guess old order images.
INSERT INTO stored_images(store_id,object_key,kind,source,upload_state,ever_referenced,retention_hold)
SELECT store_id,image_object_key,'product','legacy','unknown',true,true FROM products WHERE image_object_key IS NOT NULL
UNION SELECT store_id,payload->>'imageObjectKey','product','legacy','unknown',true,true FROM product_drafts WHERE coalesce(payload->>'imageObjectKey','')<>''
UNION SELECT store_id,delivery_proof_key,'proof','legacy','unknown',true,true FROM orders WHERE delivery_proof_key IS NOT NULL
ON CONFLICT(object_key) DO NOTHING;

CREATE FUNCTION pin_image_reference(s uuid,k text,t text,r uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE img stored_images;
BEGIN
 IF k IS NULL OR k='' THEN RETURN; END IF;
 SELECT * INTO img FROM stored_images WHERE store_id=s AND object_key=k FOR UPDATE;
 IF NOT FOUND OR img.upload_state IN ('deleting','deleted') THEN RAISE EXCEPTION 'image_reference_unavailable' USING ERRCODE='23514'; END IF;
 IF (t IN ('product','draft','order_item','archive') AND img.kind<>'product') OR (t='order' AND img.kind<>'proof') THEN RAISE EXCEPTION 'image_kind_mismatch' USING ERRCODE='23514'; END IF;
 IF (img.kind='product' AND k NOT LIKE 'stores/'||s::text||'/products/%') OR
    (img.kind='proof' AND k NOT LIKE 'delivery-proofs/'||s::text||'/%') THEN RAISE EXCEPTION 'image_store_mismatch' USING ERRCODE='23514'; END IF;
 UPDATE stored_images SET ever_referenced=true,retention_hold=true WHERE id=img.id;
 INSERT INTO image_reference_history(store_id,object_key,reference_kind,reference_id) VALUES(s,k,t,r) ON CONFLICT DO NOTHING;
END $$;

SELECT pin_image_reference(store_id,image_object_key,'product',id) FROM products WHERE image_object_key IS NOT NULL;
SELECT pin_image_reference(store_id,payload->>'imageObjectKey','draft',id) FROM product_drafts WHERE coalesce(payload->>'imageObjectKey','')<>'';
SELECT pin_image_reference(store_id,delivery_proof_key,'order',id) FROM orders WHERE delivery_proof_key IS NOT NULL;

-- Pin surviving Phase 24 archive references, including CSV. Expired/purged legacy archives
-- cannot be reconstructed; discovered legacy storage objects stay permanently protected.
DO $$ DECLARE a record;k text; BEGIN
 FOR a IN SELECT id,store_id,content FROM merchant_archives WHERE content IS NOT NULL LOOP
  FOR k IN SELECT DISTINCT m[1] FROM regexp_matches(convert_from(a.content,'UTF8'),'(stores/[0-9a-f-]{36}/products/[0-9a-f-]{36}\.(jpg|png|webp))','g') AS m LOOP
   IF k LIKE 'stores/'||a.store_id::text||'/products/%' THEN
    INSERT INTO stored_images(store_id,object_key,kind,source,upload_state,ever_referenced,retention_hold) VALUES(a.store_id,k,'product','legacy','unknown',true,true) ON CONFLICT(object_key) DO NOTHING;
    PERFORM pin_image_reference(a.store_id,k,'archive',a.id);
   END IF;
  END LOOP;
 END LOOP;
END $$;

CREATE FUNCTION track_business_image() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text;
BEGIN
 k=CASE WHEN TG_TABLE_NAME='products' THEN to_jsonb(NEW)->>'image_object_key' WHEN TG_TABLE_NAME='product_drafts' THEN to_jsonb(NEW)->'payload'->>'imageObjectKey' ELSE to_jsonb(NEW)->>'delivery_proof_key' END;
 IF k IS NOT NULL AND k<>'' THEN
  IF TG_TABLE_NAME='orders' AND k NOT LIKE 'delivery-proofs/'||NEW.store_id::text||'/'||NEW.id::text||'/%' THEN RAISE EXCEPTION 'proof_order_mismatch' USING ERRCODE='23514'; END IF;
  PERFORM pin_image_reference(NEW.store_id,k,CASE WHEN TG_TABLE_NAME='products' THEN 'product' WHEN TG_TABLE_NAME='product_drafts' THEN 'draft' ELSE 'order' END,NEW.id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER track_product_image BEFORE INSERT OR UPDATE OF image_object_key ON products FOR EACH ROW EXECUTE FUNCTION track_business_image();
CREATE TRIGGER track_draft_image BEFORE INSERT OR UPDATE OF payload ON product_drafts FOR EACH ROW EXECUTE FUNCTION track_business_image();
CREATE TRIGGER track_proof_image BEFORE INSERT OR UPDATE OF delivery_proof_key ON orders FOR EACH ROW EXECUTE FUNCTION track_business_image();

ALTER TABLE order_items ADD COLUMN image_object_key_snapshot text;
CREATE FUNCTION snapshot_order_image() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s uuid;k text;
BEGIN
 SELECT store_id INTO s FROM orders WHERE id=NEW.order_id;
 SELECT image_object_key INTO k FROM products WHERE store_id=s AND id=NEW.product_id;
 NEW.image_object_key_snapshot=k;
 IF k IS NOT NULL THEN PERFORM pin_image_reference(s,k,'order_item',NEW.id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_order_image BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION snapshot_order_image();

CREATE FUNCTION track_archive_images() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text;
BEGIN
 IF NEW.content IS NOT NULL THEN
  FOR k IN SELECT DISTINCT m[1] FROM regexp_matches(convert_from(NEW.content,'UTF8'),'(stores/[0-9a-f-]{36}/products/[0-9a-f-]{36}\.(jpg|png|webp))','g') AS m LOOP
   PERFORM pin_image_reference(NEW.store_id,k,'archive',NEW.id);
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER track_archive_image_refs BEFORE INSERT OR UPDATE OF content ON merchant_archives FOR EACH ROW EXECUTE FUNCTION track_archive_images();

CREATE FUNCTION image_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'image history is append-only'; END $$;
CREATE TRIGGER protect_image_history BEFORE UPDATE OR DELETE ON image_reference_history FOR EACH ROW EXECUTE FUNCTION image_history_append_only();
CREATE TRIGGER protect_image_cleanup_audit BEFORE UPDATE OR DELETE ON image_cleanup_audit FOR EACH ROW EXECUTE FUNCTION image_history_append_only();
COMMIT;
