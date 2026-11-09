# Tencent Cloud single-merchant deployment foundation (not yet deployed)

## Proposed production architecture
WeChat Mini Program -> merchant-owned HTTPS API domain -> Tencent CVM Nginx (443) ->
Node backend on `127.0.0.1:8787` -> TencentDB for PostgreSQL 18 via private network;
product images and private proof/review photos use separately secured Tencent COS buckets.
Use one Combined mini program/AppID for this deliverable.

The templates in this folder are **configuration candidates**, not evidence of a running service.
They do not install packages, write to Neon, start systemd, contact Tencent, apply migrations,
turn on payment, or touch merchant data.

## Required merchant prerequisites
Merchant owns Tencent Cloud account and region choice, billing, a domain eligible for API use,
ICP filing where required, mini program ownership/valid category, and an approved WeChat Pay
direct merchant ID/account. Developer receives least-privilege access; **never transfer bank,
merchant certificates or API v3 key via chat or GitHub**.

## Before first boot
1. Fix a reviewed Git commit and produce a release of backend runtime files and lockfile.
   Install Node LTS using a vendor-supported channel after security review, then `npm ci --omit=dev`
   from `backend/`. Do not deploy `.git`, `.env`, `backups`, tests, or credentials.
2. Configure TencentDB PostgreSQL 18 in a **private network**, use distinct runtime and
   migration roles. Make a backup and **prove restore** before running migration DDL.
3. Previous main Render source: Neon `stall-miniapp-staging`, default `production` branch,
   endpoint `ep-cold-fire-b5ali2cv.c-7.us-east-2.aws.neon.tech`, `neondb`,
   known migration ledger 001–021. Actual production data migration must be explicit:
   verify consistency, pg_dump, restore into isolated target, compare counts, then
   **do not blindly apply 022–037**: 022 is Stripe-test-only, 021 also contains
   staging-specific tables already present in the source. First review the
   production-eligible migration subset, dependencies and new production migration
   ledger strategy in an isolated restored DB; do not delete or rewrite existing
   staging/test history just to make a ledger look clean. Review roles and grants.
   Do not copy the Neon password to Tencent.
4. Decide whether existing R2 files are staying temporarily or being copied to COS.
   PostgreSQL dumps **do not include object bytes**. Private proof/review/avatars must
   not be placed in public product image bucket. Actual COS S3-signing, HEAD, upload,
   private presigned retrieval and CORS must be verified on devices.
5. Prepare `/etc/stall/api.env` outside Git with permissions `root:stall-api 0640`,
   containing new TencentDB credentials, merchant-owned WeChat AppID/AppSecret, verified
   object storage and closed payment flags. The sample is NOT a production secret file.
6. Run `node backend/scripts/check-tencent-production-env.mjs` in a protected shell.
   It **only** checks local syntax/obvious unsafe values, does not connect to any service.
   Green is not proof of correct settings, table permissions, completed migrations or TLS.
   Placeholder values in the example (including dummy database host, AppSecret and storage
   credentials) now explicitly FAIL the preflight. Legacy R2/S3 endpoints also FAIL:
   this handoff is for Tencent COS, not continued external R2 hosting. A custom COS
   domain must still be verified in Tencent's actual console; a valid URL alone
   cannot establish bucket ownership, privacy, or signing correctness.
7. Provision `stall-api` as an unprivileged system user, `/opt/stall/current/backend`
   application directory and protected writable `/var/lib/stall` / `/var/log/stall`.
   Review and install `stall-api.service`; validate Nginx config after substituting
   `API_DOMAIN` and installing a real TLS certificate, then load it as approved.
   Keep raw Node port 8787 and database port 5432 closed to the public network.
8. Apply production schema in an isolated restore and verify migrations, constraints,
   role grants and correct store/member binding **before** service startup. On boot,
   the current Node app schedules maintenance tasks, so startup is not read-only.
9. Run health and authenticated business workflows, upload/download, refund callbacks
   (flags off), actual mini program login and Chinese-network accessibility tests.
   Merchant must approve controlled real-money tests and payment switch-on later.

## SQL migration eligibility — mandatory offline gate

From a checked-out, reviewed Git commit, run:

```sh
node backend/scripts/tencent-sql-policy-plan.mjs
node --test backend/tests/tencentSqlPolicyPlan.test.mjs
```

The policy classifies all 37 SQL migration filenames and computes their SHA256
for review. It **does not connect to any database or execute SQL**, and always
reports `canApplyToProduction: false`: a passing classification does not grant
approval to apply any SQL.

