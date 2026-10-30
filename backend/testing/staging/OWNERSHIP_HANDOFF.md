# Staging Payment Migration: Ownership and Rollout Gate

2026-10-29. Scope: isolated Neon branch br-nameless-block-b57fm06l only. This is a deployment checklist, not authorization to apply 021.

## Confirmed
- Original 001–020 ledger matches historical SQL, including LF/CRLF variants. Do not rewrite checksums.
- categories.icon_key exists and is not in the project ledger; record this intentional schema delta in pre021CatalogSha256.
- orders, stall_schema_migrations and other original tables are owned by neondb_owner.
- Three *_limited roles are LOGIN without SUPERUSER, CREATEROLE, CREATEDB or BYPASSRLS, but have no proven application grants or configured credentials.
- The three earlier Neon API-created payment roles have excessive management privileges and MUST NOT be used.
- staging_control.deployment_identity and 021 payment tables do not exist.
- Reviewed staging deployment profiles list is empty.

## Blocking design decision
PostgreSQL ALTER TABLE requires ownership, not ordinary UPDATE or REFERENCES grants. The owner neondb_owner has management privileges. Do not grant owner-role membership to limited payment roles or weaken production checks.
Choose a reviewed design: (A) a dedicated DDL owner with narrowly transferred ownership of necessary existing objects, verifying triggers, dependency ownership and inherited privileges; or (B) a DBA-mediated, transactionally audited DDL procedure, requiring an explicit adaptation of the current run021 preflight and role model. Do not execute raw 021 independently of the audit and ledger.

## Read-only preflight
SELECT current_database(), current_user, to_regclass('staging_control.deployment_identity');
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('orders','stall_schema_migrations','inventory_reservations','payment_events') ORDER BY c.relname;
SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname LIKE 'stall_payment_%' ORDER BY rolname;
SELECT filename,sha256 FROM public.stall_schema_migrations ORDER BY filename;

## Acceptance sequence
1. Review isolated Neon branch and safe login-role credentials without publishing secrets.
2. Choose DDL ownership method and approve specific object permissions. Verify no application role owns existing objects or inherits admin privileges.
3. Confirm distinct Render test service ID and correct backend build/start working directory with auto-deploy disabled; never point it to Neon primary.
4. Approve staging-deployments.json with accurate hosts, role names, branch ID, service ID and actual pre021CatalogSha256.
5. Privileged operator enrolls staging_control.deployment_identity; application can read but not change it.
6. Execute 021 as one audited and reversible-on-failure transaction, including ledger and minimum grants; do not pre-mark 021 as applied.
7. Enable test subjects only; test paid, replay, failure, expiry, inventory and cancellation, then confirm customer and merchant experience.
8. Verify original Render service and Neon primary remain unchanged.

DO NOT deploy current branch to main before review, turn on simulated payments on the existing merchant API, or use privileged Neon API-created payment roles.
