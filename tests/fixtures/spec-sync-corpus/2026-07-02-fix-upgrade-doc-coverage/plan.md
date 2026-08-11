# Plan: fix-upgrade-doc-coverage

## Overview

本變更修復 issue #48：升級流程未涵蓋所有 init 建立的文件——`/prospec-upgrade` skill 範本內寫死的掃描清單與 init 的權威清單漂移（`_glossary.md` 被遺漏），且沒有補建缺少檔案的步驟。

實作策略是把「init 建立哪些 curated 文件」抽為單一事實來源：`types/conventions.ts` 新增 init-doc registry（base_dir 相對路徑 + 對應範本），init 與 upgrade 共同消費。`upgrade.service` 依 registry 逐檔檢查存在性、將 docs inventory 納入 report；skill Step 2 改為消費 report 清單（present → diff＋逐檔同意；missing → 詢問補建）。CLI 維持只報告不寫 curated doc 的既有不變式。contract test 鎖住「init 實際產出集合 == registry 集合」，未來清單漂移直接轉紅（PB-006）。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| types | Zod schemas + 常數單一來源 | `CANONICAL_CONVENTION_DOCS`、`USER_MANAGED_CONVENTION_DOCS`（conventions.ts） | zod only（leaf） |
| services | 業務邏輯 `execute()` pattern | `upgrade.execute()`、`init.execute()` | types, lib |
| cli | parse → execute → format | `formatUpgradeOutput(result, logLevel)` | types, services |
| templates | Handlebars 純資源 | `skills/prospec-upgrade.hbs` | —（lib/template.ts 消費） |
| tests | 4 層測試金字塔 | unit / contract / integration / e2e | all |

### Existing Patterns (from _conventions.md / module READMEs)

- Service Result 介面變更 → 連動 CLI formatter 與單元測試斷言（services 修改指南 #2）
- contract 斷言須 section-scoped＋structure-aware 並 mutation-verify（PB-001）
- skill 範本 English-only；改動後需 `prospec agent sync` 重新部署鏡像
- `upgrade.service` 唯一 `ai-knowledge/` 寫入是可重生的 `raw-scan.md`——本變更不得新增任何寫入

### Architecture Constraints (from Constitution)

- 相依方向 `cli → services → lib → types`：registry 置於 leaf `types`，services 向下 import
- TDD：contract 等式測試與單元測試先行（RED → GREEN）

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | conventions.ts 新增 init-doc registry（路徑 + 範本對應） |
| services | High | init 消費 registry（行為不變）；upgrade 建 inventory 入 report |
| cli | Low | upgrade-output 新增 docs inventory 區段（可解析行格式） |
| templates | High | prospec-upgrade.hbs Step 2 改寫為消費 report inventory |
| tests | Medium | contract 等式測試（新）＋ unit / contract / integration / e2e 更新 |

## Call Chain

prospec upgrade
  → registerUpgradeCommand.action(options)                 [cli/commands/upgrade.ts]
  → upgrade.service.execute({ cwd, interactive })          [orchestration]
  → readConfig(cwd) → resolveBasePaths(config)             [lib]
  → buildDocsInventory(basePaths)                          [new — INIT_DOC_REGISTRY × existsSync]
  → agentSync.execute / generateRawScan                    [siblings，不變]
  → buildReport(…) + docs: DocInventoryEntry[]
  → formatUpgradeOutput(result, logLevel)                  [cli formatter — 新增 docs 區段]

/prospec-upgrade (skill)
  → Step 1: 跑 `prospec upgrade --no-interactive`、解析 report（含 docs inventory）
  → Step 2: 逐檔依 inventory — present → diff 最新範本＋同意後更新；missing → 同意後自範本建立
            （index.md missing 且 legacy `_index.md` 存在 → 沿用遷移分支）

## Implementation Steps

1. **types：init-doc registry（TDD 先行）**
   - `conventions.ts` 新增 `INIT_DOC_REGISTRY`：7 份 curated 文件的 base_dir 相對路徑（`CONSTITUTION.md`、`index.md`、`ai-knowledge/_conventions.md`、`_diagram-conventions.md`、`_glossary.md`、`_status-lifecycle.md`、`_module-readme-conventions.md`）＋對應 `.hbs` 範本名
   - 排除 `AGENTS.md`（agent-sync 擁有、zone-1）與 `specs/.gitkeep`（非文件）

2. **services：init 消費 registry、upgrade 建 inventory**
   - `init.service` 的文件清單改自 registry 推導（per-file skip-if-exists 與寫入順序不變）
   - `upgrade.service` 新增 `buildDocsInventory()`：逐檔 `existsSync` → `UpgradeReport` 增 `docs` 欄位；不新增任何寫入

3. **cli：formatter 輸出 docs 區段**
   - `upgrade-output.ts` 逐檔輸出 `present`/`missing` 行（可解析、經 sanitize 慣例），missing > 0 時提示 `/prospec-upgrade` 會處理

4. **templates：skill Step 2 改寫**
   - 移除寫死清單；改為讀取 report docs 區段逐檔處理（present → diff＋同意；missing → 同意後建立）
   - 保留 legacy `_index.md` 遷移分支與「套件範本不可得 → graceful skip」
   - report 無 docs 區段（版本錯位）→ 停止 doc-refresh 並提示重跑 `prospec upgrade`

5. **tests：等式契約與全層更新**
   - contract：memfs 跑 `init.execute` → 實際建立的 curated 文件集合 == registry 路徑集合（mutation-verify：自 registry 移除一項須轉紅）
   - unit：upgrade report 缺 `_glossary.md` fixture → marked missing；既有「CURATED doc byte 不變」全數維持
   - contract（skill-format）：prospec-upgrade 的 section-scoped 斷言改為驗證「消費 inventory、無寫死清單」
   - integration / e2e：upgrade-flow 與 CLI report 輸出斷言更新

6. **文件與部署收尾**
   - 更新根層級 `README.md`（CLI report 描述與 skill 段落、指令表）
   - `prospec agent sync` 重新部署 skill 鏡像

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| init 清單重構破壞 per-file skip-if-exists 行為 | High | init 既有單元測試全保留；重構只換清單來源、不動寫入邏輯 |
| report 行格式變動破壞 skill 解析 | Medium | docs 區段行格式固定並由 e2e 斷言鎖定；skill 含版本錯位 fallback |
| skill-format 契約斷言 false-green | Medium | 依 PB-001 section-scoped＋mutation-verify 新斷言 |
| registry 與範本檔名對不上（Handlebars 靜默空輸出） | Medium | 等式契約測試同時驗證範本可渲染（render 實際範本） |
