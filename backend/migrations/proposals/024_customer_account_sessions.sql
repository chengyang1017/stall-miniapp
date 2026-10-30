-- PROPOSAL ONLY. Do not run in live or shared databases.
-- Isolated staging only after review of 023 identity groundwork, grants and rollback.
-- Do not store bearer tokens in plaintext or attach them to legacy WeChat subjects.
BEGIN;
CREATE TABLE IF NOT EXISTS public.customer_account_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS customer_account_sessions_account_idx ON public.customer_account_sessions(account_id);
CREATE INDEX IF NOT EXISTS customer_account_sessions_expiry_idx ON public.customer_account_sessions(expires_at) WHERE revoked_at IS NULL;
REVOKE ALL ON public.customer_account_sessions FROM PUBLIC;
-- DBA must review narrowly scoped SELECT/INSERT/UPDATE grants for actual staging runtime role.
COMMIT;
