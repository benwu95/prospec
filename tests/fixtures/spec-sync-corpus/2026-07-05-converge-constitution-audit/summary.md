# converge-constitution-audit — Archive Summary

- **Archived**: 2026-07-05
- **Original Created**: 2026-07-04T10:46:30Z
- **Quality Grade**: A

## User Story

As a prospec maintainer,
I want the Constitution full audit converged from ≥7 stations to `/prospec-verify`'s single V3/5 station (other stations check only their site-specific rule),
So that per-change Constitution checks drop from ≥7 to one full audit + references, without reducing engineering discipline.

(GitHub issue #66, scope 3. scope 1+2+4 shipped in Change A / mechanize-review-gate, on which this builds.)

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | verify anchored as sole full audit; new-story/plan/tasks/ff/implement Constitution touch → site-specific; review/learn Exit Gate narrowed (quality_log kept); orphaned Constitution `[STABLE]` loads removed (archive/design/backfill-spec/promote-backfill/knowledge-update); ff NEVER-skip dropped |
| tests | Medium | convergence contract assertions (positive + negative + orphaned-load, mutation-verified); startup-loading baseline updated |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-133 | ADDED | Constitution full audit converged to verify single station |
| REQ-TESTS-044 | ADDED | Constitution convergence contract assertions |
| REQ-CHNG-008 | MODIFIED | planning-skill Constitution check → site-specific (was 3+ principles) |
| REQ-TEMPLATES-065 | MODIFIED | non-verify Exit Gate → site-specific scope (quality_log preserved) |

## Completion

- **Tasks**: 11/11 code tasks (100%); 1 `[M]` (build+agent sync) + 1 `[V]` (mutation-verify) done
- **Acceptance Criteria**: both User Stories' scenarios met

## Review & Verify

- **Review**: 1 round, 0 critical / 1 major — major (fixed): verify's "Every other skill" claim overclaimed vs `prospec-explore`'s intentional advisory Constitution Checkpoint (PB-003 claim⊆impl) → scoped to SDD-pipeline skills, explore carved out as a decision aid not a gate. All 7 convergence invariants independently verified (verify sole full audit; no lost coverage; 5 orphaned loads truly unconsumed; Exit Gate quality_log preserved; Startup Loading integrity; Entry-Gate existence checks preserved; contract catches regressions).
- **Verify**: Grade A — 1/5 PASS, 2/5 PASS (4 REQs), 3/5 Constitution MUST all PASS (the convergence self-audits clean), 4/5 knowledge-health 9/9 0 stale, 5/5 WARN (1964/1965; sole fail = pre-existing env e2e `--help` flake, green in isolation), 6 N/A. 1 WARN, 0 FAIL.
- **Quality Log**: review PASS (1 major fixed) + verify A (5/5 flake WARN); no FAIL.

## Knowledge Update

Synced at the verify S/A commit prompt (folded into feat 8449526): `pnpm counts` (test counts 1959→1965, contract 591→597); templates module README bumped with the convergence (no un-graduated REQ ids). Drift 9/9 clean, 0 stale.
