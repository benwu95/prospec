# add-knowledge-flywheel — Archive Summary

- **Archived**: 2026-06-12
- **Original Created**: 2026-06-12
- **Quality Grade**: A (verified)

## User Story

As a worktree-developing SDD maintainer,
I want archiving to auto-harvest a change's recurring lessons into a version-controlled ledger,
So that the feedback-promotion flywheel actually accumulates — `frequency` survives worktree switches/clones instead of resetting to zero.

(US-2: tasks×kind "manual task systematically skipped" process lesson. US-3: knowledge_health review-queue prioritization, write-side stays human.)

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | `prospec-learn`/`prospec-archive`/`promotion-format` .hbs — ledger relocated to VC, archive Phase 4.5 auto-harvest, learn Entry Gate relax, health prioritization, single-source harvest format |
| tests | High | skill-format flywheel contract block (7) + `lessons-harvest` synthetic corpus (3) |
| (knowledge) | Medium | new VC `prospec/ai-knowledge/_lessons-ledger.md` (migrated); `_index.md` + `_playbook.md` updated |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-069 | MODIFIED | Collect reads VC `_lessons-ledger.md` |
| REQ-TEMPLATES-071 | MODIFIED | archive Phase 4.5 auto-harvest (non-fatal/idempotent) + learn Entry Gate ledger-OR-archive |
| REQ-TEMPLATES-072 | MODIFIED | promotion-format single-sources ledger format + Harvest + Prioritization |
| REQ-TEMPLATES-093 | ADDED | VC lessons-ledger artifact + one-time migration + `_index` registration |
| REQ-TEMPLATES-094 | ADDED | tasks×kind manual-skip process-lesson harvest |
| REQ-TEMPLATES-095 | ADDED | knowledge_health review-queue prioritization (never auto-writes `_conventions.md`) |
| REQ-TESTS-025 | ADDED | flywheel contract + synthetic fixture corpus |

## Completion

- **Tasks**: 10/10 code tasks (100%); `[M]` T11 dogfood (exercised by this archive's Phase 4.5) + T13, `[V]` T12/T14 — not counted in the rate
- **Acceptance**: 3 US acceptance scenarios contract-verified; harvest output dogfood-verified (LLM step, deliberate exclusion from vitest)

## Review & Verify

- **Review**: 2 輪對抗式審查，0 critical、4 majors resolved/decided（review-clean）——4 majors 同源於遷移引用掃描不完整（ledger refactor/relocation-reference-sweep-completeness）
- **Verify**: Grade A（verified）；849/849 tests green、tsc + eslint clean
- **Quality Log**: WARN 1（V4 pre-existing cli/lib README staleness，branch-base 4fb3225，非本變更）
- **Source**: summary 內文（`## Quality`）+ _lessons-ledger

## Quality

- **Review**: 2 rounds, 0 critical, 4 majors resolved/decided (review-clean)
- **Verify**: Grade A — the single V4 WARN is PRE-EXISTING cli/lib README staleness (branch-base commit 4fb3225), not this change
- **Tests**: 849/849 green; tsc + eslint clean

## Knowledge Update

Synced at the archive Entry Gate (BL-029):
- `modules/templates/README.md`, `modules/tests/README.md`, `_index.md`
- new `prospec/ai-knowledge/_lessons-ledger.md` (version-controlled accumulating tier, replaces gitignored `.prospec/lessons.md`)

## Notes

- Pure Skill (Architecture C) — zero runtime code; `promotion-format.hbs` single-sources the harvest+ledger format.
- This archive run is the flywheel's first real feed — Phase 4.5 harvests this change's own review residue.
