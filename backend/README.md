# Stall Miniapp: backend foundation (phase 1)

This **does not** yet replace the miniapp's local storage. It creates a PostgreSQL
schema, a public read-only product endpoint and an optional miniapp API client.
Do **not** use it for real payments or personal customer information yet.

## Local setup (Node.js 20+, PostgreSQL 14+)

1. Create a PostgreSQL database named `stall` and set `DATABASE_URL` in your shell.
2. Run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/sql/001_init.sql` from the project root.
3. `cd backend && npm install`.
4. From `backend`, run `node --env-file=.env src/server.mjs` after copying `.env.example` to `.env` and supplying credentials. Or set environment variables in your shell and run `npm start`.
5. `GET http://127.0.0.1:8787/health` should return `{ "status": "ok" }`.

The API only returns products for stores with `is_active=true`. No default store
or users are created. Do not expose this development server publicly. For
production use a managed PostgreSQL database and deploy behind HTTPS.

## Endpoint

`GET /v1/stores/{slug}/products`: up to 200 enabled products. Prices are in **integer
minor units** (fen/cents), not floating-point yuan. `imageObjectKey` is metadata,
not yet a publicly accessible image URL.

## Next migration stages

1. WeChat `wx.login` -> server code exchange -> verified session and merchant
   membership. Server-side isolation must derive merchant identity from session,
   never blindly trust a client-supplied `merchantId`.
2. Authenticated product/category CRUD, image upload to object storage.
3. Authenticated order creation with server-calculated prices, stock and delivery
   validation; idempotency; payment webhook verification; refund handling.
4. Billings from confirmed payments (not delivered/unpaid orders), audit trail,
   exports and automated managed backups. Then remove legacy local writes.

## Important

- For WeChat miniapp production, register the HTTPS API domain in WeChat's request
  legal-domain settings and configure a trusted certificate.
- Merchant/customer personal data and backups need access control and retention rules.
- `miniprogram/utils/remoteApi.ts` is deliberately not invoked by current pages;
  it cannot silently change checkout behavior.

## Phase 2 - WeChat identity and merchant permissions

Apply `sql/002_auth.sql` after `001_init.sql`. In the server environment set
`WX_APPID` and `WX_APPSECRET` for a real mini program, not a test account secret
in the repository. `POST /v1/auth/wechat` exchanges a short-lived `wx.login`
code on the server (body `{"code":"..."}`) and returns an opaque, 7-day bearer
session. `GET /v1/auth/me` returns the stores the verified identity may manage.
`POST /v1/auth/logout` revokes the session; `GET /v1/merchant/stores/:slug/orders`
requires membership and returns only orders belonging to the selected store.
No self-service merchant promotion endpoint exists.

Before merchant handoff, an authorized administrator must link the verified
subject to the intended merchant in `merchant_members`. Never let clients choose
`external_subject` or `role`, and do not expose the WeChat `session_key`. This
phase does not implement merchant onboarding or change the mini app's local-data
pages. Auth sessions are stored as SHA-256 hashes; database permissions should
also be least-privilege. In production, serve only HTTPS with trusted origin,
add IP/account-based login rate limiting, monitoring, session lifecycle cleanup,
and carefully scoped admin provisioning. Do not treat this as a finished payment
or production security review.

## Phase 3: merchant catalog and upload preparation

Requires Phase 2 session authentication and `owner`/`manager` membership.
- `GET/POST /v1/merchant/stores/:slug/categories`, `PATCH/DELETE .../categories/:id`
- `GET/POST /v1/merchant/stores/:slug/products`, `PATCH/DELETE .../products/:id`
- `POST /v1/merchant/stores/:slug/image-uploads`: body `{ "contentType":"image/jpeg", "sizeBytes":12345 }`; returns S3-compatible presigned PUT URL and per-store object key, valid 5 minutes. Client PUT must use the same Content-Type header. The maximum stated size is a client contract, not an object-storage-enforced size limit; configure actual object-storage size policies and validate uploaded bytes before publication.

All requests use `Authorization: Bearer SESSION`. Product POST/PATCH require full fields: name, categoryId (UUID or null), priceCents (integer), active and soldOut booleans, imageObjectKey (null or a previously issued scoped key). Only activate images after verifying storage existence, type, size and ownership; current route does not independently verify the object exists. Do not expose object-storage keys as public image URLs. Public image delivery requires a separate read URL / proxy and access policy.

This is API groundwork; existing mini-program pages still use local data. No cloud catalog switch, payment or production readiness is claimed. Keep the S3 credentials on the server only. Limit request rates and implement audit logs and CSRF/origin strategy as appropriate to your deployment.


## Phase 6 image upload (integration stage)

Set `S3_*` environment variables and `IMAGE_PUBLIC_BASE_URL=https://images.example.com` using a public R2 custom domain. The S3 endpoint is for signed uploads, **not** the public image URL. The backend signs `PUT` for 300 seconds, with JPEG/PNG/WebP only and a 5MB declared limit. The mini program uses `wx.request` PUT with binary data, not `wx.uploadFile` (which is multipart POST).

