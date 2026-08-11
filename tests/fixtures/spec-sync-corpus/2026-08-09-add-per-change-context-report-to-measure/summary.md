# add-per-change-context-report-to-measure — Archive Summary

- **Archived**: 2026-08-10
- **Original Created**: 2026-08-09T15:18:54.461Z
- **Quality Grade**: A
- **Issue**: issue #142

## User Story

As a Agent 開發者,
I want `prospec measure` 新增一個「一輪變更投影」模式,
So that 我能看見每一次變更真正需要的 Context 固定開銷。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | Add ProjectWorkflowScale and schema |
| lib | Low | Re-exports or dependency |
| services | High | `executeProjection` implementation |
| cli | High | `--project-workflow` arguments |
| templates | Low | Reference formats |
| tests | High | E2E and unit tests |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-MEASURE-013 | ADDED | Per-Change Context Projection Mode |

## Completion

- **Tasks**: 12/13 (92%)
- **Acceptance Criteria**: 3/3

## Review & Verify

- **Review**: 3 round(s), 1 critical / 6 major — Fixed critical quiet flag issue, synchronous file ops in async function, and path traversal vector.
- **Verify**: Grade A, task-completion (PASS), tests (PASS), delta-spec-compliance (PASS), knowledge (WARN), constitution (WARN); pnpm test exited 0
- **Quality Log**: 2 WARN, 1 FAIL
