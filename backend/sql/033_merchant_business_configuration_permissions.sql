-- Permission repair for the isolated merchant business-settings update path.
-- Only the two configuration columns can be inserted; only configuration/updated_at updated.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stall_payment_app_limited') THEN
  GRANT INSERT (store_id,configuration), UPDATE (configuration,updated_at) ON public.store_delivery_rules TO stall_payment_app_limited;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sbx04_app_least') THEN
  GRANT INSERT (store_id,configuration), UPDATE (configuration,updated_at) ON public.store_delivery_rules TO sbx04_app_least;
 END IF;
END $$;
