ALTER TABLE public.customer_accounts ADD COLUMN IF NOT EXISTS avatar_photo_key text;
GRANT UPDATE (avatar_photo_key) ON public.customer_accounts TO stall_payment_app_limited;
