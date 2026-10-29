ALTER TABLE public.customer_accounts ADD COLUMN IF NOT EXISTS avatar_style text NOT NULL DEFAULT 'violet' CHECK (avatar_style IN ('violet','blue','green','peach'));
GRANT UPDATE (avatar_style) ON public.customer_accounts TO stall_payment_app_limited;
