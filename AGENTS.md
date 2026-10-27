# Frontend collaboration rules

These instructions govern the frontend collaborator on `zh`; they do not grant authority over backend operations or the backend owner's work.

## Resume before changing files

1. Check cwd/Git root, branch, status, remotes and recent commits. Preserve all unrelated or uncommitted work. Default branch is `zh`.
2. Read `docs/delivery/frontend/TASKS.md`, `PROGRESS.md`, `TEST_LOG.md`, `DECISIONS.md`, `HANDOFF.md`, and `PREVIEW_HANDOFF.md`.
3. Read `docs/delivery/RELEASE_GATE.md` and `docs/delivery/backend/HANDOFF.md` if present. If absent, record that fact. An available remote owner branch may be read with `git show`, without merging it or claiming its changes are on this branch.
4. Read current build instructions and relevant code/tests. Choose a bounded set of unblocked P0, then P1 tasks. Continue useful offline work while waiting for external dependencies; leave a concrete next task at handoff.

## Scope and safety

- Work on `miniprogram/`, `apps/`, frontend scripts/tests, and `docs/delivery/frontend/`. Frontend-only fixtures in `backend/tests/frontend-navigation*.test.mjs` and `backend/tests/merchant-entry-contract.test.mjs` may be updated to reflect real frontend contracts. Other backend changes require coordination; never change backend business logic, SQL, Docker, credentials, production settings or owner-maintained test/release archives.
- Reproduce failures before fixing them. Do not delete, skip, or weaken failing tests. Preserve original failure evidence and test the actual adapters/compiled pages when navigation changes.
- Preserve role isolation, server authorization, server pricing, order idempotency, and identity/store invalidation. Never silently replace failed cloud operations with successful DEMO data.
- Do not invent payment endpoints, mark orders paid, make real payments/refunds, deploy, publish WeChat apps or touch production/B0 resources without separate explicit authorization.
- Never commit secrets, session tokens or customer personal data. Use clearly synthetic fixtures and scrub logs.

## Remote preview responsibility (authoritative)

- This frontend developer does **not** install, log into or run WeChat Developer Tools. Do not ask them to install it, log into WeChat, obtain an AppID or provide account access/AppSecret.
- The project owner on another computer runs WeChat platform builds, previews and iOS/Android acceptance. Mark these tests `WAITING_FOR_OWNER_PREVIEW`, never pass/fail without evidence.
- After each verifiable stage, maintain `PREVIEW_HANDOFF.md` with the tested commit, build results, exact page paths, actions, expected results and outstanding checks. Process owner screenshots/errors/device feedback when provided.
- Offline mocks, TypeScript builds and static scans are not WeChat, staging, real-device or payment acceptance.

## Verify, record and synchronize

- Run `npm run verify:frontend` for shared navigation/auth or build changes. It uses an explicit offline allowlist, builds all three targets and fails if any selected check fails. Do not run `backend/tests/*` indiscriminately: live/staging/DB tests exist there.
- Update frontend progress/tests/decisions/handoff after each task; append corrections and preserve failure history. Missing owner docs must not be fabricated.
- Commit meaningful related changes with actual validation evidence, then ordinary push to authorized `origin/zh`; verify remote SHA. No force push, hard reset, clean, push to main, or automatic PR merge. Fetch/read remote state before pushing; do not overwrite conflicting collaborator commits.
- A draft PR to main is authorized. Include task IDs, repro/page paths, actual commands/results, unverified items, risks, docs, API dependencies, rollback and commit SHAs; attach its URL to the chat.
- Report task, files/behavior, commands and pass/fail/skip/not-run counts, blockers, docs, branch/SHA/push/PR, next independent task and readiness. States: DEVELOPMENT, INTEGRATION, RELEASE_CANDIDATE, DELIVERED. Raise readiness only on actual evidence; frontend acceptance requires owner validation, and never implies entire customer delivery.
