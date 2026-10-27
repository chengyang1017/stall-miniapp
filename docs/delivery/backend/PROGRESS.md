# Backend delivery progress

## BE-01 — Release baseline / handoff (2026-10-27)

- Owner: backend/system integration lead. Branch: `backend/be-01-release-baseline`.
- Starting remote `main`: `b308134b2df02c207ce827658b409dffb9186a1e`.
- State: repository-only baseline and documentation complete; local runtime checks and production release **NOT RUN**.
- Verified from current GitHub source: 20 consecutive SQL files `001_init.sql` through `020_product_reviews.sql`; Node.js >=20 backend; `backend/src/server.mjs` requires `DATABASE_URL`; local health route `GET /health` issues `SELECT 1`, not schema readiness.
- Current auth route `POST /v1/auth/wechat` uses legacy single WeChat application; separate Customer/Merchant AppIDs are not yet supported as fully wired server authentication.
- Checkout creates an unpaid order. Trusted payment creation/callback/refund/reconciliation is **not implemented** in the current payment integration contract. Client-side `paid` or an SDK success callback is insufficient proof of payment.
- V2 runner image prior static evidence exists; current `runner-image-approval.json` remains `approved=false`. GitHub access cannot inspect Windows Docker live images. B0 failed instance stays preserved. No real V2 PostgreSQL, schema migrations, or business transaction integration tests are evidenced as passed.
- Blockers to customer release: verified isolated DB integration and full schema; formal AppID(s)/merchant identity; payment responsibility and trusted backend; HTTPS/WeChat domain and actual device testing; China mainland infrastructure/compliance; backup+restore rehearsal; release sign-off.
- Source of truth for historic tests: `docs/testing/TEST_STATUS.md`, `TEST_HISTORY.md`, `KNOWN_ISSUES.md`, `RELEASE_CHECKLIST.md`. Do not treat the old checklist's B1 snapshot as current release evidence.
- Next BE task: once operator can access Windows Docker Engine, **read-only** re-check immutable runner image identity against committed audit, document results and request separate digest-specific approval. Do not create V2 DB automatically.
- Coordination: share `HANDOFF.md` with frontend owner, let them proceed with demo and static builds while backend/WeChat credentials remain blocked.
- Review links: `docs/testing/PHASE8_V2_RUNNER_INDEPENDENT_REVIEW.md`; `backend/PAYMENT_INTEGRATION_CONTRACT.md`; `backend/APP_SEPARATION_READINESS.md`; `backend/testing/phase8-v2/README.md`.
