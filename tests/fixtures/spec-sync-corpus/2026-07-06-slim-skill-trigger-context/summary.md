# slim-skill-trigger-context — Archive Summary

- **Archived**: 2026-07-06
- **Original Created**: 2026-07-05
- **Quality Grade**: S

## User Story

As a prospec 框架維運者暨每個下游 claude session,
I want L0 registry 對 claude 精簡、ff/plan/archive 的 MANDATORY refs 改 per-phase on-demand、knowledge-generate 去除 conventions 內嵌鏡像,
So that 每 session 省 ~1,600 tokens、觸發邊際 context 下降、且消除 ~5.5KB 重複與漂移風險。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `AgentConfig.surfacesSkillFrontmatter`（claude=true、其餘 false）—— entry registry 分流的單一來源 |
| services | Medium | `agent-sync.service` `generateEntryConfig` 把 `surfaces_skill_frontmatter` 塞入 entry render context |
| templates | High | `entry.md.hbs` per-agent registry 分支；ff/plan/archive Startup Loading refs → per-phase on-demand；knowledge-generate Step 4 去鏡像 |
| tests | High | skill-format/skill-contract/agent-sync 契約 agent-aware + per-phase on-demand 引用斷言；startup-loading baseline 同步 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-059 | ADDED | AgentConfig 宣告 agent 是否自動 surface skill frontmatter |
| REQ-AGNT-034 | ADDED | agent-sync 依旗標分流 entry registry render context |
| REQ-AGNT-020 | MODIFIED | Entry Config Language Declaration：registry 依 agent 分流（full table 列 per-skill triggers / claude 精簡） |
| REQ-TEMPLATES-146 | MODIFIED | entry.md.hbs 依 `surfaces_skill_frontmatter` 條件呈現 registry |
| REQ-TEMPLATES-147 | MODIFIED | ff/plan/archive format refs 由 Startup Loading MANDATORY 改 per-phase on-demand |
| REQ-TEMPLATES-148 | MODIFIED | knowledge-generate 移除 Step 4 內嵌 conventions 骨架鏡像 |

## Completion

- **Tasks**: 14/14 code tasks (100%)；另 2 [V] + 1 [M] 已勾
- **Acceptance Criteria**: SC-001~005 全數達成（實測：CLAUDE.md 8727→3084 bytes、AGENTS.md 保留 15 per-skill 表列、deployed ff SKILL.md MANDATORY=0、reference 部署集合不變）

## Review & Verify

- **Review**: 1 round，1 critical / 1 major —— 皆已修正。critical（spec-architecture）：slim CLAUDE.md 牴觸既有 REQ-AGNT-020「per-skill Triggers」條款，已於 delta-spec MODIFIED 收斂並於本次 Phase 3.5 replace-in-place。major（test-quality）：補 plan/archive per-phase on-demand 引用契約斷言。
- **Verify**: Grade S，5/5 dimensions PASS（tasks/spec/constitution/knowledge/tests）；test suite 2062 passed、coverage 96.92% lines / 93.72% branch。
- **Quality Log**: 無未解 WARN/FAIL（review 2 項於同輪修正；drift check 10/10 pass）。

## Knowledge Update

已於 verify S/A commit 同步下列模組 README（描述層，未引未畢業 REQ id）：
- `prospec/ai-knowledge/modules/{types,services,templates,tests}/README.md`
