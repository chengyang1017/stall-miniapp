-- DBA-only enrollment template. NOT run by migrate-staging or the API.
-- Execute only after separately authorizing and verifying the exact target branch.
BEGIN;
CREATE SCHEMA staging_control;
CREATE TABLE staging_control.deployment_identity (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 deployment_id uuid NOT NULL UNIQUE,
 instance_id uuid NOT NULL UNIQUE,
 branch_id text NOT NULL,
 database_name text NOT NULL CHECK(database_name=current_database()),
 environment text NOT NULL CHECK(environment='staging'),
 test_only boolean NOT NULL DEFAULT false
);
REVOKE ALL ON SCHEMA staging_control FROM PUBLIC;
REVOKE ALL ON staging_control.deployment_identity FROM PUBLIC;
-- Insert with a parameterized DBA client, after reviewing all non-secret values:
-- INSERT INTO staging_control.deployment_identity(deployment_id,instance_id,branch_id,database_name,environment,test_only)
-- VALUES($1,$2,$3,$4,'staging',$5);
-- DBA separately grants USAGE/SELECT (and grant option where appropriate) to the
-- migration role. Never grant ordinary app UPDATE/INSERT/DELETE on this anchor.
COMMIT;
