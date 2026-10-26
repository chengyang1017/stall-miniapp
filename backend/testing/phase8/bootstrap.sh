#!/bin/sh
# Docker first-start hook ONLY. Never source/run this during B0 static checks.
set -eu
[ "${STALL_PHASE8_BOOTSTRAP_CONFIRM:-}" = 'CREATE_NEW_PHASE8_INSTANCE' ] || exit 10
[ "${POSTGRES_DB:-}" = 'stall_test_phase8' ] || exit 11
[ "${POSTGRES_USER:-}" = 'stall_test_bootstrap' ] || exit 12
[ "${PG_MAJOR:-}" = '16' ] || exit 13
printf '%s' "${STALL_PHASE8_INSTANCE_ID:-}" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' || exit 14
# No shell tracing, password arguments or credential logging.
PHASE8_ADMIN_PASSWORD=$(cat /run/secrets/phase8_admin_password)
PHASE8_MIGRATOR_PASSWORD=$(cat /run/secrets/phase8_migrator_password)
PHASE8_APP_PASSWORD=$(cat /run/secrets/phase8_app_password)
PHASE8_OBSERVER_PASSWORD=$(cat /run/secrets/phase8_observer_password)
for phase8_password in "$PHASE8_ADMIN_PASSWORD" "$PHASE8_MIGRATOR_PASSWORD" "$PHASE8_APP_PASSWORD" "$PHASE8_OBSERVER_PASSWORD"; do
  [ "${#phase8_password}" = 64 ] || exit 15
  case "$phase8_password" in *[!0-9a-f]*) exit 16 ;; esac
done
[ "$PHASE8_ADMIN_PASSWORD" != "$PHASE8_MIGRATOR_PASSWORD" ] || exit 17
[ "$PHASE8_ADMIN_PASSWORD" != "$PHASE8_APP_PASSWORD" ] || exit 17
[ "$PHASE8_MIGRATOR_PASSWORD" != "$PHASE8_APP_PASSWORD" ] || exit 17
[ "$PHASE8_OBSERVER_PASSWORD" != "$PHASE8_ADMIN_PASSWORD" ] && [ "$PHASE8_OBSERVER_PASSWORD" != "$PHASE8_MIGRATOR_PASSWORD" ] && [ "$PHASE8_OBSERVER_PASSWORD" != "$PHASE8_APP_PASSWORD" ] || exit 17
export PHASE8_MIGRATOR_PASSWORD PHASE8_APP_PASSWORD PHASE8_OBSERVER_PASSWORD
export PGPASSWORD="$PHASE8_ADMIN_PASSWORD"
# -X ignores user psqlrc; secrets are read via getenv, not argv or interpolation.
unset PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE PGOPTIONS PGPASSFILE PGUSER PGDATABASE
psql -X --no-password --host=/var/run/postgresql --port=5432 --username stall_test_bootstrap --dbname stall_test_phase8 --set ON_ERROR_STOP=1 <<'SQL'
\getenv instance_id STALL_PHASE8_INSTANCE_ID
\getenv migrator_password PHASE8_MIGRATOR_PASSWORD
\getenv app_password PHASE8_APP_PASSWORD
\getenv observer_password PHASE8_OBSERVER_PASSWORD
BEGIN;
DO $$ BEGIN
 IF current_database()<>'stall_test_phase8' OR current_user<>'stall_test_bootstrap'
    OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
    OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='phase8_control')
    OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace)
    OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace)
    OR EXISTS(SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace)
    OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%')
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('stall_test_migrator','stall_test_app','stall_test_observer'))
 THEN RAISE EXCEPTION 'phase8_bootstrap_refused'; END IF;
END $$;
CREATE ROLE stall_test_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
CREATE ROLE stall_test_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
CREATE ROLE stall_test_observer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'observer_password';
REVOKE ALL ON DATABASE stall_test_phase8 FROM PUBLIC;
GRANT CONNECT ON DATABASE stall_test_phase8 TO stall_test_migrator,stall_test_app,stall_test_observer;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO stall_test_migrator;
GRANT USAGE ON SCHEMA public TO stall_test_app,stall_test_observer;
CREATE SCHEMA phase8_control AUTHORIZATION stall_test_bootstrap;
CREATE TABLE phase8_control.instance (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 instance_id uuid NOT NULL,
 schema_state text NOT NULL CHECK(schema_state IN ('bootstrap','initializing','ready','failed')),
 manifest_sha256 text,
  schema_sha256 text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO phase8_control.instance(instance_id,schema_state) VALUES(:'instance_id'::uuid,'bootstrap');
REVOKE ALL ON SCHEMA phase8_control FROM PUBLIC;
REVOKE ALL ON phase8_control.instance FROM PUBLIC;
GRANT USAGE ON SCHEMA phase8_control TO stall_test_migrator,stall_test_app,stall_test_observer;
GRANT CREATE ON SCHEMA phase8_control TO stall_test_migrator;
GRANT SELECT ON phase8_control.instance TO stall_test_migrator,stall_test_app,stall_test_observer;
GRANT UPDATE(schema_state,manifest_sha256,schema_sha256) ON phase8_control.instance TO stall_test_migrator;
COMMIT;
SQL
unset PGPASSWORD PHASE8_ADMIN_PASSWORD PHASE8_MIGRATOR_PASSWORD PHASE8_APP_PASSWORD PHASE8_OBSERVER_PASSWORD phase8_password
printf '%s\n' 'Phase8 bootstrap complete; business migrations NOT initialized.'
