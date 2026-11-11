-- Owner-issued, single-use merchant invitations. Review migration ledger before applying.
BEGIN;
CREATE TABLE IF NOT EXISTS merchant_member_invitations (
  token_hash char(64) PRIMARY KEY,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  created_by text NOT NULL,
  role text NOT NULL DEFAULT 'manager' CHECK (role IN ('manager')),
  expires_at timestamptz NOT NULL,
  redeemed_by text,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((redeemed_by IS NULL) = (redeemed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS merchant_member_invites_scope_idx
  ON merchant_member_invitations(merchant_id,expires_at);
COMMIT;
