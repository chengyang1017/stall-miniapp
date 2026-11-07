-- Non-mutating-by-default refund status reconciliation support.
-- All remote operations performed by the optional worker are GET-only.
BEGIN;
ALTER TABLE wechat_live_refunds
 ADD COLUMN reconcile_next_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ADD COLUMN reconcile_attempts integer NOT NULL DEFAULT 0 CHECK(reconcile_attempts>=0),
 ADD COLUMN reconcile_lease_token uuid,
 ADD COLUMN reconcile_lease_until timestamptz,
 ADD CONSTRAINT wechat_live_refund_lease_pair CHECK
  ((reconcile_lease_token IS NULL)=(reconcile_lease_until IS NULL));
CREATE INDEX wechat_live_refund_reconcile_idx ON wechat_live_refunds(reconcile_next_at,id)
 WHERE status IN ('pending','submitting','unknown','processing','review','abnormal');
COMMIT;
