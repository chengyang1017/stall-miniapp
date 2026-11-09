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
   review/apply 022–037 and role privileges. Do not copy the Neon password to Tencent.
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
