# Backend to frontend handoff — BE-01

GitHub source baseline: `b308134b2df02c207ce827658b409dffb9186a1e`. Review date: 2026-10-27. This is a **source-level interface outline**, not an assertion of deployed endpoints or live response validation.

## Known API surface

- `POST /v1/auth/wechat`: JSON `{"code":"<wx.login code>"}`; backend exchanges code using configured **legacy single** AppID/AppSecret, returns a bearer session on success. Requires real WeChat settings to work. Do not log real code, session or secret.
- `GET /v1/auth/me`: Bearer session; returns `{"stores":[...]}` for linked merchant memberships; no membership can lead to no permitted stores.
- `POST /v1/auth/logout`: Bearer session; invalidates token.
- `GET /v1/stores/:slug/products`: public catalog for active store, supported query/filter/pagination handled by server. Never substitute demo products after cloud HTTP failures.
- `POST /v1/stores/:slug/orders`: Bearer session and `Idempotency-Key` (20–100 chars, letters/numbers/_/-); body includes `items:[{productId,quantity}]`, `address:{receiverName,phone,areaId,detail}`, `slot:{id,date}`, optionally `note`. Server decides actual price, inventory and delivery validity. First order is **unpaid** and must not be presented as paid. Similar idempotent retry should not duplicate order.
- `GET /health`: basic DB connectivity check, not full schema readiness or release green light.

Example request **shape only** (IDs, domain and identities are placeholders, not functioning values):

```http
POST /v1/stores/example-store/orders HTTP/1.1
Authorization: Bearer <TEST_TOKEN_ONLY>
Idempotency-Key: EXAMPLE_12345678901234567890
Content-Type: application/json

{"items":[{"productId":"00000000-0000-4000-8000-000000000001","quantity":1}],"address":{"receiverName":"测试顾客","phone":"13800000000","areaId":"area-1","detail":"示例地址"},"slot":{"id":"slot-1","date":"YYYY-MM-DD"}}
```

These examples are not test assertions and should not be used against live APIs.

## Explicitly NOT ready

- No trusted payment-creation endpoint, verified payment notify, refund endpoint or reconciliation contract is implemented and approved. **Do not call invented `/pay` or `/refund`.** Coordinate first with backend and customer. Frontend `wx.requestPayment` cannot mark orders paid.
- Dual Customer/Merchant AppID identity exchange is not wired in server auth. Do not assume OpenID equivalence across AppIDs.
- Isolated V2 PG runtime has not been approved or created; development demo data is not a cross-device backend.
- Real R2 private proof configuration and approved HTTPS domains are pending environment confirmation.
- Unknown merchant/store permissions must show auth/permission error rather than granting owner/manager in the client.

## Frontend owner can work now

- Run Combined/Customer/Merchant builds and widget/UI tests; record actual commands/results.
- Develop page loading/error/empty states in demo mode; label all simulated outcomes.
- Prepare API adapter tests using **mock fixtures** without asserting production payment outcomes.
- Document route mismatches with exact backend path, method, sample payload and affected page in frontend task record; request backend change before guessing.

## Decision dependencies

- Owner/customer: one Combined AppID vs separate Customer/Merchant AppIDs.
- Customer/payment provider: verified payments/refunds contract and test credentials.
- Backend: stable error codes, actual staging URL, seeded development merchant and store, migration readiness.

No credentials, production tokens or customer personal data in this handoff.
