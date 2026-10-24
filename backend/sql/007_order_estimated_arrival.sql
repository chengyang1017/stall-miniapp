-- PHASE37_ETA: idempotent additive migration. Apply after 006.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_arrival TEXT;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_estimated_arrival_length;
ALTER TABLE orders ADD CONSTRAINT orders_estimated_arrival_length CHECK (estimated_arrival IS NULL OR char_length(estimated_arrival) <= 60);
