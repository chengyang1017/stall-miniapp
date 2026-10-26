#!/bin/sh
# Validate BEFORE the image's entrypoint creates any database/files. Source-only B0.
set -eu
[ "${STALL_PHASE8_BOOTSTRAP_CONFIRM:-}" = 'CREATE_NEW_PHASE8_INSTANCE' ] || exit 10
[ "${POSTGRES_DB:-}" = 'stall_test_phase8' ] || exit 11
[ "${POSTGRES_USER:-}" = 'stall_test_bootstrap' ] || exit 12
[ "${POSTGRES_PASSWORD_FILE:-}" = '/run/secrets/phase8_admin_password' ] || exit 13
[ "$#" = 11 ] && [ "$1" = postgres ] && [ "$2" = -c ] && [ "$3" = log_statement=none ] && [ "$4" = -c ] && [ "$5" = log_min_error_statement=panic ] && [ "$6" = -c ] && [ "$7" = log_parameter_max_length_on_error=0 ] && [ "$8" = -c ] && [ "$9" = 'listen_addresses=*' ] && [ "${10}" = -c ] && [ "${11}" = port=5432 ] || exit 18
[ "${PGDATA:-}" = /var/lib/postgresql/data ] || exit 19
[ "${POSTGRES_INITDB_ARGS:-}" = '--auth-host=scram-sha-256 --auth-local=scram-sha-256' ] || exit 19
[ "${POSTGRES_HOST_AUTH_METHOD:-}" = scram-sha-256 ] || exit 19
env | while IFS='=' read -r phase8_key phase8_value; do
  case "$phase8_key" in PGDATA|PG_MAJOR|PG_VERSION|PG_SHA256) ;; PG*|POSTGRES_PASSWORD) exit 19 ;; esac
done
printf '%s' "${STALL_PHASE8_LAUNCH_TOKEN:-}" | grep -Eq '^[a-f0-9]{64}$' || exit 20
printf '%s' "${STALL_PHASE8_IMAGE:-}" | grep -Eq '^postgres@sha256:[a-f0-9]{64}$' || exit 20
grep -Fx "INSTANCE=$STALL_PHASE8_INSTANCE_ID" /run/phase8-launch >/dev/null || exit 20
grep -Fx "TOKEN=$STALL_PHASE8_LAUNCH_TOKEN" /run/phase8-launch >/dev/null || exit 20
grep -Fx "IMAGE=$STALL_PHASE8_IMAGE" /run/phase8-launch >/dev/null || exit 20
[ -d "$PGDATA" ] && [ ! -L "$PGDATA" ] || exit 21
if grep -Fx 'MODE=first' /run/phase8-launch >/dev/null; then
  [ ! -e "$PGDATA/PG_VERSION" ] || exit 21
  [ -z "$(find "$PGDATA" -mindepth 1 -maxdepth 1 -print -quit)" ] || exit 21
elif grep -Fx 'MODE=restart' /run/phase8-launch >/dev/null; then
  [ -f "$PGDATA/PG_VERSION" ] || exit 22
  phase8_hostname=$(hostname)
  printf '%s' "$phase8_hostname" | grep -Eq '^[a-f0-9]{12,64}$' || exit 22
  grep -Eq "^CONTAINER=${phase8_hostname}[a-f0-9]*$" /run/phase8-launch || exit 22
else exit 20; fi
printf '%s' "${STALL_PHASE8_INSTANCE_ID:-}" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' || exit 14
phase8_a=$(cat /run/secrets/phase8_admin_password)
phase8_m=$(cat /run/secrets/phase8_migrator_password)
phase8_b=$(cat /run/secrets/phase8_app_password)
phase8_o=$(cat /run/secrets/phase8_observer_password)
for phase8_p in "$phase8_a" "$phase8_m" "$phase8_b" "$phase8_o"; do
  [ "${#phase8_p}" = 64 ] || exit 15
  case "$phase8_p" in *[!0-9a-f]*) exit 16 ;; esac
done
[ "$phase8_a" != "$phase8_m" ] && [ "$phase8_a" != "$phase8_b" ] && [ "$phase8_m" != "$phase8_b" ] || exit 17
[ "$phase8_o" != "$phase8_a" ] && [ "$phase8_o" != "$phase8_m" ] && [ "$phase8_o" != "$phase8_b" ] || exit 17
unset phase8_a phase8_m phase8_b phase8_o phase8_p
exec /usr/local/bin/docker-entrypoint.sh "$@"
