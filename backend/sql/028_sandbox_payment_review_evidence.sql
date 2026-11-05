-- Isolated Sandbox only. Append-only provider review evidence.
BEGIN;
CREATE TABLE sandbox_payment_review_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 attempt_id uuid NOT NULL REFERENCES sandbox_payment_attempts(id) ON DELETE RESTRICT,
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 reviewed_by text NOT NULL CHECK(length(reviewed_by) BETWEEN 1 AND 256),
 session_id text NOT NULL CHECK(session_id LIKE 'cs_test_%'),
 document_text text NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX sandbox_review_evidence_recent ON sandbox_payment_review_evidence(attempt_id,created_at DESC,id DESC);
-- Reuse immutable trigger: not even privileged application updates can erase the audit.
CREATE TRIGGER sandbox_review_evidence_immutable BEFORE UPDATE OR DELETE ON sandbox_payment_review_evidence
 FOR EACH ROW EXECUTE FUNCTION sandbox_receipt_immutable();
CREATE TRIGGER sandbox_review_evidence_no_truncate BEFORE TRUNCATE ON sandbox_payment_review_evidence
 FOR EACH STATEMENT EXECUTE FUNCTION sandbox_receipt_immutable();
REVOKE ALL ON sandbox_payment_review_evidence FROM PUBLIC;
COMMIT;
