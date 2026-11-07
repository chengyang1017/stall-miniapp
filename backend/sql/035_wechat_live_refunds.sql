-- Live WeChat Pay direct-merchant refund ledger: money moves only after provider confirmation.
-- Review permissions and apply to an isolated PostgreSQL database first.
BEGIN;
CREATE TABLE wechat_live_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES stores(id),
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 request_key text NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{20,100}$'),
 out_refund_no text NOT NULL UNIQUE CHECK(out_refund_no ~ '^wr[a-f0-9]{32}$'),
 amount_cents bigint NOT NULL CHECK(amount_cents > 0),
 original_total_cents bigint NOT NULL CHECK(original_total_cents >= amount_cents),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 80),
 requested_by text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN
  ('pending','submitting','unknown','processing','succeeded','abnormal','closed','review')),
 provider_refund_id text,
 provider_status text,
 last_error text,
 claimed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(store_id,request_key),
 FOREIGN KEY(store_id,order_id) REFERENCES orders(store_id,id)
);
CREATE INDEX wechat_live_refunds_order_idx ON wechat_live_refunds(order_id,created_at DESC);
CREATE TABLE wechat_live_refund_events (
 provider_event_id text PRIMARY KEY,
 refund_id uuid NOT NULL REFERENCES wechat_live_refunds(id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK(event_type IN ('REFUND.SUCCESS','REFUND.CLOSED','REFUND.ABNORMAL')),
 observed_status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON wechat_live_refunds,wechat_live_refund_events FROM PUBLIC;
-- IMPORTANT: Authorize only the approved production runtime role; never grant to PUBLIC.
COMMIT;
