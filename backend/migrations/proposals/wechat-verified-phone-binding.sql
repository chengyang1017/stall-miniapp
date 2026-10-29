-- Execute only in an isolated, reviewed staging database after 023.
-- Phone numbers must originate from verified WeChat server responses.
BEGIN;
GRANT SELECT (id) ON public.customer_accounts TO stall_payment_app_limited;
GRANT SELECT (account_id,provider,provider_subject) ON public.customer_login_identities TO stall_payment_app_limited;
GRANT SELECT (account_id,phone_e164,verified_at) ON public.customer_verified_phones TO stall_payment_app_limited;
GRANT INSERT (account_id,phone_e164,verified_at) ON public.customer_verified_phones TO stall_payment_app_limited;
GRANT UPDATE (phone_e164,verified_at) ON public.customer_verified_phones TO stall_payment_app_limited;
COMMIT;
