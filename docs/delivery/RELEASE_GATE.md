# Customer release gate — stall-miniapp

Owner-maintained summary. **Release status: BLOCKED (2026-10-27).** A checked source/compile item does not substitute for runtime or platform acceptance.

| Gate | Current state | Evidence / next action |
| --- | --- | --- |
| Git release SHA and approved scope | OPEN | Choose Combined or dual AppID; freeze scope and stage compatibility plan |
| Backend 001–020 migration integration | NOT VERIFIED | Fresh authorized isolated PG, real SQL/catalog/transaction evidence |
| Phase8 V2 runner approval | NOT APPROVED | `backend/testing/phase8-v2/runner-image-approval.json`; independent live Docker review, explicit approval |
| Customer/merchant API integration | NOT VERIFIED | `docs/delivery/backend/HANDOFF.md`; real identity/store fixtures and request logs |
| Payment, webhook, refunds, reconciliation | BLOCKED | `backend/PAYMENT_INTEGRATION_CONTRACT.md`; customer credentials, implementation and signed integration tests |
| WeChat platform build and device | NOT VERIFIED | Frontend owner to supply DevTools/iOS/Android evidence |
| China deployment/filing/domain/privacy | OPEN | Customer/provider responsibilities and platform verification |
| Backup, restore, monitoring, rollback | NOT VERIFIED | Isolated actual restore drill and runbook |
| Security, load, end-to-end acceptance | NOT VERIFIED | Evidence-based green criteria; no silent test skipping |
| Operator & customer release sign-off | NOT APPROVED | All P0 gates closed, release package and explicit approval |

Backend tracking: `docs/delivery/backend/PROGRESS.md`, `TEST_LOG.md`, `DECISIONS.md`, `HANDOFF.md`.

Frontend tracking should live under `docs/delivery/frontend/` on the teammate's branch. Existing permanent testing history remains in `docs/testing/` and must not be rewritten.

**No production deployment, business payment, WeChat publication, migration or V2 Docker resource creation was performed by creation of this release gate.**
