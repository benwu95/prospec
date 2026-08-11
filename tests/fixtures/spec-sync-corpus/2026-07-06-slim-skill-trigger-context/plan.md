# Plan: slim-skill-trigger-context

## Overview

本 change 為純 context 減量重構，分三 scope：(1) `entry.md.hbs` 依「agent 是否自動 surface skill frontmatter」分流 registry——claude 精簡、codex/copilot/antigravity 保留完整表；(2) ff/plan/archive 的 format references 由 Startup Loading `[STABLE] MANDATORY` 改為 per-phase on-demand；(3) knowledge-generate 刪除 Step 4 內嵌 README 骨架鏡像、只指向 canonical `_module-readme-conventions.md`。

策略上採「單一來源旗標 + 模板條件分支」達成 scope 1（新旗標落在 types 的 `AGENT_CONFIGS`、由 agent-sync 於 render context 傳入、`entry.md.hbs` 內分支——不重建 per-agent 模板）；scope 2/3 為純模板內容改寫，比照 in-repo 三個既有 on-demand 先例（archive promotion-format、verify debug-recovery、design adapter 四選一）。行為契約先以測試釘住（RED）再改模板（GREEN）。

## Technical Summary

> Auto-synthesized from AI Knowledge（Brownfield：6 模組皆有 README）

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| types | Zod schemas + 詞彙單一來源 | `AgentConfig`、`AGENT_CONFIGS`（`src/types/skill.ts`） | — |
| services | 業務邏輯（execute 模式） | `agent-sync.service` `generateEntryConfig` / `syncSkillsDirSkills` | types, lib |
| templates | Handlebars 模板資源 | `agent-configs/entry.md.hbs`、`skills/prospec-{ff,plan,archive,knowledge-generate}.hbs` | — |
| tests | 生成契約 + fixture | `contract/skill-format.test.ts`、`fixtures/startup-loading-baseline.json`、`integration/skill-contract.test.ts` | 全層 |

