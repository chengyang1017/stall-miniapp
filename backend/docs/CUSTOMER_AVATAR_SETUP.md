# Customer avatar storage in isolated staging

The avatar endpoint supports two **private** persistence modes in isolated staging:
1. An explicitly configured `S3_AVATAR_BUCKET` and S3 credentials, using a private object.
2. If private S3 configuration is absent, database storage in `customer_avatar_photos` (migration `031_customer_avatar_private_bytes.sql`).

The database stores at most 512 KiB of validated JPEG/PNG bytes per verified WeChat account; access uses existing authenticated `/v1/customer/avatar-photo` GET/PUT/DELETE routes, not a public URL.

**Deployment requirement:** apply migration 031 using the project's reviewed remote-migration procedure, then deploy this backend. The dev migration script intentionally rejects remote database hosts. If migration 031 is missing, the API returns `503 avatar_database_migration_required` rather than claiming success. Do not run an unreviewed SQL script on production.

The first WeChat avatar selection always requires explicit user interaction: `wx.login` cannot silently return a real WeChat avatar. Subsequent visits automatically retrieve the saved avatar. Clicking the round avatar opens the platform's native avatar picker directly, without an extra custom modal.

The avatar endpoint remains guarded by `PAYMENT_DB_ENV=isolated-test` and `CUSTOMER_ACCOUNT_MAPPING_ENABLED=true`. Review privacy, DB backups, retention, rate limiting and production access control before enabling outside staging.
