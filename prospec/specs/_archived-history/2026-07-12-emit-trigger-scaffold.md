# emit-trigger-scaffold — Archive Summary

- **Archived**: 2026-07-12
- **Original Created**: 2026-07-12
- **Quality Grade**: A

## User Story

As a prospec user (and their onboarding agent),
I want the CLI to make `.prospec.yaml` discoverable — a fill-missing `skill_triggers` scaffold and a complete annotated config reference,
So that localization and configuration stop relying on guessing structure or reading a minified binary.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | `agent-triggers` + `config-example` services; `trigger-localization` (`computeUnlocalizedSkills`); agent-sync hint uses the shared source |
| cli | High | `agent triggers` subcommand + `config` group/`example`; 2 formatters; `config` in INIT_COMMANDS |
| types | High | Remove dead config fields (`project.version`, `knowledge.files`+`KNOWLEDGE_FILE_TYPES`, `paths` catchall); `.passthrough()`→`.loose()` |
| templates | Medium | `references/config-example.yaml.hbs`; quickstart/upgrade onboarding steps point to `prospec agent triggers` |
| tests | High | scaffold-YAML round-trip, config-example completeness, onboarding-refs contracts + US-3 backward-compat |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-AGNT-036 | ADDED | `prospec agent triggers` fill-missing scaffold |
| REQ-SERVICES-066 | ADDED | Single-source `computeUnlocalizedSkills` |
| REQ-CLI-021 | ADDED | `prospec config example` complete annotated config |
| REQ-TYPES-062 | ADDED | Config schema carries only live fields + `.loose()` |
| REQ-TESTS-051 | ADDED | config-example completeness contract |
| REQ-TESTS-052 | ADDED | agent-triggers scaffold contract |
| REQ-AGNT-021 | MODIFIED | Population hint points to `prospec agent triggers` |
| REQ-TEMPLATES-108 | MODIFIED | quickstart uses `prospec agent triggers` |
| REQ-TEMPLATES-121 | MODIFIED | upgrade uses `prospec agent triggers` |

## Completion

- **Tasks**: 16/16 code tasks (100%); `[M]` agent-sync + `[V]` mutation-verify both done
- **Acceptance Criteria**: US-1/US-2/US-3 all met

## Review & Verify

- **Review**: 1 round, 0 critical / 3 major — all resolved in-loop (scaffold-YAML guard, schema-derived nested completeness, factual-count sync via `pnpm counts`)
- **Verify**: Grade A — Task/Delta-Spec/Constitution/Test PASS, Knowledge WARN; 2129 tests green, typecheck + lint clean
- **Quality Log**: verify WARN — pre-existing knowledge-health stale READMEs (lib, from committing generated `bundled-templates.ts`); not introduced by this change

## Knowledge Update

Synced at the verify S/A commit prompt: `services`, `cli`, `types`, `templates`, `tests` module READMEs + `module-map.yaml` + `index.md`; factual counts via `pnpm counts`.
