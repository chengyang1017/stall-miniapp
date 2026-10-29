-- Apply only after verified customer account groundwork. Additive profile storage.
ALTER TABLE public.customer_accounts ADD COLUMN IF NOT EXISTS nickname text NOT NULL DEFAULT '';
ALTER TABLE public.customer_accounts ADD CONSTRAINT customer_accounts_nickname_length CHECK (char_length(nickname) <= 30);
GRANT UPDATE (nickname, updated_at) ON public.customer_accounts TO stall_payment_app_limited;
