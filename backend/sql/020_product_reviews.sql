-- Phase32 source only. Apply after 019; never executed by application startup.
BEGIN;
CREATE TABLE product_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES stores(id),
 product_id uuid NOT NULL,product_name text NOT NULL,
 order_id uuid NOT NULL,order_item_id uuid NOT NULL UNIQUE REFERENCES order_items(id),customer_subject text NOT NULL,purchase_receipt_ref text NOT NULL CHECK(char_length(purchase_receipt_ref) BETWEEN 1 AND 200),
 moderation_status text NOT NULL DEFAULT 'pending' CHECK(moderation_status IN ('pending','approved','rejected','hidden')),
 current_revision_id uuid,published_revision_id uuid,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 edit_count integer NOT NULL DEFAULT 0,withdrawn_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(store_id,id),FOREIGN KEY(store_id,order_id) REFERENCES orders(store_id,id)
);
CREATE TABLE product_review_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,review_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('review','reply')),actor_subject text NOT NULL,client_key uuid NOT NULL,fingerprint text NOT NULL,
 rating integer CHECK(rating BETWEEN 1 AND 5),content text NOT NULL CHECK(char_length(content)<=500),image_ids uuid[] NOT NULL DEFAULT '{}',
 moderation_status text NOT NULL DEFAULT 'pending' CHECK(moderation_status IN ('pending','approved','rejected','hidden')),
 safety_result jsonb NOT NULL DEFAULT '{"state":"pending","reason":"not_configured"}',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),moderated_at timestamptz,
 CHECK(cardinality(image_ids)<=3),CHECK(kind='review' AND rating IS NOT NULL OR kind='reply' AND rating IS NULL AND cardinality(image_ids)=0),
 CHECK(kind='review' OR char_length(content)>0),
 UNIQUE(store_id,actor_subject,client_key),UNIQUE(store_id,id),FOREIGN KEY(store_id,review_id) REFERENCES product_reviews(store_id,id)
);
ALTER TABLE product_reviews ADD FOREIGN KEY(store_id,current_revision_id) REFERENCES product_review_revisions(store_id,id);
ALTER TABLE product_reviews ADD FOREIGN KEY(store_id,published_revision_id) REFERENCES product_review_revisions(store_id,id);
CREATE TABLE product_review_replies (
 review_id uuid PRIMARY KEY,store_id uuid NOT NULL,current_revision_id uuid,published_revision_id uuid,version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(store_id,review_id) REFERENCES product_reviews(store_id,id),
 FOREIGN KEY(store_id,current_revision_id) REFERENCES product_review_revisions(store_id,id),
 FOREIGN KEY(store_id,published_revision_id) REFERENCES product_review_revisions(store_id,id)
);
CREATE TABLE product_review_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES stores(id),customer_subject text NOT NULL,
 order_item_id uuid NOT NULL REFERENCES order_items(id),bound_review_id uuid REFERENCES product_reviews(id),
 client_key uuid NOT NULL,storage_bucket text NOT NULL,staging_key text NOT NULL UNIQUE,object_key text NOT NULL UNIQUE,
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
 etag text,upload_state text NOT NULL DEFAULT 'issued' CHECK(upload_state IN ('issued','verified','expired','deleted')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),verified_at timestamptz,
 UNIQUE(store_id,customer_subject,client_key),FOREIGN KEY(store_id,bound_review_id) REFERENCES product_reviews(store_id,id)
);
CREATE TABLE product_review_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,review_id uuid NOT NULL,revision_id uuid NOT NULL,
 reporter_subject text NOT NULL,reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),resolution text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),resolved_at timestamptz,
 UNIQUE(review_id,revision_id,reporter_subject),FOREIGN KEY(store_id,review_id) REFERENCES product_reviews(store_id,id),
 FOREIGN KEY(store_id,revision_id) REFERENCES product_review_revisions(store_id,id)
);
-- Separate platform role; deliberately empty. Shop ownership never grants moderation.
CREATE TABLE product_review_moderators (external_subject text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE product_review_moderation_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,store_id uuid NOT NULL,review_id uuid NOT NULL REFERENCES product_reviews(id),
 revision_id uuid,actor_subject text NOT NULL,action text NOT NULL,reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX reviews_public ON product_reviews(store_id,product_id,created_at DESC,id DESC);
CREATE INDEX reviews_store_created ON product_reviews(store_id,created_at DESC,id DESC);
CREATE INDEX reviews_customer ON product_reviews(store_id,customer_subject,created_at DESC,id DESC);
CREATE INDEX reviews_pending ON product_review_revisions(store_id,moderation_status,created_at DESC,id DESC);
CREATE INDEX reviews_actor_rate ON product_review_revisions(actor_subject,created_at DESC);
CREATE INDEX review_reports_open ON product_review_reports(store_id,status,created_at DESC,id DESC);
CREATE INDEX review_image_expiry ON product_review_images(created_at) WHERE bound_review_id IS NULL;
CREATE TABLE product_review_image_cleanup_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,image_id uuid NOT NULL REFERENCES product_review_images(id),actor_subject text NOT NULL,result text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION preserve_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'review audit is append only'; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME<>'product_review_revisions' THEN RAISE EXCEPTION 'review audit is append only'; END IF;
 IF TG_TABLE_NAME='product_review_revisions' AND
  (NEW.id,NEW.store_id,NEW.kind,NEW.content,NEW.rating,NEW.image_ids,NEW.actor_subject,NEW.review_id,NEW.client_key,NEW.fingerprint,NEW.created_at)
  IS DISTINCT FROM (OLD.id,OLD.store_id,OLD.kind,OLD.content,OLD.rating,OLD.image_ids,OLD.actor_subject,OLD.review_id,OLD.client_key,OLD.fingerprint,OLD.created_at)
 THEN RAISE EXCEPTION 'revision payload is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER review_revision_audit BEFORE UPDATE OR DELETE ON product_review_revisions FOR EACH ROW EXECUTE FUNCTION preserve_review_audit();
CREATE TRIGGER review_moderation_audit BEFORE UPDATE OR DELETE ON product_review_moderation_events FOR EACH ROW EXECUTE FUNCTION preserve_review_audit();
CREATE TRIGGER review_image_cleanup_audit BEFORE UPDATE OR DELETE ON product_review_image_cleanup_events FOR EACH ROW EXECUTE FUNCTION preserve_review_audit();
COMMIT;
