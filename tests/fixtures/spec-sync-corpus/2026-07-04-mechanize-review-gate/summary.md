# mechanize-review-gate — Archive Summary

- **Archived**: 2026-07-04
- **Original Created**: 2026-07-04T08:52:59Z
- **Quality Grade**: A

## User Story

As a prospec maintainer,
I want review execution to leave a machine-queryable, staleness-aware provenance and verify to block a non-backfill change with no/stale review,
So that the institutional hard gate coincides with the gate that actually catches defects, and residual playbook lessons fall back to the authoring skills' decision points.

(GitHub issue #66, scope 1+2+4; scope 3 Constitution convergence is a follow-up change.)

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `DRIFT_CHECK_IDS` → 9 (append `review-provenance`); optional `review_provenance {digest,date}` on ChangeMetadata |
| lib | High | `computeChangeDigest` (whole-tree content fingerprint, fail-closed) + `collectReviewProvenance` collector + `evaluateReviewProvenance` pure evaluator + `gitCapture` shared helper |
| services | High | check.service injects the collector; `--record-review` writes the review baseline (comment-preserving round-trip; `--change` targets, existsSync-guarded) |
| cli | Low | `prospec check --record-review` + `--change` flags |
| templates | High | verify Entry Gate blocks non-backfill on absent/stale review; review records provenance every round; PB-001/003/006/007 inlined; PB-004/005 retired |
| tests | High | evaluator (6 scenarios) + digest/collector + service + contract; nine-check-id assertion |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-052 | ADDED | Drift report review-provenance check id (9 frozen ids) |
| REQ-TYPES-053 | ADDED | ChangeMetadata review_provenance field |
| REQ-LIB-024 | ADDED | review-provenance collector + evaluator + computeChangeDigest |
| REQ-SERVICES-062 | ADDED | check.service inject + --record-review write path |
| REQ-CLI-012 | ADDED | prospec check --record-review (+ --change) flag |
| REQ-TEMPLATES-130 | ADDED | prospec-review records provenance every round |
| REQ-TEMPLATES-131 | ADDED | prospec-verify Entry Gate blocks absent/stale review |
| REQ-TEMPLATES-132 | ADDED | residual playbook rules fall back to skill gates |
| REQ-TESTS-042 | ADDED | review-provenance engine tests |
| REQ-TESTS-043 | ADDED | gate template contract tests |

## Completion

- **Tasks**: 20/20 code tasks (100%); 1 `[M]` (agent sync) + 1 `[V]` (mutation-verify) done
- **Acceptance Criteria**: all 3 User Stories' scenarios met

## Review & Verify

- **Review**: 1 round, 1 critical / 4 major — critical (fixed): `computeChangeDigest` scoped to a `src`/`tests` allowlist failed **open** for first-party code elsewhere (e.g. `scripts/`) → switched to a whole-tree denylist (fails closed), regression-test-pinned. Majors: `--record-review` gained `--change` targeting + existsSync guard (fixed); single-in-flight-change assumption documented; PB-006 metadata round-trip duplication proposed → verify WARN (follow-up).
- **Verify**: Grade A — 1/5 PASS, 2/5 PASS (10 REQs), 3/5 Constitution MUST all PASS + README-current [SHOULD] WARN, 4/5 knowledge-health 9/9 0 stale, 5/5 WARN (1958/1959; sole fail = pre-existing env e2e `--help` flake, green in isolation), 6 N/A (ui_scope none). 2 WARN, 0 FAIL.
- **Quality Log**: review WARN (M4 DRY follow-up) + verify WARN (README-current SHOULD, e2e flake); no FAIL.

## Knowledge Update

Synced at the verify S/A commit prompt (folded into feat 490a642): `pnpm counts` (test counts 1934→1959); `index.md` + types/lib/services/cli/templates module READMEs (9 check ids + new check/flags, no un-graduated REQ ids). PB-004/005 retired in `_playbook.md` + `_lessons-ledger.md`.
