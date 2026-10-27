# Backend delivery decisions and open decisions

## BE-01 — 2026-10-27

1. **Keep B0 isolated and failed (binding safety decision).** No restart/recreate/delete or alteration of old receipts, credentials, Docker containers, volumes or networks. Independent V2 is the planned new-test path. Rationale: recorded first-create failure and preservation requirement.
2. **Keep runner approval pending.** Static records reference `stall-phase8-r2-runner@sha256:b1b2cc386667fa68b5136c36f4c3ad8170035a203eb204f4be24edb4c82b0849`, but only the Windows operator can independently inspect live local Docker identity. The exact digest requires separate human approval.
3. **Trusted payment must be server-owned.** Backend shall verify merchant/AppID/store/order/payer/amount/currency, signed and decrypted webhook, replay/idempotency, refunds and reconciliation. Until agreed and tested, orders are unpaid; no fabricated paid state or fake payment-success acceptance.
4. **First-release AppID strategy is open.** Combined single AppID reduces identity migration complexity; Customer/Merchant separate AppIDs require explicit (AppID, OpenID) isolation, authorization and store-code changes. Client owner and customer must choose; do not implement speculative identity merging.
5. **China mainland deployment provider and exact configuration are open.** Resolve with customer: registration/licensing, domain/ICP requirements, HTTPS domain lists, cloud region/provider, object storage privacy, backups and operational owner. No production provisioning without scope and cost approval.
6. **Scope freeze:** prioritize browse → authenticated checkout → trusted payment → merchant fulfillment → order/billing; optional GPS/reviews/advanced analytics must be expressly accepted or deferred with safe disabled behavior.

All open items remain **undecided**; this file records constraints and proposals, not customer consent.
