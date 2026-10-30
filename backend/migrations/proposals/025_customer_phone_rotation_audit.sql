-- PROPOSAL ONLY: run only after 023 and 024 in a separately reviewed isolated DB.
-- Audit contains ONLY last four digits, never full old/new phone values.
BEGIN;
CREATE TABLE IF NOT EXISTS public.customer_phone_rotation_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
 old_phone_tail text NOT NULL CHECK (old_phone_tail ~ '^[0-9]{4}$'),
 new_phone_tail text NOT NULL CHECK (new_phone_tail ~ '^[0-9]{4}$'),
 event_type text NOT NULL CHECK (event_type='phone_rotated'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_phone_rotation_audit_account_idx ON public.customer_phone_rotation_audit(account_id,created_at);
REVOKE ALL ON public.customer_phone_rotation_audit FROM PUBLIC;
-- Apply least-privilege grants to the verified customer backend role only after DBA review.
-- Never store authorization proofs or raw phone numbers in this audit table.
COMMIT;
