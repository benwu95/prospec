# centralize-index-column-schema — Archive Summary

- **Archived**: 2026-06-14
- **Original Created**: 2026-06-14
- **Quality Grade**: S
- **Scale**: full

## User Story

As a prospec maintainer, I want the `_index.md` 7-column schema defined in one shared constant that every generator / scaffold / parser consumes, so that aligning or evolving columns is a one-place change and this drift class cannot recur.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | New `knowledge.ts` — canonical column constant (the single source) |
| lib | Medium | `knowledge-reader.parseIndexModules` sources labels from the constant |
| services | High | knowledge-update emitter, init/knowledge/knowledge-init injection, change-story parser |
| templates | Medium | init/knowledge index templates inject header; module-readme + knowledge-generate Dependencies labels |
| tests | Medium | constant lock + contract + unit tests (944 → 955) |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-020 | ADDED | Canonical index-table column schema, single source (types) |
| REQ-KNOW-021 | ADDED | Module README Dependencies canonical `**Depends on:**`/`**Used by:**` labels |
| REQ-KNOW-005 | MODIFIED | 7 columns incl. Aliases; header derived from the constant |
| REQ-CHNG-003 | MODIFIED | Position-stable parse; Description from the canonical column index |

## Completion

- **Tasks**: code tasks 100% (T1–T10, T12) + 4 review fixes (R1–R3, R-fix); 2 `[V]` done
- **Acceptance Criteria**: 4 INVEST stories, all scenarios met
- **Quality**: review-clean (2 rounds, 0 critical, 3 majors fixed) → verify Grade S (5+1 all PASS); 955 tests green, typecheck clean

## Knowledge Update

Synced at this archive (Entry Gate):
- `prospec/ai-knowledge/modules/types/README.md` (+ canonical column constant)
- `prospec/ai-knowledge/modules/tests/README.md` (944 → 955)
- `prospec/ai-knowledge/_index.md` (types + tests rows)

## Notes

- Approach A: render services inject header/separator from the constant into `.hbs`; genuinely-static skill-doc examples are contract-test-locked.
- The adversarial review earned its keep — it caught a third schema consumer (`lib/knowledge-reader`) and the knowledge-index format hint, both then migrated to the constant.
- Code committed separately at verify S/A (commit `3ea62e8`); this archive's spec/knowledge sync is the follow-up commit.