### Existing Patterns (from _conventions.md)
- Content Regeneration：entry config 走 `mergeManagedDoc`（`prospec:auto`/`user` 區塊）；只改 auto 區塊內容。
- Template Conventions：變數 `snake_case`；模板僅經 `renderTemplate()` 存取。
- 單一來源：詞彙/旗標集中於 types（PB-006）；新 consumer 先找 canonical resolver（PB-007）。

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types`：旗標在 types、被 services 讀取、傳入 template context——向下，無違反。
- TDD：契約測試先行、覆蓋率 ≥ 80%。
- User-Facing Docs [SHOULD]：若 README 描述 registry / references 載入行為，於同一 change 更新。

## Affected Modules
| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | `AgentConfig` 新增 `surfacesSkillFrontmatter` 旗標；`AGENT_CONFIGS` 設 claude=true、其餘=false |
| services | Medium | `generateEntryConfig` 把旗標塞入 entry render context（per-agent） |
| templates | High | entry.md.hbs 分流；ff/plan/archive Startup Loading refs → on-demand；knowledge-generate 去鏡像 |
| tests | High | skill-format 斷言改 agent-aware；同步 startup-loading-baseline；skill-contract 分 claude/AGENTS.md |

## Call Chain

`prospec agent sync`（scope 1 唯一涉服務邏輯的入口）
  → `agentSync.execute(options)`                                    [orchestration]
  → group agents by `skillPath\nconfigPath` signature              [既有分組]
  → `syncAgent(agentConfig, ...)`
  → `generateEntryConfig(agentConfig, templateContext)`            [注入 surfaces_skill_frontmatter]
  → `renderTemplate('agent-configs/entry.md.hbs', {..., skill_path, surfaces_skill_frontmatter})`
  → `mergeManagedDoc(generated, existing)` → `atomicWrite(CLAUDE.md | AGENTS.md)`  [side effect]

> scope 2/3 為 `syncSkillsDirSkills → renderTemplate('skills/*.hbs') → atomicWrite(SKILL.md)`，純模板內容變更、無服務邏輯改動、無新 call chain。

## Implementation Steps

1. **測試先行（RED）**
   - 更新 `contract/skill-format.test.ts`：entry Triggers/References 斷言改 agent-aware（完整表只驗 AGENTS.md render；claude 驗精簡段）；Startup Loading baseline 的 MANDATORY-count 對 ff/plan/archive 期望值改 0。
   - 更新 `fixtures/startup-loading-baseline.json`：ff（mandatory 1→0、移除該 item）、plan（2→0、移除 2 items）、archive（3→0、移除 3 items）；knowledge-generate 不動。
   - 更新 `integration/skill-contract.test.ts` [A]：CLAUDE.md 不再含逐 skill references 路徑、AGENTS.md 仍含。
   - 更新 `unit/services/agent-sync.service.test.ts`：entry render 的 per-agent skills/flag 期望。

2. **types：單一來源旗標**
   - `AgentConfig` 介面加 `surfacesSkillFrontmatter: boolean`；`AGENT_CONFIGS` claude=true、codex/copilot/antigravity=false。

3. **services：傳入旗標**
   - `generateEntryConfig` 於 render context 加 `surfaces_skill_frontmatter: agentConfig.surfacesSkillFrontmatter`（sweep `AgentConfig` 其他 consumer，PB-007）。

4. **templates scope 1：entry.md.hbs 分流**
   - `{{#if surfaces_skill_frontmatter}}` → 精簡段（≤300 bytes，「skills 透過 `/prospec-*` 觸發、自帶描述」）；`{{else}}` → 保留現有 `{{#each skills}}` 完整表。

5. **templates scope 2：ff/plan/archive refs → on-demand**
   - 三模板 Startup Loading 移除 `**MANDATORY**` format-refs 項；於各對應 phase 段落加 on-demand 讀取指令，措辭比照先例、明示「非 Startup Loading 項」。**on-demand 行置於編號清單之外**，避免 PB-001 的清單連續性被打斷。

6. **templates scope 3：knowledge-generate 去鏡像**
   - 刪 Step 4 內嵌 Recipe-First 骨架（`src/templates/skills/prospec-knowledge-generate.hbs`），改為一行指向 canonical；保留 Startup Loading 對 `_module-readme-conventions.md` 的載入。

7. **GREEN + 知識同步**
   - `pnpm build`（模板隨套件出貨，需 rebuild dist 供 CLI 用）、`pnpm test` 全綠、`pnpm counts:check`；bump types/services/templates/tests 四個 module README（PB-005，同一 feature commit）；檢查根 `README.md`/`README.zh-TW.md` 是否描述 registry/references 載入行為需同步。

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Startup Loading 改寫打斷 baseline 編號清單連續性（PB-001，曾靜默降級 5 項） | High | on-demand 指令置於編號清單外；同步更新 baseline fixture；跑 contract 的 contiguity/item-set 斷言驗證 |
| claude 精簡後 references 路徑資訊遺失 | Medium | 精簡只施 claude（Claude Code 自動 surface frontmatter，且 SKILL.md body 本就連結 references）；AGENTS.md 保留完整表含 References 行 |
| 誤以重建 per-agent 模板達成分流 | Medium | 契約測試明文禁止 per-agent `.hbs`；一律在單一 entry.md.hbs 內分支 |
| source-only commit 導致 knowledge-health 轉 stale（PB-005） | Medium | 同 commit bump 四個 module README（真實 on-topic 註記，不造假時間戳） |
| on-demand 化縮短 cache 前綴（取捨） | Low | 前綴 cache 效益尚無量測、context 佔用確定；proposal 已以 deliberate 措辭記錄取捨（PB-003） |
| reference 部署集合意外變動 | Low | 僅改「何時讀」不改 `getSkillReferences` map；skill-contract 的 ref 數量/存在性斷言把關 |

## Knowledge Quality Gate

PASS — Brownfield 模式；相關模組（types/services/templates/tests）知識已載入（exploration 精確 map + index + _conventions + 相關 PB-001/003/005/006/007）；Technical Summary 已綜整；既有 Feature Spec（agent-integration，含 REQ-TEMPLATES-080 Startup Loading 先例）已核對。
