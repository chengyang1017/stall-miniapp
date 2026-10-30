-- Proposal only. Do not deploy without approved SMS provider / rate limiting.
CREATE TABLE IF NOT EXISTS customer_sms_challenges (
 phone_e164 text PRIMARY KEY CHECK(phone_e164 ~ '^\\+861[3-9][0-9]{9}$'),
 code_hash char(64) NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON customer_sms_challenges FROM PUBLIC;
-- Provisioning must atomically enforce phone/IP quotas before writing a new hash.
-- Never use this table without the external provider and server-side quotas.
