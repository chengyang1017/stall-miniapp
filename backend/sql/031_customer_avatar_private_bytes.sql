-- Private, account-scoped avatar bytes for isolated staging without external S3 configuration.
-- The route validates authenticated WeChat identity before reading or writing this table.
CREATE TABLE IF NOT EXISTS public.customer_avatar_photos (
 account_id uuid PRIMARY KEY REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
 image_bytes bytea NOT NULL,
 mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT customer_avatar_photo_size CHECK (octet_length(image_bytes) BETWEEN 100 AND 524288)
);
REVOKE ALL ON public.customer_avatar_photos FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_avatar_photos TO stall_payment_app_limited;
-- The dedicated SBX04 acceptance service uses a different least-privilege role.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_avatar_photos TO sbx04_app_least;
