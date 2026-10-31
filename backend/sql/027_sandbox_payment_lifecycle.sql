-- Isolated Sandbox only. Apply after 001-026 using the reviewed migration process.
-- No grants or environment activation are performed by this migration.
BEGIN;
CREATE TABLE sandbox_payment_environment (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 instance_id uuid NOT NULL UNIQUE,
 database_name text NOT NULL,
 application_role text NOT NULL,
 enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE sandbox_payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 provider text NOT NULL DEFAULT 'stripe:sandbox' CHECK(provider='stripe:sandbox'),
 channel text NOT NULL CHECK(channel IN ('card','alipay','wechat_pay')),
 actual_channel text CHECK(actual_channel IN ('card','alipay','wechat_pay')),
 failure_code text CHECK(failure_code='payment_failed'),
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 currency text NOT NULL CHECK(currency='CNY'),
 request_key text NOT NULL UNIQUE,
 provider_options jsonb,
 status text NOT NULL DEFAULT 'creating' CHECK(status IN ('creating','open','processing','succeeded','failed','cancelled','expired','refund_required','review')),
 session_id text UNIQUE CHECK(session_id LIKE 'cs_test_%'),
 checkout_url text,
 payment_intent_id text,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX sandbox_payment_one_active_order ON sandbox_payment_attempts(order_id)
 WHERE status IN ('creating','open','processing','review');
CREATE INDEX sandbox_payment_recovery ON sandbox_payment_attempts(updated_at,id)
 WHERE status IN ('creating','open','processing');
CREATE TABLE sandbox_payment_notifications (
 event_id text PRIMARY KEY,
 event_type text NOT NULL,
 session_id text NOT NULL,
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 provider_created_at timestamptz,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE sandbox_payment_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 attempt_id uuid NOT NULL UNIQUE REFERENCES sandbox_payment_attempts(id) ON DELETE RESTRICT,
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 document_text text NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION sandbox_receipt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Sandbox receipt is immutable'; END;
$$;
CREATE TRIGGER sandbox_receipt_immutable BEFORE UPDATE OR DELETE ON sandbox_payment_receipts
 FOR EACH ROW EXECUTE FUNCTION sandbox_receipt_immutable();
CREATE TRIGGER sandbox_receipt_no_truncate BEFORE TRUNCATE ON sandbox_payment_receipts
 FOR EACH STATEMENT EXECUTE FUNCTION sandbox_receipt_immutable();

-- Extend the existing durable refund queue for multiple partial refunds.
ALTER TABLE stripe_test_refund_jobs DROP CONSTRAINT stripe_test_refund_jobs_payment_event_id_key;
ALTER TABLE stripe_test_refund_jobs DROP CONSTRAINT stripe_test_refund_jobs_checkout_session_id_key;
-- 022 used an anonymous lease CHECK; find only that exact structural check.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='stripe_test_refund_jobs'::regclass
 AND contype='c' AND pg_get_constraintdef(oid) LIKE '%processing%lease_token%lease_expires_at%'
 LOOP EXECUTE format('ALTER TABLE stripe_test_refund_jobs DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE stripe_test_refund_jobs ADD COLUMN kind text NOT NULL DEFAULT 'compensation' CHECK(kind IN ('compensation','merchant'));
ALTER TABLE stripe_test_refund_jobs ADD COLUMN request_key text;
ALTER TABLE stripe_test_refund_jobs ADD COLUMN requested_by text;
ALTER TABLE stripe_test_refund_jobs ADD COLUMN payment_amount_cents bigint;
ALTER TABLE stripe_test_refund_jobs ADD COLUMN payment_intent_id text;
ALTER TABLE stripe_test_refund_jobs ADD COLUMN provider_status text;
ALTER TABLE stripe_test_refund_jobs ADD CONSTRAINT sandbox_refund_request_key UNIQUE(request_key);
ALTER TABLE stripe_test_refund_jobs ADD CONSTRAINT sandbox_refund_lease CHECK (
 (status='processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR
 (status='submitted' AND ((lease_token IS NULL AND lease_expires_at IS NULL) OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))) OR
 (status NOT IN ('processing','submitted') AND lease_token IS NULL AND lease_expires_at IS NULL));
CREATE UNIQUE INDEX sandbox_refund_one_compensation ON stripe_test_refund_jobs(payment_event_id) WHERE kind='compensation';
REVOKE ALL ON sandbox_payment_environment,sandbox_payment_attempts,sandbox_payment_notifications,sandbox_payment_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION sandbox_receipt_immutable() FROM PUBLIC;
COMMIT;
