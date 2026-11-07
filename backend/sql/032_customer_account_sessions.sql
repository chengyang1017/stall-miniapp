-- Isolated staging customer-only sessions for independently verified phone login.
-- Additive schema only; never share a legacy WeChat auth session token.
CREATE TABLE IF NOT EXISTS public.customer_account_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CONSTRAINT customer_account_sessions_expiry CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS customer_account_sessions_account_idx ON public.customer_account_sessions(account_id);
CREATE INDEX IF NOT EXISTS customer_account_sessions_expiry_idx ON public.customer_account_sessions(expires_at) WHERE revoked_at IS NULL;
REVOKE ALL ON public.customer_account_sessions FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stall_payment_app_limited') THEN
  GRANT SELECT (account_id,token_hash,expires_at,revoked_at), INSERT (account_id,token_hash,expires_at), UPDATE (revoked_at)
  ON public.customer_account_sessions TO stall_payment_app_limited;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sbx04_app_least') THEN
  GRANT SELECT (account_id,token_hash,expires_at,revoked_at), INSERT (account_id,token_hash,expires_at), UPDATE (revoked_at)
  ON public.customer_account_sessions TO sbx04_app_least;
 END IF;
END $$;
