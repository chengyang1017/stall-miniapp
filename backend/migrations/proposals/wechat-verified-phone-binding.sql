-- Execute only in an isolated, reviewed staging database after 023.
-- Phone numbers must originate from verified WeChat server responses.
BEGIN;
-- The first verified WeChat login creates the permanent customer account.
GRANT INSERT ON public.customer_accounts TO stall_payment_app_limited;
GRANT SELECT (id,nickname,avatar_style) ON public.customer_accounts TO stall_payment_app_limited;
GRANT SELECT (account_id,provider,provider_subject) ON public.customer_login_identities TO stall_payment_app_limited;
GRANT INSERT (account_id,provider,provider_subject,verified_at) ON public.customer_login_identities TO stall_payment_app_limited;
GRANT SELECT (account_id,phone_e164,verified_at) ON public.customer_verified_phones TO stall_payment_app_limited;
GRANT INSERT (account_id,phone_e164,verified_at) ON public.customer_verified_phones TO stall_payment_app_limited;
GRANT UPDATE (phone_e164,verified_at) ON public.customer_verified_phones TO stall_payment_app_limited;
-- Requires reviewed additive migrations 024_customer_cloud_profile and 025_customer_avatar_style.
-- Existing profile column-specific UPDATE grants are defined in those migrations.
-- Do not grant merchant roles or access to legacy auth_sessions here.
COMMIT;
