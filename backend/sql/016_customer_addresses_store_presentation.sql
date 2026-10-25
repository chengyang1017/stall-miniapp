-- Source only; apply after 015. No local-device data import.
BEGIN;
CREATE TABLE customer_addresses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES stores(id),customer_subject text NOT NULL,
 receiver_name text NOT NULL CHECK(char_length(receiver_name) BETWEEN 1 AND 100),
 phone text NOT NULL CHECK(phone ~ '^1[3-9][0-9]{9}$'),
 area_id text NOT NULL CHECK(char_length(area_id) BETWEEN 1 AND 60),area_name text NOT NULL,
 detail text NOT NULL CHECK(char_length(detail) BETWEEN 1 AND 300),
 latitude double precision,longitude double precision,location_name text NOT NULL DEFAULT '',map_address text NOT NULL DEFAULT '',
 is_default boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,
 client_key uuid NOT NULL,create_payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),deleted_at timestamptz,
 UNIQUE(store_id,customer_subject,client_key),
 CHECK((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
CREATE UNIQUE INDEX customer_address_default ON customer_addresses(store_id,customer_subject) WHERE is_default AND deleted_at IS NULL;
CREATE INDEX customer_address_owner ON customer_addresses(store_id,customer_subject,created_at,id) WHERE deleted_at IS NULL;
ALTER TABLE image_reference_history DROP CONSTRAINT image_reference_history_reference_kind_check;
ALTER TABLE image_reference_history ADD CONSTRAINT image_reference_history_reference_kind_check CHECK(reference_kind IN ('product','draft','order','order_item','archive','backup','placeholder'));
-- Preserve any already-present server configuration references; never infer device paths.
INSERT INTO stored_images(store_id,object_key,kind,source,upload_state,ever_referenced,retention_hold)
 SELECT store_id,configuration->>'placeholderImageKey','product','legacy','unknown',true,true FROM store_delivery_rules WHERE coalesce(configuration->>'placeholderImageKey','')<>'' ON CONFLICT(object_key) DO NOTHING;
SELECT pin_image_reference(store_id,configuration->>'placeholderImageKey','placeholder',store_id) FROM store_delivery_rules WHERE coalesce(configuration->>'placeholderImageKey','')<>'';
CREATE FUNCTION track_store_placeholder_image() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text;
BEGIN
 k=NEW.configuration->>'placeholderImageKey';
 IF k IS NOT NULL AND k<>'' THEN
  IF k NOT LIKE 'stores/'||NEW.store_id::text||'/products/%' THEN RAISE EXCEPTION 'placeholder_image_store_mismatch' USING ERRCODE='23514'; END IF;
  PERFORM pin_image_reference(NEW.store_id,k,'placeholder',NEW.store_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER store_placeholder_reference BEFORE INSERT OR UPDATE OF configuration ON store_delivery_rules FOR EACH ROW EXECUTE FUNCTION track_store_placeholder_image();
COMMIT;
