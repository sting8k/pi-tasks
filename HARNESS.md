# Harness

This repository uses Harness to keep human and agent work explicit, scoped, and verifiable.

```text
User intent
  -> intake / classify
  -> context map
  -> work packet or direct patch
  -> execute
  -> verify
  -> trace / durable record
```

## Start Here

- `AGENTS.md` — stable agent entrypoint and required reading list.
- `docs/HARNESS.md` — canonical Harness operating model.
- `docs/FEATURE_INTAKE.md` — request classification and risk lanes.
- `docs/CONTEXT_RULES.md` — what to read for each phase and lane.
- `docs/GUARDRAILS.md` — durable behavioral rules.
- `docs/ARTIFACTS.md` — doc and artifact naming rules.
- `scripts/README.md` — Harness CLI and durable-layer commands.

## Daily Commands

```bash
scripts/bin/harness-cli init
scripts/bin/harness-cli query matrix
scripts/bin/harness-cli intake --type "Harness improvement" --summary "..." --lane tiny --context "..."
scripts/bin/harness-cli trace --summary "..." --outcome "..."
```

The local durable database is `harness.db` and is intentionally ignored by Git.

## If `docs/` Is Missing

Treat this file as the root pointer, not the full Harness policy. Restore or merge the Harness docs before repo-changing work, then follow the canonical files under `docs/`.
