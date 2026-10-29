-- Phase 23: additive identity groundwork. No automatic account merging.
-- Apply to isolated staging first; this migration does not change existing auth or orders.
BEGIN;
CREATE TABLE IF NOT EXISTS customer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer_login_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('wechat','phone')),
  provider_subject text NOT NULL CHECK (length(provider_subject) BETWEEN 1 AND 256),
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider,provider_subject),
  UNIQUE (account_id,provider)
);
CREATE INDEX IF NOT EXISTS customer_login_identities_account_idx ON customer_login_identities(account_id);
-- Phone number is stored in E.164 form only after verification; never derived
-- from a WeChat openid or from unverified user input.
CREATE TABLE IF NOT EXISTS customer_verified_phones (
  account_id uuid PRIMARY KEY REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  phone_e164 text NOT NULL UNIQUE CHECK (phone_e164 ~ '^\\+86(1[3-9][0-9]{9})$'),
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON customer_accounts,customer_login_identities,customer_verified_phones FROM PUBLIC;
COMMIT;
