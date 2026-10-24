-- Merchant product description and timed discounts. Execute after existing migrations.
BEGIN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_price_cents integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_start timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_end timestamptz;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_discount_valid;
ALTER TABLE products ADD CONSTRAINT products_discount_valid CHECK (discount_price_cents IS NULL OR (discount_price_cents >= 0 AND discount_price_cents < price_cents));
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_discount_window_valid;
ALTER TABLE products ADD CONSTRAINT products_discount_window_valid CHECK (discount_start IS NULL OR discount_end IS NULL OR discount_start < discount_end);
COMMIT;