- `001–020`: source history, already applied on the known Neon source.
- `021`: already present in source and contains staging-only structures;
  **preserve existing ledger**, never replay it as a new production migration.
- `022` and `027–030`: **sandbox-only, exclude from merchant production**.
  Migration 027 also directly alters the Stripe refund table created by 022.
- `023–026`: customer identity/profile changes require review; 024–026
  reference the `stall_payment_app_limited` staging role.
- `031–033`: isolated staging avatar, customer session and business-setting
  permissions. Review designs and replace staging-only role assumptions.
- `034–037`: real WeChat Pay/refund structures. Review dependencies, runtime
  GRANTs and actual provider integration before applying to a restored target.

**Important:** this source has migrations up to 021 but cannot simply use the
developer migration runner, which requires a continuous 001–037 history and
refuses remote databases. Production requires its own **reviewed, separately
authorized** target-only migration plan and ledger strategy. Do not manually
invent migration ledger entries to fill 022 or 027–030.

## Review the exact restored-source migration candidates

After the authorized source audit produces a JSON report from the correct
database, the **offline-only** review script can narrow down what must be
decided before writing SQL:

```sh
node backend/scripts/tencent-restored-source-review.mjs /secure/source-inventory.json
```

This requires the known 001–021 source history, a clean filename/hash check,
and all 16 later filenames marked missing. It outputs SHA256-reviewed candidate
groups: `023` account identity, `024–026/033` requiring production grant
rewrites, `031–032` requiring an avatar/session design decision, and
`034–037` real WeChat payment schema. It always excludes
`022/027–030` and always reports `sqlExecutionAuthorized=false`.
No database connection or automatic DDL is performed.

**It is not a production migrator.** The original 021 source contains
staging-related structures. A separately reviewed target-only migration and
ledger scheme must address the skipped Sandbox numbers. Before production
DDL, the operator must restore and verify the snapshot in a nonproduction
TencentDB, review role grants and SQL dependencies, obtain authorization,
and rehearse rollback. Do not silently synthesize source migration ledger
rows for excluded test migrations.

## Isolated TencentDB migration execution drill — NOT production

A narrowly scoped executable proof-of-concept now exists at
`backend/scripts/tencent-isolated-db-drill.mjs`.

Default (no connection/no writes):

```sh
node backend/scripts/tencent-isolated-db-drill.mjs --plan
```

The plan includes original `023`, a new **Tencent-only profile/session/COS avatar extension**, and `034–037`, with source 001–021 SHA256
checks and individual SQL file hashes. Those SQL migrations contain their own
`BEGIN/COMMIT`; this runner validates and strips only their strict outer
transaction wrappers so the SQL and its **separate drill ledger record** can
commit atomically. It does not synthesize missing 022 or 027–030 records or
alter the original `stall_schema_migrations` table.

**Only after** an approved snapshot is fully restored and compared in a
brand-new, isolated TencentDB database named **exactly**
`stall_tencent_drill`, the operator may provide, through a protected shell:

- `DATABASE_URL`: new TencentDB migrator credentials pointing at
  `stall_tencent_drill`, not Neon or the merchant live database
- `TENCENT_DRILL_EXPECTED_HOST`: the exact actual TencentDB endpoint hostname
- `APP_ENV=isolated-migration`, `PG_SSL=true`
- `TENCENT_DRILL_APPLY=APPLY_ONLY_ISOLATED_RESTORED_DB`
- `WECHAT_PAY_LIVE_ENABLED=false`, `WECHAT_PAY_LIVE_REFUNDS_ENABLED=false`

Then `node backend/scripts/tencent-isolated-db-drill.mjs --apply`.
The runner holds a session-level advisory lock, checks the source migration
ledger matches 001–021 exactly, detects untracked target tables, and runs
the isolated migrations in separate bounded transactions with same-transaction
ledger insertion. Failure rolls back the active transaction and stops; prior
committed migrations remain for inspection.

**Important limits:** This executable intentionally skips the original
`024–026` and `031–033` because they are tied to staging roles/decisions.
Instead, the Tencent-only extension creates the **equivalent necessary**
`nickname`, `avatar_style`, `avatar_photo_key` and `customer_account_sessions`
schema for a private COS avatar design. It does not enable the currently
staging-guarded customer HTTP routes or phone login. It does not create
`customer_avatar_photos` bytea storage or synthesize old ledger entries.
The resulting database is **not a complete deployable merchant production
schema**; it still lacks tested legacy 001–021 runtime grants, production-only
feature activation and actual runtime permission tests.
Do not point the live Node application or real WeChat Pay at this drill, or
rename the drill database into production. Test real constraints, privilege
separation, failure recovery and dependencies before designing the separately
authorized production migration path. This tool has been tested only with
mock PostgreSQL responses until a real isolated TencentDB is provisioned.

