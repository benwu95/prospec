# enforce-group-render-merge — Archive Summary

- **Archived**: 2026-08-14
- **Original Created**: 2026-08-14
- **Quality Grade**: S
- **Issue**: 134

## User Story

As a prospec maintainer（agent-config 作者），
I want 群組共用的 `AGENTS.md` render flag 依「所有成員合併」渲染，且合併語意成為型別層義務，
So that 任一成員 `surfacesSkillFrontmatter=false` 時共用檔仍渲染完整 skill 表，且日後新增 render flag 漏給合併語意為編譯錯誤。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | 新增 `AgentRenderFlags`、`GROUP_RENDER_FLAG_REDUCERS`（mapped-type registry）、`mergeGroupRenderFlags`、`RENDER_FLAG_KEYS`/`AssertNever`；`AgentConfig extends AgentRenderFlags` |
| services | Medium | `agent-sync` `execute()` 群組層 `mergeGroupRenderFlags` + `renderFlagContext`；`generateEntryConfig` 不再讀 `configs[0]` 旗標 |
| tests | Medium | reducer 單元（中間成員/交換律/單成員/空）＋渲染級（降級中間成員）＋REQ-TYPES-059 回歸 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-085 | ADDED | 群組 render-flag 合併 + 編譯期 reducer 義務（mapped over `keyof AgentRenderFlags`） |
| REQ-TYPES-059 | MODIFIED | `surfacesSkillFrontmatter` 移入 `AgentRenderFlags`（每成員輸入、路由用合併值） |
| REQ-AGNT-034 | MODIFIED | `generateEntryConfig` 由群組合併值渲染、非 `configs[0]`（任一成員 false→保守 full table） |

## Completion

- **Tasks**: 10/10 code (100%)（另 [V]×2、[M]×2 皆完成）
- **Acceptance Criteria**: US-1 3/3、US-2 3/3

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — review-clean（fresh-context，涵蓋 correctness/security/spec-architecture/parallel-site(PB-007)/test-quality(PB-001)/docs-claims；PB-007 掃描確認唯一 `configs[0]` render 讀取已移除、`init.service` 的 `entry.md.hbs` 渲染走 REQ-TEMPLATES-146 保守 full-table 分支不受影響）
- **Verify**: Grade **S**；machine `task-completion`/`knowledge`/`tests` 全 PASS，judgment `delta-spec-compliance` PASS(fresh)/`constitution` PASS(8/8 rules)/`design` not-applicable；`pnpm test` 3883 passed exit 0
- **Quality Log**: no WARN/FAIL

## Knowledge Update

- `prospec/ai-knowledge/modules/types/frozen-registries.md`（已同步）
- `prospec/ai-knowledge/modules/services/README.md`（已同步）
