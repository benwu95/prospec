# fix-init-clobber-add-upgrade — Archive Summary

- **Archived**: 2026-06-22
- **Original Created**: 2026-06-22
- **Quality Grade**: A
- **Commit**: `dd9dec2` (feature) · `47cd2d3` (backlog mark + repo dogfood upgrade)

## User Story

As a prospec user who deleted `.prospec.yaml` to re-localize skill triggers,
I want re-running init to never clobber my curated trust-zone files, and a real version-upgrade path,
So that I never lose curated content and can bring a project up to date when prospec ships a new version.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | `init.service` per-file skip-if-exists guard (P0); new `upgrade.service` (records `version` + agent sync + report, writes no docs); `agent-sync.service` names skills missing triggers |
| cli | Medium | new `upgrade` command + `upgrade-output` formatter; not in INIT_COMMANDS; `.version()` uses PROSPEC_VERSION |
| types | Medium | `version` = the prospec version (no separate `prospec_version`); new `version.ts` (PROSPEC_VERSION) + `canonical-docs.ts`; `SKILL_DEFINITIONS` + prospec-upgrade (entry-excluded) |
| templates | Medium | new `prospec-upgrade.hbs`; `prospec-quickstart.hbs` fill-missing; `prospec-knowledge-update.hbs` Phase 2.5 format-drift consent |
| tests | High | init recovery, upgrade orchestrator, missing-trigger detection, version semantics, entry-exclusion contract; +e2e +integration |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SETUP-018 | ADDED | Init per-file idempotency guard |
| REQ-TYPES-037 | ADDED | `version` field = the prospec version the project uses |
| REQ-TYPES-036 | ADDED | PROSPEC_VERSION single source (leaf `types`) |
| REQ-SERVICES-035 | ADDED | Upgrade orchestrator service (writes no docs) |
| REQ-SETUP-019 | ADDED | `prospec upgrade` command (post-init, not in INIT_COMMANDS) |
| REQ-TYPES-035 | ADDED | SKILL_DEFINITIONS registers prospec-upgrade |
| REQ-TEMPLATES-121 | ADDED | prospec-upgrade skill template (scan init docs + consent) |
| REQ-AGNT-026 | ADDED | User-facing docs reflect prospec-upgrade |
| REQ-TEMPLATES-122 | ADDED | knowledge-update Phase 2.5 format-drift consent |
| REQ-SETUP-004 | MODIFIED | Init now per-file skip-if-exists |
| REQ-AGNT-021 | MODIFIED | agent-sync names skills missing skill_triggers |
| REQ-TYPES-030 | MODIFIED | entry-excluded set = {quickstart, upgrade} |
| REQ-TESTS-029 | MODIFIED | entry-exclusion contract = {quickstart, upgrade}, count 17 |
| REQ-TEMPLATES-108 | MODIFIED | prospec-quickstart fill-missing trigger localization |

## Completion

- **Tasks**: 28/28 code tasks (100%); +1 `[M]` (agent sync) +1 `[V]` (mutation-verify), both done
- **Acceptance Criteria**: all user-story scenarios met; verify 5/5 PASS, drift 8/8, verify:skills 28/28, tests 1760, coverage 96%
- **Dogfood**: ran `prospec upgrade` + `/prospec-upgrade` on this repo — version 1.0→0.3.2, prospec-upgrade triggers localized, init docs untouched

## Review & Verify

- **Review**: iter-2 對抗式 review 揪出 7 處 doc/comment 殘留舊宣稱（version/CLI 重設計後 CLI「re-render canonical docs」等與新契約矛盾），全數更正（README ×2、_index ×2、upgrade.ts/version.ts/canonical-docs.ts 註解；ledger docs/measurement-attribution-overclaim 第 8 度）
- **Verify**: Grade A；verify 5/5 PASS、drift 8/8、verify:skills 28/28、tests 1760、coverage 96%；dogfood `prospec upgrade` + `/prospec-upgrade` 於本 repo
- **Quality Log**: carried advisory 1（`readme-counts` drift 未覆蓋 `_index.md` module-table file counts，pre-existing tooling gap）
- **Source**: summary 內文 + _lessons-ledger

## Notes

- Two iterations: original BL-044 (Grade A) + a user-clarification iteration (version=prospec-version; CLI upgrade scope narrowed to `.prospec.yaml` + agent sync; doc-format refresh moved to the consent-gated `/prospec-upgrade` skill; knowledge-update format consent added).
- Carried advisory (not blocking): `readme-counts` drift check doesn't cover `_index.md` module-table file counts — pre-existing tooling gap, candidate backlog item.

## Knowledge Update

Module READMEs synced this change: `services`, `cli`, `types`, `templates`, `tests` (+ module-map keywords).
