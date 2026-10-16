# Prompt 01 — establish the real DocForge baseline

Work inside the DocForge repository. Do not implement product features yet.

Inspect:

- `README.md`
- `PRODUCT.md`
- `DESIGN.md`
- `CONTRIBUTING.md`
- `MASTER-PROMPT.md`
- `docs/ledger.md`
- `docs/issues.md`
- `docs/phases/`
- `apps/web/`
- `packages/`
- `qa/`

Then:

1. Check `git status`, recent commits, `.nvmrc`, and the package manager.
2. Confirm the actual Node runtime.
3. Install dependencies only if the pinned runtime is available.
4. Run the smallest meaningful existing checks:

```bash
corepack pnpm lint
corepack pnpm typecheck
RUN_PARITY=1 corepack pnpm test
node build.mjs
```

5. Record every command as passed, failed, or blocked.
6. Compare documentation claims with the current implementation.
7. Identify stale docs, missing checks, and the three most important risks.

Do not modify application behavior. You may update a short status note only if
the repository has an established place for it.

Return:

- Current architecture summary.
- Current feature status.
- Exact checks run and results.
- Environment blockers.
- Recommended next prompt.
