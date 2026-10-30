-- Isolated test proposal. SMS provider and trusted-IP ingress are not yet wired.
-- Apply together with 026_customer_sms_challenges.sql after access review.
CREATE TABLE IF NOT EXISTS customer_sms_issue_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 phone_e164 text NOT NULL,
 ip_hash char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_sms_issue_phone_time ON customer_sms_issue_attempts(phone_e164,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_sms_issue_ip_time ON customer_sms_issue_attempts(ip_hash,created_at DESC);
REVOKE ALL ON customer_sms_issue_attempts FROM PUBLIC;
-- Scheduled retention cleanup required before production.

GRANT SELECT, INSERT ON customer_sms_issue_attempts TO stall_payment_app_limited;
GRANT USAGE, SELECT ON SEQUENCE customer_sms_issue_attempts_id_seq TO stall_payment_app_limited;
