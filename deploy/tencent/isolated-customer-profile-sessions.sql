-- TENCENT ISOLATED DRILL ONLY, NOT THE ORIGINAL 024/025/026/032.
-- COS-backed avatar keys; no avatar bytea fallback and no staging-specific grants.
-- Must run AFTER original 023 and BEFORE payment 034.
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'stall_tencent_drill' THEN
  RAISE EXCEPTION 'isolated_tencent_drill_only';
 END IF;
 IF to_regclass('public.customer_accounts') IS NULL THEN
  RAISE EXCEPTION 'customer_identity_023_required';
 END IF;
 IF to_regclass('public.customer_account_sessions') IS NOT NULL THEN
  RAISE EXCEPTION 'existing_customer_session_schema_requires_manual_review';
 END IF;
END $guard$;
ALTER TABLE public.customer_accounts
 ADD COLUMN nickname text NOT NULL DEFAULT '';
ALTER TABLE public.customer_accounts
 ADD CONSTRAINT customer_accounts_nickname_length CHECK (char_length(nickname)<=30);
ALTER TABLE public.customer_accounts
 ADD COLUMN avatar_style text NOT NULL DEFAULT 'violet'
 CHECK (avatar_style IN ('violet','blue','green','peach'));
ALTER TABLE public.customer_accounts
 ADD COLUMN avatar_photo_key text;
CREATE TABLE public.customer_account_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CONSTRAINT customer_account_sessions_expiry CHECK (expires_at > created_at)
);
CREATE INDEX customer_account_sessions_account_idx ON public.customer_account_sessions(account_id);
CREATE INDEX customer_account_sessions_expiry_idx
 ON public.customer_account_sessions(expires_at) WHERE revoked_at IS NULL;
REVOKE ALL ON public.customer_account_sessions FROM PUBLIC;
-- Runtime permissions are reviewed and applied separately in the drill.
-- Never copy test-role GRANT statements or synthesize original 024-026/032 ledger.
COMMIT;
