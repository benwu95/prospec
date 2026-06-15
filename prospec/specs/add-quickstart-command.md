# add-quickstart-command — Archive Summary

- **Archived**: 2026-06-15
- **Original Created**: 2026-06-15
- **Quality Grade**: A (Ready to deploy)
- **Commit**: ae3cbf6

## User Story

As a developer onboarding prospec onto a brownfield project,
I want one CLI command plus one slash command to finish setup,
So that onboarding is 2 typed steps even for non-English projects — without a manual trigger-translation detour.

(OPT-A4. The CLI→agent context switch is the irreducible floor because AI Knowledge generation requires an LLM reading source — a pure CLI cannot eliminate it.)

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `SkillConfig.excludeFromEntryConfig`; `SKILL_DEFINITIONS` +prospec-quickstart (13→14) |
| services | High | New `quickstart.service.ts` (init catch-skip + agent-sync); agent-sync entry-config render filters excludeFromEntryConfig skills |
| cli | Medium | New `quickstart` command + formatter; registered in `INIT_COMMANDS` |
| templates | Medium | New `prospec-quickstart.hbs` onboarding skill |
| tests | High | quickstart.service unit, mutation-verified entry exclusion, skill-format 14, quickstart e2e |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SETUP-017 | ADDED | `prospec quickstart` one-command onboarding (INIT_COMMANDS, re-run skip, clear missing-agents error) |
| REQ-SERVICES-028 | ADDED | Quickstart orchestrator service (init + agent-sync, hints; no knowledge-init) |
| REQ-TYPES-030 | ADDED | `SkillConfig.excludeFromEntryConfig` + prospec-quickstart skill definition |
| REQ-AGNT-023 | ADDED | Entry config excludes excludeFromEntryConfig skills; SKILL.md still deployed |
| REQ-TEMPLATES-108 | ADDED | `/prospec-quickstart` skill template (probe CLI, localize triggers on confirm, re-sync, knowledge init, chain to knowledge-generate; graceful fallback) |
| REQ-TESTS-029 | ADDED | Mutation-verified entry-config exclusion contract test |

## Completion

- **Tasks**: 16/16 code (100%); 1 `[M]` + 2 `[V]` complete
- **Acceptance Criteria**: 3/3 User Stories met (verify Grade A)
- **Tests**: 1061/1061; typecheck 0; lint 0; build clean; PB-001 mutation-verified
- **Review**: 0 critical; 3 major + 1 nit all fixed

## Knowledge Update

Module READMEs (types/services/cli/templates/tests) + `_index.md` + `_conventions.md` synced in the feature commit (drift `knowledge_health` 6/6 fresh). REQ-ID provenance lives in the Feature Specs (project-setup, agent-integration) as of this archive.

## Downstream

Ships **OPT-A4** → unblocks the "after OPT-A4 ships" gate on **BL-032** (`add-reverse-spec-extraction`, status: plan).
