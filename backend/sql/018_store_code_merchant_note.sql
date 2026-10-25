-- Phase 28. Source only; apply after 017, do not execute automatically.
BEGIN;
ALTER TABLE orders ADD COLUMN merchant_note text NOT NULL DEFAULT '' CHECK (char_length(merchant_note)<=1000);
ALTER TABLE orders ADD COLUMN merchant_note_version integer NOT NULL DEFAULT 1 CHECK (merchant_note_version>0);
CREATE TABLE store_miniapp_codes (
 store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE RESTRICT,
 app_id text NOT NULL,
 png_bytes bytea NOT NULL CHECK (octet_length(png_bytes) BETWEEN 8 AND 524288),
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
COMMIT;
