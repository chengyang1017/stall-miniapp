-- Append-only human follow-up notes for provider-verified abnormal collections.
-- These records are NOT provider refunds and NEVER alter order/payment/stock.
-- Apply only after schema 036 in a reviewed production database.
BEGIN;
CREATE TABLE wechat_abnormal_collection_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
 payment_event_id uuid NOT NULL REFERENCES payment_events(id) ON DELETE RESTRICT,
 request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{20,100}$'),
 action text NOT NULL CHECK (action IN
  ('provider_checked','support_contacted','refund_requested','escalated')),
 note text NOT NULL CHECK (length(note) BETWEEN 1 AND 500),
 actor_subject text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(store_id,request_key)
);
CREATE INDEX wechat_abnormal_reviews_event_idx ON
 wechat_abnormal_collection_reviews(payment_event_id,created_at DESC,id DESC);
REVOKE ALL ON wechat_abnormal_collection_reviews FROM PUBLIC;
-- Provision narrowly scoped SELECT/INSERT for the approved production runtime role.
-- Do not grant UPDATE or DELETE on this append-only audit table.
COMMIT;
