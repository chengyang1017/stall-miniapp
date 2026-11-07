# Customer avatar persistence (staging)

The customer miniapp does **not** receive a user's current WeChat avatar from `wx.login`. A customer must explicitly select a WeChat avatar once (using the WeChat avatar picker), or upload a photograph. Subsequent sessions retrieve the saved private avatar automatically.

## Existing endpoint

`GET/PUT/DELETE /v1/customer/avatar-photo` is implemented in `backend/src/customerAvatarPhoto.mjs`. It requires verified WeChat account mapping and is currently **staging-only** (`PAYMENT_DB_ENV=isolated-test` and `CUSTOMER_ACCOUNT_MAPPING_ENABLED=true`). Each avatar is limited to 512 KiB, JPEG or PNG. The server keeps the storage key in `customer_accounts.avatar_photo_key` and reads the private object through S3 API.

## Deployment configuration

Configure the **staging** server and a dedicated, non-public avatar bucket:

- `S3_AVATAR_BUCKET` — the dedicated private bucket name
- `S3_ENDPOINT` — trusted R2/S3-compatible API endpoint
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — credentials scoped to this private bucket
- `S3_REGION` (if required; defaults to `auto`)

Do not substitute a public product-image bucket unless access control and retention have been explicitly reviewed. Do not commit credentials. Ensure the staging database has the customer-account migrations, including `avatar_photo_key`.

With missing credentials or bucket, the backend returns `503 private_avatar_storage_not_configured`. This cannot be fixed by UI changes. Configure the service, deploy the backend, then use an authenticated account to upload one avatar and verify `GET` on a fresh device.

## Expected interaction

- Sign-in without a previously saved avatar: neutral placeholder, **no popup**.
- Sign-in with a saved avatar: fetch and show it automatically without user action.
- Tap the avatar: choose a new WeChat avatar explicitly or select a camera/album image.
- WeChat does not provide permissionless retrieval of the current profile photo.

## Important limitation

The existing backend avatar route is not production-enabled. Production rollout needs independent authorization, storage, retention, and migration review. Do not remove the staging guards solely to make UI tests pass.
