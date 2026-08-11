# Plan: add-plan-flow-diagram

> 對應 proposal.md（GitHub issue #47）。scale: standard。

## Overview

`/prospec-plan` 目前僅以文字描述計畫。本變更讓 plan 在 user story 較複雜時，於 plan.md 內嵌一張沿用
`_diagram-conventions.md` 慣例的 Mermaid 行為流程圖，聚焦使用者可觀察的分支/決策/狀態，與既有技術性
Call Chain 章節分工互補（REQ-TEMPLATES-059）。

實作為**純模板內容變更**：改寫 `plan-format.hbs`（新增條件式流程圖章節規格）與 `prospec-plan.hbs`
（Phase 4 新增 on-demand 產圖子步驟＋條件式 Gate），並以契約測試釘住規則。產圖子步驟比照既有 Context7
「in-phase／on-demand／不進 Startup Loading」模式，`_diagram-conventions.md` 僅在 Phase 4 按需讀取，
維持 stable-prefix 快取穩定（BL-020）。無 TypeScript 邏輯異動；`prospec agent sync` 重新渲染
`.claude/skills/` 後，本專案自身的 plan skill 亦同步獲得此行為（dogfood）。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|---------------------|---------|--------------|
| templates | Handlebars 範本（skills + references），經 `renderTemplate()` 消費 | `prospec-plan.hbs`、`references/plan-format.hbs` | 無（純資源） |
| tests | 4 層測試金字塔品質閘門 | `tests/contract/skill-format.test.ts` | all |

### Existing Patterns (from _conventions.md)
- 範本純資源、English-only（REQ-TEMPLATES-073）；文件語言取自 Constitution，不寫死於範本。
- On-demand 參考模式：Context7 依賴層步驟示範「in-phase、非 Startup Loading」的加法；本圖比照。
- 契約測試以 `renderTemplate()` 渲染後斷言內容（`skill-format.test.ts`）。

### Architecture Constraints (from Constitution)
- Language Policy [MUST]：範本英文、產出繁中。
- TDD [MUST]：新規則須有能在舊範本下變紅的釘住測試（PB-001）。
- User-Facing Documentation [SHOULD]：skill 行為變動，須評估 root README 是否需同步。

## Affected Modules
| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | `plan-format.hbs` 新增條件式流程圖章節；`prospec-plan.hbs` Phase 4 新增 on-demand 產圖子步驟＋Gate＋NEVER 註記 |
| tests | Medium | `skill-format.test.ts` 新增 section-scoped 契約測試（複雜→產圖規則存在／NEVER-in-Startup-Loading） |

## Call Chain

本變更不動任何程式呼叫路徑，僅改範本內容。唯一相關 entry point 為 sync 時的渲染／部署管線（**維持不變**）：

```
prospec agent sync                                          [cli]
  → agentSync.execute()                                     [services/agent-sync]
  → renderTemplate('skills/prospec-plan.hbs', ctx)          [lib/template → templates(資源)]
  → renderTemplate('skills/references/plan-format.hbs', ctx)
  → atomicWrite('.claude/skills/prospec-plan/{SKILL.md, references/plan-format.md}')   [lib/fs]
```

- 內容型編輯：管線層次不變，無新增跨層型別或提交前副作用；依賴方向 `cli → services → lib → templates(資源)` 保持不變。
- 產圖行為屬「agent 執行期行為」（LLM 依渲染後指示產出），非程式碼呼叫鏈；契約測試釘住的是**指示存在性**，而非執行期輸出（見 Risk）。

## Implementation Steps

1. **`plan-format.hbs`：新增條件式「User Story Flow（Mermaid）」章節**
   - 置於 Call Chain 之後、Implementation Steps 之前。觸發判準採**結構性 any-of 訊號**（符合任一即產圖）：(a) ≥2 個條件分支/決策點；(b) ≥3 階段狀態轉移或多個終止狀態；(c) 跨模組/跨角色且「順序」即理解重點。明列 skip 條件：單一線性 happy path、無實質分支/狀態、或單步驟 CRUD。
   - 以 deliberate-exclusion 措辭載明此為 agent **指引**而非機械閘門（PB-003）；內容為 user story 行為/決策流程；沿用 `_diagram-conventions.md` classDef/節點慣例；圖區塊不計入 120 行 standard 上限。
2. **`prospec-plan.hbs`：Phase 4 新增 on-demand 產圖子步驟**
   - 比照 Context7 段落措辭：達複雜度門檻時按需讀 `_diagram-conventions.md` 並產圖，明確標註「絕不進 Startup Loading / stable prefix」；Phase 4 Gate 增一條件式 checkbox；NEVER 增「線性 story 勿產圖 / 勿把 diagram 參考塞進 Startup Loading」。
3. **契約測試（`tests/contract/skill-format.test.ts`）**
   - Section-scoped 切出新章節斷言特徵內容並 guard 切片非空；斷言 `prospec-plan.hbs` Phase 4 產圖子步驟＋「非 Startup Loading」負向斷言；逐條 mutation-verify（PB-001）。
4. **`prospec agent sync`**
   - 重新渲染 `.claude/skills/prospec-plan/{SKILL.md, references/plan-format.md}`；確認 diff 僅新增章節。
5. **知識同步（同一 feature commit）**
   - 依 PB-005 觸動 `templates`、`tests` 兩模組 README 的實質註記；依 PB-004 確認未新增 `.hbs`/reference 檔（沿用既有檔），README 計數（58 `.hbs` / 19 references）不漂移。

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| 把 `_diagram-conventions.md` 誤加進 Startup Loading，破壞 stable-prefix 快取（BL-020） | High | 產圖步驟固定於 Phase 4 on-demand（Context7 前例）；NEVER 明列；契約測試負向斷言其不在 Startup Loading；startup-loading-baseline 不變 |
| 契約測試假綠（全文 `toContain` 命中無關段落） | Medium | Section-scoped 切片＋結構斷言＋逐條 mutation-verify（PB-001） |
| 文件宣稱與可觀察行為漂移（skill 說產圖但無執行期強制） | Medium | 產圖屬 agent 行為；測試僅釘「指示存在」，以 deliberate-exclusion 措辭載明「執行期輸出不由測試強制」（PB-003） |
| 120 行 standard 上限與圖衝突 | Low | plan-format 明訂圖區塊不計入 standard 上限 |
| README 計數/時間戳漂移 | Low | 同 commit 觸動 templates/tests README 並複核計數（PB-004/005） |
| 設計預設未經即時確認（story 階段 WARN 承接） | Low | 選項已載於 metadata `quality_log`；implement 前使用者仍可覆寫 |

## Constitution Check
- **Language Policy [MUST]** — 範本英文、本文件繁中 → PASS
- **Test-Driven Development [MUST]** — Step 3 契約測試先紅後綠、mutation-verify → PASS（規劃承諾）
- **One-way Dependency [SHOULD]** — 純資源內容編輯，無 import 異動；Call Chain 顯示管線層次不變、無反向/跨層 → PASS（無違反）
- **User-Facing Documentation [SHOULD]** — skill 行為變動；root README 若僅列 skill 觸發/用途則未變，仍須於 implement 複核 → WARN（承接自 story）

## Knowledge Quality Gate
| Check | Result |
|-------|--------|
| Context mode detected | PASS（Brownfield，6 模組） |
| Module Knowledge loaded | PASS（templates + tests README 已讀） |
| Technical Summary synthesized | PASS |
| Feature Specs checked | PASS（sdd-workflow / REQ-TEMPLATES-059 已比對） |