Register **both** the API domain and the R2 signed-upload endpoint domain under the appropriate WeChat Mini Program request-domain allowlist; the public image domain belongs in download/image-related domain configuration as applicable. Verify the exact approved domains and requirements on the actual account. Configure R2 bucket CORS to allow the client origin and PUT with `Content-Type`; test on a real device.

The server verifies a referenced image object using R2 `HEAD` before inserting or updating the product. Existing image objects are **not** deleted automatically: add retention/cleanup controls before production. A valid image object does not mean the file's bytes are safe or match its declared MIME; production requires verified file signatures, image decoding/re-encoding, malware checks where relevant, rate limiting, quotas, audit logs and orphan cleanup. The public domain makes uploaded files publicly readable. Never put sensitive photos in the public bucket.

Existing local-demo product pages remain unchanged; this only extends cloud catalog integration. A signed URL must not be logged or shared. Credentials live only in the backend environment.

## Phase 7 customer catalog preview
The `cloud-shop` page is an isolated customer-facing **preview** reachable from the cloud-catalog page. It reads `GET /v1/stores/:slug/products` without merchant credentials and computes a device-side cart estimate. Pull-to-refresh and quote preview re-fetch remote prices; failures mark estimates stale. **There is no cloud order creation, payment, server-side cart quote or real checkout in this phase.** Existing local order flow is unchanged.

## Phase 8: unpaid cloud order API
Run `backend/sql/003_checkout.sql` after previous schema migrations. `POST /v1/stores/:slug/orders` requires a Bearer token from verified WeChat login and a unique `Idempotency-Key` header (20-100 alphanumeric/underscore/hyphen characters). Payload: `{ "items":[{"productId":"uuid","quantity":1}],"address":{"receiverName":"...","phone":"...","area":"...","detail":"..."},"slot":{"id":"...","label":"..."} }`. Response returns the backend-generated order ID and total in integer cents. Price and product availability are read from PostgreSQL inside a transaction. Repeated identical requests with the same key return the original order.

**Not ready for production checkout**: the address and delivery slot are recorded, but cannot yet be verified against server-controlled merchant delivery rules. Delivery fees, inventory reservations, payment initiation/callback validation, rate limits and privacy controls are also outstanding. The app deliberately retains its non-ordering cloud preview until these pieces are complete. This endpoint is for authenticated integration tests; never treat its `unpaid` response as paid.

## Phase 9: server-enforced delivery rules
Apply `backend/sql/004_delivery_rules.sql` after migrations 001–003. Owner/manager PUT `/v1/merchant/stores/:slug/delivery-rules` with Bearer session, GET available to authorized merchant staff. Rules JSON: `{ "accepting": true, "days": [{"enabled":true,"start":"09:00","end":"21:00"} × 7 starting Sunday], "areas": [{"id":"a1","name":"Area","enabled":true,"latitude":null,"longitude":null,"radiusMeters":null}], "slots": [{"id":"s1","label":"Lunch","enabled":true,"start":"11:00","end":"13:00"}] }`. An area with null coordinates means an explicitly allowed named delivery area; a radial area requires lat/lon/radius on both config and checkout address.
Checkout requires `address.areaId` rather than `address.area`, optional `address.latitude`/`longitude` for radial areas, and `slot:{id,date:"YYYY-MM-DD"}` rather than a client-provided label. Dates are in fixed UTC+8 and limited to today through seven days ahead. Store must be accepting orders, open at checkout time, offer the selected date and slot, and cover the selected address. The server stores a verified slot snapshot. Existing unconfigured stores fail closed with `delivery_not_configured`. **No production checkout UI is enabled.** Geolocation is client-provided and is NOT proof that the consumer is really at that location; this is only geographic rules checking, not fraud protection. Identity/rate-limits, location integrity, inventory, payment, fees, timezone configurability, and end-to-end tests are still required before production.

## Phase 15: deploy preflight and migration plan

Run from `backend/`: `npm run preflight`. This read-only checker verifies Node.js version,
SQL migration numbering and SHA-256 hashes, JavaScript syntax and whether important
runtime settings appear configured. It **does not** connect to the database, execute SQL,
test WeChat or R2, or prove production readiness. Missing configuration produces warnings
so the checker can run safely before credentials are available. Never commit `.env`.

For a **new, disposable development database**, after taking a database snapshot
and ensuring the connection targets the intended database, run migrations in order:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/sql/001_init.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/sql/002_auth.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/sql/003_checkout.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/sql/004_delivery_rules.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/sql/005_order_workflow.sql
```

These commands assume the working directory is the project root and a Unix shell.
For Windows PowerShell, provide `DATABASE_URL` via `$env:DATABASE_URL` and
run `psql "$env:DATABASE_URL" ...`. Never blindly reapply migrations on an
existing or production database: these migrations do not have a fully managed
versioning/rollback system yet. Determine applied state before running SQL, and
use a migration journal, transactional rollouts and restoration drills before production.
A successful static preflight does **not** authorize production deployment.
