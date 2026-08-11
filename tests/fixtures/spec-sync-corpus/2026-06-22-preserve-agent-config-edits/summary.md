# preserve-agent-config-edits — Archive Summary

- **Archived**: 2026-06-22
- **Original Created**: 2026-06-22
- **Quality Grade**: S
- **Scale**: full

## User Story

As a developer maintaining custom instructions in agent config files,
I want `prospec init` and `prospec agent sync` to preserve my hand-written content,
So that init / sync / quickstart / upgrade never destroy my custom agent instructions.

(US-1 agent sync 保留手寫內容；US-2 init 遷移既有 AGENTS.md 而非略過)

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `content-merger`: new `mergeManagedDoc` + shared `hasAutoBlock`/`replaceAutoBlock`; `fs-utils`: new `readFileIfExists` |
| services | High | `agent-sync.generateEntryConfig` + `init` write loop now merge via the auto/user block contract; `knowledge`/`knowledge-update` adopt `readFileIfExists` + shared auto-block helpers |
| templates | Medium | `entry.md.hbs` + `init/agents.md.hbs` wrapped in `prospec:auto`/`prospec:user` blocks |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-021 | ADDED | Managed-doc block merge primitive (`mergeManagedDoc` + `hasAutoBlock`/`replaceAutoBlock`) |
| REQ-AGNT-027 | ADDED | Entry config auto/user block merge (agent sync no longer clobbers) |
| REQ-TEMPLATES-123 | ADDED | Agent config templates carry the block markers |
| REQ-AGNT-008 | MODIFIED | Idempotent Update → block-aware merge (preserve user block; migrate marker-less) |
| REQ-SETUP-018 | MODIFIED | Init per-file guard → AGENTS.md merged (managed) while trust-zone keeps skip-if-exists |

> Planning used REQ-LIB-014 / REQ-AGNT-023 / REQ-TEMPLATES-104; renumbered at archive to free IDs (collisions with drift-detection / agent-integration / sdd-workflow).

## Completion

- **Code Tasks**: 10/10 (100%) + 1 `[V]` verification task done
- **Acceptance Criteria**: US-1 & US-2 scenarios all met (unit + integration + real-CLI e2e)
- **Tests**: 1786 passing; coverage 96.01%; typecheck/lint clean
- **Commits**: `feat 6d20b16` + `refactor 099eb18` (DRY: dedupe auto-block swap, adopt `readFileIfExists` across knowledge services — resolves both review majors)

## Knowledge Update

Synced for this change before archive:
- `prospec/ai-knowledge/modules/lib/README.md`
- `prospec/ai-knowledge/modules/services/README.md`
- `prospec/ai-knowledge/modules/templates/README.md`
