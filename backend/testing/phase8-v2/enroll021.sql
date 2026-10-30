-- FUTURE separately authorized DBA enrollment, AFTER verified 020 readiness.
-- psql variables instance_id and authorizer_password come from restricted material.
-- This file is never called by the runner and does not alter the 020 ledger/baseline.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'stall_test_phase8' OR current_user<>'stall_test_bootstrap'
 OR NOT EXISTS(SELECT 1 FROM phase8_control.instance WHERE singleton AND schema_state='ready')
 OR (SELECT count(*) FROM phase8_control.migrations)<>20
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='stall_test_authorizer')
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='staging_control')
 THEN RAISE EXCEPTION 'phase8_021_enrollment_refused'; END IF;
END $$;
-- Exact UUID equality is checked before any role or schema is created.
SELECT instance_id::text = :'instance_id' AND :'authorizer_password' ~ '^[a-f0-9]{64}$' AS identity_matches FROM phase8_control.instance WHERE singleton \gset
\if :identity_matches
CREATE ROLE stall_test_authorizer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'authorizer_password';
GRANT CONNECT ON DATABASE stall_test_phase8 TO stall_test_authorizer;
CREATE SCHEMA staging_control AUTHORIZATION stall_test_bootstrap;
CREATE TABLE staging_control.deployment_identity(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 deployment_id uuid NOT NULL,instance_id uuid NOT NULL,branch_id text NOT NULL,database_name text NOT NULL,
 environment text NOT NULL CHECK(environment='staging'),test_only boolean NOT NULL CHECK(test_only));
INSERT INTO staging_control.deployment_identity(deployment_id,instance_id,branch_id,database_name,environment,test_only)
 VALUES(:'instance_id',:'instance_id','br-phase8-'||:'instance_id',current_database(),'staging',true);
REVOKE ALL ON SCHEMA staging_control FROM PUBLIC;
REVOKE ALL ON staging_control.deployment_identity FROM PUBLIC;
GRANT USAGE ON SCHEMA staging_control TO stall_test_migrator WITH GRANT OPTION;
GRANT SELECT ON staging_control.deployment_identity TO stall_test_migrator WITH GRANT OPTION;
GRANT USAGE ON SCHEMA staging_control TO stall_test_observer,stall_test_authorizer;
GRANT SELECT ON staging_control.deployment_identity TO stall_test_observer,stall_test_authorizer;
-- Defer changes to old public/phase8_control schema ACLs until the upgrade
-- transaction has revalidated and locked the exact historical 020 baseline.
CREATE FUNCTION staging_control.authorize021_schema_usage() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $acl$
BEGIN
 IF session_user <> 'stall_test_migrator' OR current_database() <> 'stall_test_phase8' THEN RAISE EXCEPTION 'phase8_021_acl_refused'; END IF;
 GRANT USAGE ON SCHEMA public,phase8_control TO stall_test_authorizer;
END;
$acl$;
REVOKE ALL ON FUNCTION staging_control.authorize021_schema_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION staging_control.authorize021_schema_usage() TO stall_test_migrator;
COMMIT;
\else
ROLLBACK;
\quit 1
\endif
