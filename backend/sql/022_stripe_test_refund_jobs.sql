-- Stripe sandbox refund reconciliation state. Apply ONLY to isolated test branch.
BEGIN;
CREATE TABLE IF NOT EXISTS stripe_test_refund_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_event_id uuid NOT NULL UNIQUE REFERENCES payment_events(id) ON DELETE RESTRICT,
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 checkout_session_id text NOT NULL UNIQUE CHECK (checkout_session_id LIKE 'cs_test_%'),
 amount_cents bigint NOT NULL CHECK (amount_cents > 0),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','submitted','succeeded','review')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
 lease_token uuid,
 lease_expires_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 refund_id text,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='processing')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
 CHECK (status NOT IN ('submitted','succeeded') OR refund_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS stripe_test_refund_jobs_due_idx
 ON stripe_test_refund_jobs(next_attempt_at,id) WHERE status IN ('pending','processing');
REVOKE ALL ON stripe_test_refund_jobs FROM PUBLIC;
COMMIT;
