# generate-factual-counts — Archive Summary

- **Archived**: 2026-07-04
- **Original Created**: 2026-07-04
- **Quality Grade**: A
- **Scale**: quick · **Issue**: #65 (part a) · **Commit**: c816ddf (branch `benwu95/feat/generate-factual-counts`)

## User Story

As a maintainer keeping prospec's READMEs and `prospec/index.md` consistent with the code,
I want a deterministic `pnpm counts` script that re-derives every factual count from a single source and rewrites each copy in place,
So that factual counts have one generation source and the `docs/duplicated-count-drift` (PB-004) manual re-derivation stops recurring.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| scripts/ (non-knowledge dev tooling) | High | New `scripts/counts/` (types, rewrite, derive, registry, sync) + `scripts/sync-counts.ts` entry; `pnpm counts` / `pnpm counts:check` |
| tests | Medium | 4 new `tests/unit/scripts/counts-*.test.ts` (64 tests) — pure rewrite/derive, registry↔docs completeness guard, idempotency, honest skip, mutation-verify |
| docs (root, non-module) | Low | README.md + README.zh-TW.md dev-doc; counts synced across README×2 / index.md / tests README (dogfood) |

## Requirements

No delta-spec (scale: quick). **Quick spec-impact check: no impact** — `pnpm counts` is repo-internal
dev tooling (scripts/ is excluded from the npm `files` list), not a shipped `prospec` CLI capability;
no `prospec/specs/features/` REQ covers it (drift-detection owns the shipped, read-only `prospec check`,
a separate surface). Graduation skipped per the Entry Gate diagnostic.

## Completion

- **Tasks**: code tasks 100% complete (the one conditional task — export a fenced-block helper — was
  evaluated and not needed: anchors are tight enough, so `lib` was untouched). `[M]` dogfood done; `[V]` mutation-verify done.
- **Acceptance Criteria**: US-1 met — `pnpm counts` rewrites in place (dogfood synced 14 counts:
  tests 1865→1926, unit 1204→1265, files 78→82); `pnpm counts:check` exit 0 when synced; idempotent.

## Review & Verify

- **Review**: 1 round, 0 critical / 2 major (both fixed) — (1) `--check` CI gate now fails closed
  (exit 1 on drift OR an unavailable count source; extracted pure `checkFailed` + 3 tests);
  (2) registry completeness guard tightened to `toBe(1)` to enforce the "anchor matches exactly one
  line" invariant. Data-integrity lens confirmed sound: only the 5 registry docs are reachable;
  `_lessons-ledger` / `_archived-history` / `.prospec/changes` are structurally unreachable (test-enforced).
- **Verify**: Grade A — 1/5 tasks PASS, 2/5 delta-spec not-applicable (quick), 3/5 Constitution full-audit
  PASS, 4/5 knowledge-health PASS (0 stale, 6/6 documented), 5/5 tests WARN, 6 design skipped (ui_scope none).
  drift check 8/8 PASS. Test suite: change's 64 tests pass; full suite 1928/1929.
- **Quality Log**: review PASS (2 majors fixed); verify A. One known **environmental** WARN —
  `tests/e2e/cli.test.ts` "prospec --help" times out at 5000ms under full-suite parallel load
  (pre-existing; failed identically before the review fixes; passes 43/43 in isolation; the change
  touches no `cli/` code). Not a regression.

## Knowledge Update

- `prospec/ai-knowledge/modules/tests/README.md` — test count reflects the new tests (82 files / 1,926);
  committed in the same commit as the test files, so `knowledge-health` shows 0 stale (the counts tool
  incidentally kept the module README fresh — the PB-005 friction did not trigger for this change).
- No module README needed for `scripts/counts/` — `scripts/` is dev tooling, not a knowledge module
  (same as the existing `scripts/measure/` harness).
- **PB-004 note**: this change is the structural fix for `docs/duplicated-count-drift` — its recurrence
  was NOT incremented this archive (the tool prevented any count-drift finding). Governance/closure is
  a human `/prospec-learn` decision, not auto-harvest.
