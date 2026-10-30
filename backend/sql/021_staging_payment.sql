-- Apply after 020, separately authorized. No environment marker or tester is enabled here.
BEGIN;
ALTER TABLE orders ADD COLUMN payment_source text;
ALTER TABLE orders ADD COLUMN simulation_instance_id uuid;
ALTER TABLE orders ADD COLUMN paid_at timestamptz;
ALTER TABLE orders ADD CONSTRAINT orders_simulation_identity CHECK
 ((payment_source IS DISTINCT FROM 'staging_simulated' AND simulation_instance_id IS NULL)
 OR (payment_source IS NOT DISTINCT FROM 'staging_simulated' AND simulation_instance_id IS NOT NULL AND paid_at IS NOT NULL));
CREATE TABLE staging_payment_environment (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 instance_id uuid NOT NULL UNIQUE,
 database_name text NOT NULL CHECK(length(database_name)>0),
 environment text NOT NULL CHECK(environment='staging'),
 enabled boolean NOT NULL DEFAULT false,
 lock_key boolean NOT NULL DEFAULT true CHECK(lock_key)
);
CREATE TABLE staging_payment_testers (
 instance_id uuid NOT NULL REFERENCES staging_payment_environment(instance_id),
 store_id uuid NOT NULL REFERENCES stores(id),
 customer_subject text NOT NULL CHECK(customer_subject LIKE 'wx:%'),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 lock_key boolean NOT NULL DEFAULT true CHECK(lock_key),
 PRIMARY KEY(instance_id,store_id,customer_subject)
);
CREATE TABLE staging_payment_confirmations (
 order_id uuid PRIMARY KEY REFERENCES orders(id),
 store_id uuid NOT NULL REFERENCES stores(id),
 instance_id uuid NOT NULL REFERENCES staging_payment_environment(instance_id),
 actor_subject text NOT NULL,
 request_key uuid NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>=0),
 confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(store_id,order_id) REFERENCES orders(store_id,id),
 FOREIGN KEY(instance_id,store_id,actor_subject) REFERENCES staging_payment_testers(instance_id,store_id,customer_subject),
 UNIQUE(store_id,actor_subject,request_key)
);
REVOKE ALL ON staging_payment_environment,staging_payment_testers,staging_payment_confirmations FROM PUBLIC;
CREATE TABLE staging_payment_migration_audits (
 filename text PRIMARY KEY,
 sha256 char(64) NOT NULL,
 deployment_id uuid NOT NULL,
 instance_id uuid NOT NULL,
 branch_id text NOT NULL,
 pre_catalog_sha256 char(64) NOT NULL,
 post_catalog_sha256 char(64) NOT NULL,
 applied_by text NOT NULL DEFAULT current_user,
 applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON staging_payment_migration_audits FROM PUBLIC;
COMMIT;
