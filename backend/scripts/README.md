# Server-side database backup — Phase 13

These scripts are **operator-only** and are not exposed to merchants through the mini program.

## Prerequisites
Install PostgreSQL client binaries (`pg_dump`, `pg_restore`) compatible with the server version and Node 20+. Set `DATABASE_URL` **outside Git**. Use a dedicated backup database role with appropriate read permissions. Never put credentials in scripts or logs.

## Backup
From `backend/`:

```bash
BACKUP_DIR=/secure/private/backup node scripts/backup-db.mjs
```

Creates `stall-TIMESTAMP-UUID.dump` (pg_dump custom format), and a manifest with SHA-256 / byte count. Script checks the PostgreSQL archive index. Backup files contain customer personal information: restrict permissions, encrypt at rest and in transit, copy to an independently protected offsite backup location, and test retention policies. File system output is **not** automatically backed up elsewhere. Do not place the folder under a public website.

## Verification
```bash
node scripts/verify-db-backup.mjs /secure/private/backup/stall-example.dump
```

Hash validation and `pg_restore --list` do **not** prove logical restore success. Regularly restore into an isolated nonproduction database and verify counts and key business workflows. Do not restore over the live database as part of an automatic job. Require human approval, incident plan, maintenance window, and a current rollback point for a production restore.

## Object storage
**R2 images are not part of this database backup.** Database image keys and URLs alone will not restore image bytes. Set up independent R2 object replication or versioned exports to a second protected bucket/account; regularly verify object inventory and sample downloads. Never delete objects based only on backup metadata. Define retention and customer-data deletion policies.

## Scheduling
Schedule this command using your deployment platform/cron after providing protected credentials. Alert on missed or failed runs and confirm offsite backup availability. Rotate and encrypt backups according to local requirements. No cron task or cloud scheduler is installed by this patch.

## Phase 14 — R2 media backup (operator-only)

On a trusted computer/server with Node.js 20+, install backend dependencies (`npm install`).
Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
and `R2_BACKUP_DIR` (private disk with enough capacity). Prefer a read-only R2 API token.

```bash
node scripts/backup-r2.mjs
node scripts/verify-r2-backup.mjs /secure/private/backup/r2/r2-TIMESTAMP-UUID
```

The backup downloads **actual object bytes**, not merely URLs. Each file receives a SHA-256 digest. An interrupted export remains named `.incomplete` and must not be treated as a valid backup. Verify before encrypting and copying the snapshot to *separately protected offsite storage*. The scripts do not schedule jobs, encrypt files, or restore objects automatically. Avoid logging keys or sharing manifests; object keys may contain sensitive metadata.

**Consistency:** Listing an actively changing bucket is not a transaction. Database and R2 snapshots taken at different moments can disagree. For disaster recovery, take coordinated snapshots or enable object versioning/retention, and check each database-referenced key against the restored bucket. Test restore into an isolated destination before production use.
