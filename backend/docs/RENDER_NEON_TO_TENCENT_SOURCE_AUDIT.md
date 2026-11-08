# Render → Tencent Cloud: source identification and safe inventory

The final live database source has **not** been verified from Render's saved
`DATABASE_URL`. Do **not** assume the Neon branch named `production` or the
branch with the most tables is the correct source. The sandbox Render service
must remain separate from the merchant production data.

## Read-only audit from the exact application environment

Run on the **approved source application's own secure shell** (or a locally
managed session with an authorized copy of the connection setting), not in a
public terminal recording. Do not send your connection string to a chat or
commit it to Git.

Set the following environment variables through the shell/secret store:

- `DATABASE_URL`: existing source connection secret, not a new connection
- `MIGRATION_EXPECTED_DB_HOST`: non-secret hostname from the intended Neon
  branch's compute endpoint, for example `ep-xxx.c-7.us-east-2.aws.neon.tech`
- `PG_SSL=true`
- `MIGRATION_SOURCE_READ_ONLY_AUDIT=YES`

From the `backend` directory run:

```sh
node scripts/migration-source-inventory.mjs
```

This script **does not export any data**. It requires an exact hostname match
before opening the connection; it starts a repeatable-read, **READ ONLY** SQL
transaction, runs bounded catalog checks and verifies all recorded migration
file checksums against the checked-out repository. The output includes a
truncated hash of the host, the role/database name, installed/missing migrations,
**exact per-table row counts** (bounded to 200 public tables), a SHA256 digest of the count inventory, counts of non-null object-storage key references, and PostgreSQL extensions. It excludes
passwords, the original connection URL, and customer rows. Error messages are
intentionally generic. A missing or changed ledger is a blocker, not something
the script fixes.

### Comparing restored data

Save the two JSON inventory outputs as `source-inventory.json` and
`target-inventory.json` in an **access-controlled local directory**, outside
Git. On the first restore, **before applying pending migrations** to the target:

```sh
cd backend
node scripts/compare-migration-inventories.mjs \
  /secure/source-inventory.json /secure/target-inventory.json
```

The comparator runs **entirely offline**. It reports missing/extra tables,
row-count mismatches, migration-ledger summary differences, extension versions
and object-reference count differences. Exit code 0 means these limited checks
match; exit code 2 means a discrepancy; exit code 1 means invalid or unreadable
input. The tool does not connect to Neon, Render, Tencent Cloud or S3, and does
not move or change any data.

**Do not treat a matching report as proof of all data being identical.** Table
counts and the count digest cannot detect changed row values, missing S3
objects, role/privilege differences, or inconsistent exports while writes
continue. Obtain a consistent backup and test actual restoration separately.



After restoring a consistent PostgreSQL dump into an **isolated** target database, run
the same read-only inventory against the target using its own expected hostname.
Compare the `tables` entries and `tableCountSha256` fields. A different
migration state will naturally introduce new tables; **compare pre-migration
tables against the initial restore first**, then apply reviewed 022–037
migrations to the target as applicable, and take a new baseline.

The inventory reports only counts, never customer rows or image keys.
`objectReferences` counts how many database rows contain storage object
references; **it does not verify actual S3/R2 object existence** or integrity.
Back up and hash-check S3/R2 objects independently, including private proof,
review and customer avatar files. Row-count equality is a necessary check,
not proof of content equality or transactional consistency.

For large datasets, `count(*)` can be expensive and the read-only audit may
stop at the five-second per-statement timeout. Do not remove timeouts to
force a report on a busy source database; schedule an approved maintenance
window or run from a properly restored read-only copy.

For actual migration completeness, this is only the **source identity gate**:
create a consistent `pg_dump -Fc` from a controlled backup/maintenance window,
back up S3/R2 objects separately, inventory roles/GRANTs/default privileges,
functions, indexes, triggers, views, sequences, constraints and external
webhook/scheduler configuration. Test `pg_restore` to a fresh isolated Tencent
PostgreSQL instance, verify exact table counts and selected record checksums,
run approved pending migrations, and rehearse rollback/restore before cutover.

## Known constraints (2026-11-08, read-only audit)

- Render `stall-miniapp` follows GitHub `main` and reported database role
  `neondb_owner`; `stall-miniapp-stripe-test` is manually deployed and
  reported `stall_payment_app_limited`. The saved Render database hostname was
  **not** available from the connected read-only service settings.
- In Neon project `stall-miniapp-staging`, the default branch had 21 migration
  ledger entries (through 021), while the payment-isolated branch had 33
  (through 033). These are **separate branches**, not one database to merge.
- Repository currently contains migrations 001–037. Never blindly replay all
  migrations on an existing DB or use `migrate-dev.mjs` remotely.
- Public product images, private delivery proof photos, review images and
  private customer avatars each need an explicit object-storage/retention
  decision. PostgreSQL `pg_dump` does not include external S3/R2 objects.
- `APP_ENV=production` and all live WeChat Pay/Refund/Refund Reconcile flags
  must remain disabled until merchant-approved live verification. Do not copy
  Stripe TEST/Sandbox credentials into merchant production.
- New production SQL roles, restricted network ingress, TLS trust, production
  migration locking/ledger atomicity, monitored backup restoration, official
  statement reconciliation and end-to-end Tencent Cloud/WeChat real-device
  acceptance are separate deployment requirements.

## Cutover stop criteria

**Do not cut over** if source branch is unresolved, migration checksum differs,
the backup cannot be restored, object inventory/checksums are missing, application
and payment identities are mixed, live write traffic has not been controlled,
or the merchant has not explicitly approved real-money testing and go-live.

Keep original Render and Neon instances available and read-only where possible
until the merchant signs off the migrated data, file integrity, business flows and
official payment reconciliation. Shutting down the old environment is a
separate, explicitly authorized operation.