## Runtime database permissions — isolated partial template

`deploy/tencent/isolated-runtime-grants.sql.template` contains a **review-only**
permission proposal for customer identity `023`, Tencent-only profile/session
fields and live WeChat Pay `034–037` tables. It is guarded to the restored isolated database named
`stall_tencent_drill`, a pre-provisioned `stall_tencent_migrator` SQL
executor, and a separate, non-superuser `stall_tencent_runtime` role. It
does not create any role or set a password. It deliberately omits permission grants on the legacy `001–021` business
tables, which require a wider verified application query inventory.

Key runtime permissions: customer accounts and identities have SELECT/INSERT;
payment prepay rows are SELECT/INSERT; refund rows have scoped state changes;
refund events and abnormal-collection review logs are SELECT/INSERT only
without UPDATE or DELETE. The script never grants privileges to PUBLIC.
These are **design candidates**, not a verified final runtime privilege model.

**Do not apply the template to the existing Neon source, any merchant
production database or an unexamined restore.** Even on an isolated restore,
verify ownership, existing inherited role privileges, default privileges,
sequence access, function execution rights, permissions on 001–021 business
tables, the absence of sandbox/test grants, and the actual SQL queries executed
by Node. The script's `REVOKE FROM PUBLIC` does not revoke preexisting explicit
grants to other roles. The application login role must not be the owner or have
CREATEROLE/DDL privileges. Make no claims of finished least-privilege
isolation until negative authorization tests run against an actual PostgreSQL
instance. Test grant/deny as a separate role while all payment flags remain off.

## Runtime grant audit across historical business tables

The historical schema SQL `001–020` contains the merchant, catalog, orders,
inventory, customer addresses, support, image lifecycle, delivery tracking,
archives and review tables. A review-only grant template for newer tables is
**not** enough to let the existing application run.

The script `backend/scripts/tencent-runtime-permissions-audit.mjs`
enumerates 36 historical business tables, 8 newer candidate tables and both
migration ledgers and checks permissions for the dedicated
`stall_tencent_runtime` role. It verifies an initial set of required
business SELECT/INSERT/UPDATE grants, checks for unexpected TRUNCATE on
historical tables, DELETE/UPDATE on append-only records and any write access
to either migration ledger. It also checks role elevation and global
data-access membership. The list is a **minimum baseline**, not a full
column-by-column application contract.

Default offline mode (no database connection):

```sh
node backend/scripts/tencent-runtime-permissions-audit.mjs --plan
```

After a separate, approved isolated restore is ready and the runtime role
has been provisioned, a **read-only** inspection is available:

```sh
# In a protected operator shell, never put a database password in Git:
# APP_ENV=isolated-migration
# PG_SSL=true
# DATABASE_URL=...  (new audit-user login, not the runtime role)
# TENCENT_DRILL_EXPECTED_HOST=<exact approved TencentDB hostname>
# TENCENT_ROLE_AUDIT_TARGET=stall_tencent_drill
# TENCENT_ROLE_AUDIT=READ_ONLY_ISOLATED
node backend/scripts/tencent-runtime-permissions-audit.mjs --check
```

The query opens a repeatable-read, read-only PostgreSQL transaction. A failure
to find any expected table or a required privilege, or any unwanted sensitive
privilege, reports an explicit failure. It neither grants permissions nor
mutates data. Only the precise `stall_tencent_drill` target is allowed; the
Neon connection is rejected. Do not use this audit as a production migration
script or as an approval to activate payment.

The audit now also inspects **required column-level grants** for customer
nickname/avatar updates, independent customer-account session read/issue/revoke,
refund status/reconciliation fields, and merchant delivery-rule configuration.
It verifies those columns exist and calls PostgreSQL `has_column_privilege`.
A table-level UPDATE grant is **not** required when reviewed column-only grants
are sufficient. Any missing column/grant fails the read-only report. This is a
targeted initial contract, not a comprehensive inventory of every SQL query.

A successful table-level and targeted column audit does **not** establish
sequence and function rights, row-level security behavior, account isolation,
the full Node query matrix, or successful integration and negative-authorization
tests. These require an isolated TencentDB and end-to-end execution using the
actual runtime identity before final production grants can be approved.

## R2 → Tencent COS private/public file migration

Files cannot be migrated with `pg_dump`. The app stores object keys in
PostgreSQL and uses S3-compatible APIs, but the object bytes, bucket policies,
signed URL behavior and public image domain are separate concerns.

