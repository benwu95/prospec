## Overview

此變更實作了四層分層索引結構 (L0~L3)，將 L0 的指引保留於 `AGENTS.md` / `CLAUDE.md`，並將 L1~L3 提升至專案根目錄的 `prospec/index.md`。透過建立動態掃描與過濾機制，L1 conventions 檔案區分為預設載入 (如 `_conventions.md`, `_diagram-conventions.md`) 與 load-on-demand，藉此精準控管 Token budget，同時消除目前載入時機不明確造成的 context overhead。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| templates | Handlebars 模板渲染，包含知識庫與 Agent 設定 | `knowledge/index.md.hbs`, `agent-configs/entry.md.hbs` | None (pure resources) |
| services | 業務邏輯，負責處理知識庫生成、更新、歸檔流程 | `knowledge.service.ts`, `knowledge-update.service.ts`, `archive.service.ts` | lib, types |
| lib | 基礎建設，包含檔案掃描與 I/O 操作 | `scanner.ts`, `fs-utils.ts` | types |

### Existing Patterns (from _conventions.md)
- Dependency Direction: `cli → services → lib → types`。不能向上 import。
- File Write Pattern: 總是使用 `atomicWrite()` 從 `lib/fs-utils.ts`，絕不直接使用 `fs.writeFileSync()`。
- Content Regeneration: 包含 `prospec:auto-start/end` 與 `prospec:user-start/end` 區塊，使用 `mergeContent()` 或 `mergeManagedDoc()` 保留使用者編輯。

### Architecture Constraints (from Constitution)
- 文件語言需依照 Language Policy 維持 Traditional Chinese (Taiwan)。
- 必須遵循 Test-Driven Development (TDD) 撰寫單元與整合測試。
- 根目錄文件 (`README.md` 等) 若涉及知識架構必須同步更新。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | 修改 `index.md.hbs` 以支援預設載入與非預設清單的分類渲染；更新 `entry.md.hbs` 補上 L0 指引與 `_diagram-conventions.md`。 |
| services | High | `knowledge` 與 `knowledge-update` 調整輸出路徑至根目錄 `prospec/index.md`，實作檔案掃描的預設/非預設過濾；`archive` 確保關聯路徑的相容性。 |
| lib | Medium | 增強或擴充 `scanner.ts` 的輔助函式，支援針對 `_*.md` (排除 `_index.md`) 的抓取與屬性標記。 |
| root config | Low | 手動更新 `README.md` 中提及的結構說明。 |

## Call Chain

**Knowledge Generation (init/update)**
```text
CLI: knowledge / knowledge-update
  → KnowledgeService.execute() / KnowledgeUpdateService.execute()
  → lib/scanner.ts: scanDir({gitTrackedOnly: true})                [讀取 _*.md 檔案列表]
  → KnowledgeService內部邏輯: 過濾 core conventions 與 load-on-demand
  → lib/template.ts: renderTemplate('knowledge/index.md.hbs')       [渲染分層索引]
  → lib/fs-utils.ts: atomicWrite('prospec/index.md')                [寫入根目錄]
```

**Agent Sync (L0 config)**
```text
CLI: agent sync
  → AgentSyncService.execute()
  → lib/template.ts: renderTemplate('agent-configs/entry.md.hbs')   [渲染 L0 指引]
  → lib/content-merger.ts: mergeManagedDoc()                        [保留 user 區塊]
  → lib/fs-utils.ts: atomicWrite('.claude.md' / 'AGENTS.md')
```

## Implementation Steps

1. **擴充 Lib 掃描與過濾邏輯**
   - 於 `lib/scanner.ts` 或對應 helper 中新增常數陣列 `CORE_CONVENTIONS`，包含 `_conventions.md`, `_diagram-conventions.md`, `_glossary.md`, `_playbook.md`, `_status-lifecycle.md`。
   - 建立過濾函式，將掃描到的 `_*.md` 區分為核心預設載入與非核心 load-on-demand 兩組陣列。

2. **更新 Templates**
   - 修改 `src/templates/knowledge/index.md.hbs`：
     - 變更標題與路徑描述。
     - 將 L1 Conventions 區塊拆分為兩個子區塊，依據傳入的兩組陣列進行 `{{#each}}` 渲染。
   - 修改 `src/templates/agent-configs/entry.md.hbs`：
     - 於 Core Resources 加入 `_diagram-conventions.md`。
     - 新增 L0 至 L3 導航的指引說明，引導查看 `prospec/index.md`。

3. **重構 Services (路徑與資料流)**
   - 於 `knowledge.service.ts` 與 `knowledge-update.service.ts` 中：
     - 整合步驟 1 的過濾邏輯，將兩組陣列傳入 template context。
     - 寫入目標路徑從 `prospec/ai-knowledge/_index.md` 變更為 `prospec/index.md`。
   - 檢查 `archive.service.ts`、`upgrade.service.ts` 是否有寫死舊路徑，並對應更新。

4. **調整與新增 Tests**
   - 更新 `knowledge.service.test.ts` 與 `knowledge-update.service.test.ts`，確認過濾邏輯與寫入路徑的正確性。
   - 更新 template contract tests，確保 output 格式符合預期且不遺漏任何核心檔案。

5. **文件更新與清理**
   - 更新 `README.md` 等外部文件中有關知識庫索引的說明。
   - 建立遷移腳本或確保 CLI 執行時舊的 `_index.md` 被正確移除或覆蓋。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent 找不到索引 (context break) | High | 透過修改 `AGENTS.md` (L0) 明確提供指向 `prospec/index.md` 的導航指標，且採用 `--force` 更新確保覆蓋。 |
| 舊版檔案殘留導致混淆 | Medium | 在升級或初始化流程中，加入偵測與刪除舊版 `ai-knowledge/_index.md` 的邏輯。 |
| Template Context 鍵值對應錯誤 | Medium | 於更新 template 時，確實對照 `services` 傳入的 context 屬性名稱 (snake_case)，並加強 contract test 覆蓋率。 |
| 架構分層 (Layering) 違規 | Low | 經檢查，Call Chain 依循 `cli → services → lib` 規則，無違規。 |
