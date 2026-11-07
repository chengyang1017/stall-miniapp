-- Dedicated production JSAPI payment intent; never reuse Stripe sandbox identities.
BEGIN;
CREATE TABLE wechat_live_prepays (
 order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
 store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
 mchid text NOT NULL CHECK (mchid ~ '^[0-9]{6,32}$'),
 out_trade_no text NOT NULL UNIQUE CHECK (out_trade_no ~ '^[a-f0-9]{32}$'),
 amount_cents bigint NOT NULL CHECK (amount_cents > 0),
 prepay_id text NOT NULL CHECK (length(prepay_id) BETWEEN 8 AND 128),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(store_id,order_id)
);
CREATE INDEX wechat_live_prepays_expires_idx ON wechat_live_prepays(expires_at);
-- Only the production runtime account should receive SELECT/INSERT.
-- Apply grants through reviewed production role provisioning (not PUBLIC).
COMMIT;