**Important:** `backup-r2.mjs` downloads only one R2 bucket per run and **also
writes retention records to its connected PostgreSQL database**. It is not a
read-only source audit. Do not run it on an unapproved source or assume it
already includes proof, review and avatar buckets.

Use separate approved backup snapshots for each actual source bucket, passing
the same explicit `BACKUP_SET_ID` for the coordinated batch. Before transfer,
run `verify-r2-backup.mjs` on each saved directory and separately verify
database backup integrity.

Create a local `/secure/cos-route.json` file **outside the repository**:

```json
{
  "product_public": "merchant-products-1250000000",
  "delivery_proof_private": "merchant-proofs-1250000000",
  "review_private": "merchant-reviews-1250000000",
  "review_staging_private": "merchant-reviews-1250000000",
  "avatar_private": "merchant-avatars-1250000000"
}
```

These bucket names are illustrative and must be replaced with the
merchant-owned verified COS buckets. Keep all non-product data private.

Then run this **offline, non-copying** inventory:

```sh
node backend/scripts/tencent-cos-transfer-plan.mjs \
  /secure/cos-route.json \
  /secure/r2-products/manifest.json \
  /secure/r2-proofs/manifest.json \
  /secure/r2-reviews/manifest.json \
  /secure/r2-avatars/manifest.json
```

It checks manifest pairing, object counts, byte totals, key categories and
public/private bucket assignments. It does not open any database, connect to
R2/COS, transfer a single object or display sensitive object keys. Any
unrecognized key remains blocked for manual classification.

**Isolated restore implementation is now available, but has not been tested on real Tencent COS.**
`backend/scripts/tencent-cos-isolated-restore.mjs` defaults to an offline
preview and requires protected local backup *directories*, not bare manifest paths:

```sh
node backend/scripts/tencent-cos-isolated-restore.mjs \
  /secure/cos-route.json /secure/r2-products /secure/r2-proofs
```

After verifying each local backup using `verify-r2-backup.mjs`,
provisioning **new empty isolated Tencent COS buckets**, confirming their
access policies, and obtaining the merchant's authorization, the operator may
set the environment variables `TENCENT_COS_REGION`,
`TENCENT_COS_ENDPOINT` (official `https://cos.<region>.myqcloud.com`),
`TENCENT_COS_ACCESS_KEY_ID`, `TENCENT_COS_SECRET_ACCESS_KEY`,
`TENCENT_COS_EXPECTED_BACKUP_SET_ID`, and
`TENCENT_COS_RESTORE_AUTHORIZE=APPLY_TO_ISOLATED_EMPTY_BUCKETS`, and run:

```sh
node backend/scripts/tencent-cos-isolated-restore.mjs --apply \
  /secure/cos-route.json /secure/r2-products /secure/r2-proofs
```

The tool refuses existing objects, requests conditional no-overwrite PUT,
and downloads each uploaded object to compare SHA256 and byte length.
**If Tencent COS does not enforce the conditional PUT as required, stop and
review the cloud behavior in an empty test bucket; do not work around it by
overwriting live files.** No delete operation is implemented. The tool is
bounded to 8 MiB per file; larger objects require a separately reviewed
streaming/multipart mechanism. Interrupted runs do not auto-resume and may
leave already verified objects in isolated COS. Reconcile manually before any
retry; do not delete or overwrite blindly. Storage credentials never go to Git.

This executable still **does not prove end-to-end production restore**:
the source bucket inventory may be incomplete, private permissions have not
been exercised, and DB references remain unchanged.
Review `stored_images.storage_bucket`, `product_review_images.storage_bucket`,
avatar keys and stored historical proof references in the **restored**
TencentDB before switching application configuration. Verify public product
URLs, time-limited private proof/review links and customer avatar GET on a
real device. Never expose private images through the public product domain.
Do not delete original R2 objects until merchant acceptance and rollback
evidence are complete.

## Separation and rollback
Keep the old Render and Neon environments until cutover validation and merchant sign-off.
Never turn on `WECHAT_PAY_LIVE_ENABLED`, refund or reconciliation, or image-cleanup delete
just because backend HTTP health is green. Do not deploy the Stripe Sandbox preview
to a merchant live server. The first production deployment must use a **newly created
database user/password**; do not reuse the previously shared Neon credential.

The provided Nginx limit configuration is only a baseline; confirm real
WeChat notification burst requirements, reverse-proxy IP trust, body sizes and
actual TLS certificate renewal. Review systemd hardening on the specific OS.

**Status:** templates and offline checks only; no Tencent purchase, deployment,
database restoration, COS replication or official real-payment acceptance has happened.
