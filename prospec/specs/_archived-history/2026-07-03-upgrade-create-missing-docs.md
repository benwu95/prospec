# upgrade-create-missing-docs — Archive Summary

- **Archived**: 2026-07-03
- **Original Created**: 2026-07-02
- **Quality Grade**: S

## User Story

As a maintainer upgrading the prospec CLI,
I want `prospec upgrade` to directly create any missing init-created doc (rendered from its template, existing docs never overwritten),
So that an already-initialized project obtains newly-added init docs without re-running `prospec init` (which the `.prospec.yaml` gate blocks).

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | New `init-docs.ts` — shared render/context/location helper for `INIT_DOC_REGISTRY` docs |
| services | High | `upgrade` back-fills MISSING docs (`createMissingDocs`, skip-if-exists, best-effort); `init` refactored onto the shared helper (byte-identical) |
| templates | Medium | `prospec-upgrade` skill Step 2 -> enrich created docs + migrate drifted formats; create-missing is the safety net |
| cli | Low | `upgrade-output` lists back-filled docs (`created ...` line) |
| types | Low | `UpgradeReport` gained `createdDocs` (field lives in `services/upgrade.service.ts`) |
| tests | High | init-docs unit, upgrade back-fill (interactive + `--no-interactive`, best-effort, no-overwrite), e2e |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SETUP-024 | ADDED | `prospec upgrade` back-fills missing init docs |
| REQ-LIB-023 | ADDED | Shared `lib/init-docs` render helper |
| REQ-SERVICES-061 | ADDED | Upgrade `createMissingDocs` step (best-effort) |
| REQ-TYPES-051 | ADDED | `UpgradeReport.createdDocs` |
| REQ-TEMPLATES-124 | ADDED | prospec-upgrade skill Step 2 shift |
| REQ-TESTS-037 | ADDED | Back-fill + shared-helper tests |
| REQ-SETUP-019 | MODIFIED | upgrade command now creates missing docs |
| REQ-SERVICES-035 | MODIFIED | orchestrator writes missing curated docs |
| REQ-SETUP-022 | MODIFIED | docs inventory reports post-creation + created list |

## Completion

- **Tasks**: 12/12 code tasks (100%); 1 `[M]` + 3 `[V]` reminders done
- **Acceptance Criteria**: 5/5 (US-1) — verified end-to-end (`prospec upgrade` back-filled this repo's own `prospec/README.md`)
- **Quality**: review-clean (0 critical/major); verify grade S (all 5 dimensions PASS; coverage 96.6%, 1836 tests)

## Knowledge Update

Module READMEs synced this change: `lib`, `services`, `cli`, `templates`, `tests` + `prospec/index.md` (counts + lib/services rows). `types` README unchanged (no `types/` source touched — `createdDocs` lives in `services`).
