# BE-02 — Windows Docker runner read-only identity check

State: **PREPARED / LOCAL EXECUTION NOT RUN** (2026-10-27).

## Purpose and safety

The historical V2 runner build audit reports an immutable runner reference `stall-phase8-r2-runner@sha256:b1b2cc386667fa68b5136c36f4c3ad8170035a203eb204f4be24edb4c82b0849` and separate OCI config digest `sha256:abd8b7640f70fdd7d92d8c90496c5af4ee80d16e35f5d62c2d6a68389f77e29f`. A GitHub review is not independent local-image verification. The image is **NOT APPROVED**.

A read-only PowerShell image identity check is now present at `backend/scripts/audit-phase8-v2-runner-readonly.ps1`.

From the repo root, an operator with access to the Windows Docker Desktop Linux Engine may choose to run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\audit-phase8-v2-runner-readonly.ps1
```

The script queries the Docker context, server OS/arch, and *only* the exact runner image's inspection metadata. It does not invoke `docker run`, `docker compose`, pull/build, container start/stop, migrations, approvals or destructive actions. It writes no files. Output is not to be mistaken for a comprehensive supply-chain audit.

## Operator checklist (not yet performed)

1. Confirm correct local checkout/branch and Docker context without switching contexts in this script.
2. Verify the local immutable reference, OCI config ID, platform, user, entrypoint, bundle label against recorded audit. Preserve console output as private evidence and redact any unexpected sensitive error data.
3. Separately inspect source/archive file manifest, contents, Docker resources before/after, B0 preservation, lack of secrets, and image provenance. Metadata check alone cannot prove archive layers or image safety.
4. Do not edit `runner-image-approval.json` without a distinct informed operator decision approving the exact image digest and documenting who, when and what was checked.
5. Re-run offline safety tests after approval metadata changes; never treat the 235 historical passing tests as freshly run.
6. Only then plan B3-V2 resource creation via a separately authorized narrow operation, and explicitly distinguish B3 creation from B4 schema migrations.

## Known blocking conditions

- GitHub remote tool cannot run Windows PowerShell or inspect Docker Engine.
- Live image may be absent, Docker Desktop may be off, or image digest may mismatch. Any check failure must remain failure; no tag-only fallback.
- Other Docker projects and old Phase8 B0 failed artifacts must not be modified.
- Script intentionally does not print `Config.Env` or private filesystem content and does not perform network/ACL/secrets proofs.

## Evidence and decisions

- `docs/testing/PHASE8_V2_RUNNER_BUILD_AUDIT.json`: historical build.
- `docs/testing/PHASE8_V2_RUNNER_INDEPENDENT_REVIEW.md`: static independent review and remaining controls.
- `backend/testing/phase8-v2/runner-image-approval.json`: still approved=false.
- This BE-02 record is **tool preparation**, not final approval.
