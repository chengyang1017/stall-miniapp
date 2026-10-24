# Phase 16 — Local PostgreSQL integration (Windows PowerShell)

This is an isolated **developer test** environment. It requires Docker Desktop with Compose, Node.js, and `npm install` in `backend`. Do not reuse production data, passwords, or credentials.

From the existing `backend` directory (no need to cd elsewhere):

```powershell
docker compose -f compose.dev.yml up -d
npm install
$env:DATABASE_URL = 'postgresql://stall_dev:stall_dev_only_change_me@127.0.0.1:55432/stall_dev'
$env:CONFIRM_DEV_MIGRATIONS = 'YES'
node scripts/migrate-dev.mjs
$env:HOST = '127.0.0.1'
$env:PORT = '8787'
$env:PG_SSL = 'false'
npm start
```

In another PowerShell window:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

Expected: `{status: ok}`. A real PostgreSQL query is executed for this health check. The catalog will be empty until a merchant/store are provisioned; this tool deliberately does not create a fake account or bypass authentication.

Do not call `/v1/auth/wechat` until you have separate development credentials. Do not put secrets in Git. The test DB uses a weak, clearly labeled developer-only password and listens **only on loopback**. Keep this DB off the public internet.

Check status: `docker compose -f compose.dev.yml ps`. Stop services: `docker compose -f compose.dev.yml down` (data persists). **Do not** run `down -v` unless you intend to destroy local test data.

Migration runner refuses any remote host or database not named `stall_dev`, refuses untracked schemas, and checks applied file hashes. SQL migration and recording its ledger are separate operations, so a process interruption between them will require manual investigation; do not blindly rerun or delete tables. These scripts are not a production migration system.

If Docker is unavailable, stop at this step rather than running migrations against a hosted production database.
